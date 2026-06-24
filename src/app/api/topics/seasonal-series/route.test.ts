import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/topics/seasonal-series 라우트 테스트 (발굴형).
 * 매장+월만 받아 discoverSeasonalKeywords에 위임한다.
 * zod 검증·매장 해석·월 기본값(다음 달)·위임을 무비용으로 검증한다(발굴 IO는 mock).
 */

vi.mock("@/lib/data/shops", () => ({
  getShopById: vi.fn(async (id: string) =>
    id === "top50jn" ? { id, name: "탑안경", blogId: "top50jn", rssUrl: "x" } : null
  ),
}));
vi.mock("@/lib/topics/seasonalDiscovery", () => ({
  discoverSeasonalKeywords: vi.fn(async (p: { shopId: string; month: number }) => ({
    shopId: p.shopId,
    month: p.month,
    volumeTop: [
      { keyword: "선글라스", categoryId: "lenses", categoryName: "안경렌즈", seasonScore: 95, monthlyVolume: 5000, peakMonth: 7, isPeakMonth: true, estimatedMonthlyDemand: 4750, seasonalLift: 3.2 },
    ],
    issueTop: [
      { keyword: "선글라스", categoryId: "lenses", categoryName: "안경렌즈", seasonScore: 95, monthlyVolume: 5000, peakMonth: 7, isPeakMonth: true, estimatedMonthlyDemand: 4750, seasonalLift: 3.2 },
    ],
    notes: [],
  })),
}));

vi.mock("@/lib/trends/googleTrends", () => ({
  fetchGoogleTrendsKR: vi.fn(async () => [{ keyword: "트렌드", trafficLabel: "1000+" }]),
}));

import { POST } from "./route";
import { discoverSeasonalKeywords } from "@/lib/topics/seasonalDiscovery";

function req(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks는 mockResolvedValue 구현을 지우지 않으므로 매 테스트 기본 구현 복원.
  vi.mocked(discoverSeasonalKeywords).mockImplementation(async (p) => ({
    shopId: p.shopId,
    month: p.month,
    volumeTop: [
      { keyword: "선글라스", categoryId: "lenses", categoryName: "안경렌즈", seasonScore: 95, monthlyVolume: 5000, peakMonth: 7, isPeakMonth: true, estimatedMonthlyDemand: 4750, seasonalLift: 3.2 },
    ],
    issueTop: [
      { keyword: "변색렌즈", categoryId: "lenses", categoryName: "안경렌즈", seasonScore: 80, monthlyVolume: 3000, peakMonth: 7, isPeakMonth: true, estimatedMonthlyDemand: 2400, seasonalLift: 2.7 },
    ],
    notes: [],
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("/api/topics/seasonal-series POST", () => {
  it("shopId 없으면 400(zod)", async () => {
    const res = await POST(req({ month: 7 }));
    expect(res.status).toBe(400);
  });

  it("잘못된 shopId면 400", async () => {
    const res = await POST(req({ shopId: "nope", month: 7 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("shopId");
  });

  it("유효 입력이면 볼륨/이슈 두 리스트를 발굴해 돌려준다", async () => {
    const res = await POST(req({ shopId: "top50jn", month: 7 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.month).toBe(7);
    expect(json.data.volumeTop[0].keyword).toBe("선글라스");
    expect(json.data.issueTop[0].keyword).toBe("변색렌즈");
    expect(json.data.trendingNow[0].keyword).toBe("트렌드");
    expect(discoverSeasonalKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "top50jn", month: 7 })
    );
  });

  it("month 생략 시 다음 달로 기본 설정한다", async () => {
    const res = await POST(req({ shopId: "top50jn" }));
    expect(res.status).toBe(200);
    const now = new Date();
    const expectedMonth = ((now.getMonth() + 1) % 12) + 1;
    expect(vi.mocked(discoverSeasonalKeywords).mock.calls[0][0].month).toBe(expectedMonth);
  });

  it("발굴 IO가 던지면 500", async () => {
    vi.mocked(discoverSeasonalKeywords).mockRejectedValue(new Error("boom"));
    const res = await POST(req({ shopId: "top50jn", month: 7 }));
    expect(res.status).toBe(500);
  });
});
