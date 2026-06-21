import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/topics/seasonal-series 라우트 테스트.
 * 외부 데이터 3종(시즌곡선·검색량·자기잠식)과 getShopById를 mock해
 * zod 검증·매장/카테고리 해석·후보 조립·엔진 위임·폴백을 무비용 검증한다.
 */

vi.mock("@/lib/data/shops", () => ({
  getShopById: vi.fn(async (id: string) =>
    id === "top50jn" ? { id, name: "탑안경", blogId: "top50jn", rssUrl: "x" } : null
  ),
}));
vi.mock("@/lib/constants", () => ({
  CATEGORIES: [{ id: "progressive", name: "누진다초점", subcategories: [] }],
}));
vi.mock("@/lib/naver/searchSignals", () => ({
  fetchMonthlySeasonality: vi.fn(async () => [
    { keyword: "선글라스", monthlyRatios: [10, 10, 10, 10, 10, 90, 95, 90, 10, 10, 10, 10] },
  ]),
  fetchKeywordDemandSignals: vi.fn(async () => [
    { keyword: "선글라스", monthlyTotalSearches: 5000 },
  ]),
}));
vi.mock("@/lib/blogops/insights", () => ({
  getTopExposedKeywordKeys: vi.fn(async () => new Set<string>()),
}));

import { POST } from "./route";
import { getTopExposedKeywordKeys } from "@/lib/blogops/insights";
import { fetchMonthlySeasonality } from "@/lib/naver/searchSignals";

function req(body: unknown) {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const SUMMER_RATIOS = [10, 10, 10, 10, 10, 90, 95, 90, 10, 10, 10, 10];
beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks는 mockResolvedValue 구현을 지우지 않으므로(누수) 매 테스트 기본값 복원.
  vi.mocked(getTopExposedKeywordKeys).mockResolvedValue(new Set<string>());
  vi.mocked(fetchMonthlySeasonality).mockResolvedValue([
    { keyword: "선글라스", monthlyRatios: SUMMER_RATIOS },
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe("/api/topics/seasonal-series POST", () => {
  it("headKeywords 없으면 400(zod)", async () => {
    const res = await POST(req({ shopId: "top50jn", categoryId: "progressive" }));
    expect(res.status).toBe(400);
  });

  it("잘못된 shopId면 400", async () => {
    const res = await POST(
      req({ shopId: "nope", categoryId: "progressive", headKeywords: ["선글라스"] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("shopId");
  });

  it("유효 입력이면 7월 편성표를 만든다(시즌곡선+검색량 조립)", async () => {
    const res = await POST(
      req({ shopId: "top50jn", categoryId: "progressive", headKeywords: ["선글라스"], month: 7 })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.month).toBe(7);
    expect(json.data.picks[0].headKeyword).toBe("선글라스");
    expect(json.data.picks[0].monthlyVolume).toBe(5000);
    expect(json.data.picks[0].isPeakMonth).toBe(true); // 7월=95=연중최고
    expect(json.data.schedule[0].slot).toBe(1);
  });

  it("자기잠식 키워드는 편성에서 제외한다", async () => {
    vi.mocked(getTopExposedKeywordKeys).mockResolvedValue(new Set(["선글라스"]));
    const res = await POST(
      req({ shopId: "top50jn", categoryId: "progressive", headKeywords: ["선글라스"], month: 7 })
    );
    const json = await res.json();
    expect(json.data.picks).toHaveLength(0);
    expect(json.data.notes.join(" ")).toContain("자기잠식");
  });

  it("시즌 API가 죽어도(빈 결과) 폴백해 200을 준다", async () => {
    vi.mocked(fetchMonthlySeasonality).mockRejectedValue(new Error("datalab down"));
    const res = await POST(
      req({ shopId: "top50jn", categoryId: "progressive", headKeywords: ["선글라스"], month: 7 })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.picks[0].peakMonth).toBeNull();
  });
});
