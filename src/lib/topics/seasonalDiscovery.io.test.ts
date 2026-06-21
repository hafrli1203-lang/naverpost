import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SearchVolumeSignal } from "@/types";
import type { MonthlySeasonality } from "@/lib/naver/searchSignals";

/**
 * discoverSeasonalKeywords(IO 조립) 단위테스트.
 * 외부 4종(카테고리·시드·검색신호·시즌곡선·자기잠식)을 mock해 병합/귀속/자기잠식/
 * 부분 실패 graceful/이슈 누락 한계 노트를 무비용으로 고정한다.
 */

vi.mock("@/lib/constants", () => ({
  CATEGORIES: [
    { id: "frames", name: "안경테" },
    { id: "lenses", name: "안경렌즈" },
  ],
}));
vi.mock("@/lib/keywords/seasonalStrategy", () => ({
  CATEGORY_CORE_KEYWORDS: { frames: ["안경테"], lenses: ["선글라스"] },
}));
vi.mock("@/lib/naver/searchSignals", () => ({
  fetchKeywordDemandSignals: vi.fn(),
  fetchMonthlySeasonality: vi.fn(),
}));
vi.mock("@/lib/blogops/insights", () => ({
  getTopExposedKeywordKeys: vi.fn(),
}));

import { discoverSeasonalKeywords } from "./seasonalDiscovery";
import {
  fetchKeywordDemandSignals,
  fetchMonthlySeasonality,
} from "@/lib/naver/searchSignals";
import { getTopExposedKeywordKeys } from "@/lib/blogops/insights";

const SUMMER = [10, 10, 10, 10, 10, 90, 95, 90, 10, 10, 10, 10]; // 7월 급등(lift≈3.1)
const FLAT = new Array<number>(12).fill(50); // 사철 고름(lift=1)

function sig(keyword: string, monthlyTotalSearches: number | null): SearchVolumeSignal {
  return { keyword, monthlyTotalSearches, source: "naver-search" };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTopExposedKeywordKeys).mockResolvedValue(new Set<string>());
  // 시드별 발굴 결과를 카테고리로 가르기 위해 인자(seeds)로 분기.
  vi.mocked(fetchKeywordDemandSignals).mockImplementation(async (seeds: string[]) => {
    if (seeds.includes("안경테")) return [sig("안경테", 5000), sig("뿔테안경", 800)];
    if (seeds.includes("선글라스")) return [sig("선글라스", 9000), sig("변색렌즈", 3000)];
    return [];
  });
  vi.mocked(fetchMonthlySeasonality).mockImplementation(
    async (keywords: string[]): Promise<MonthlySeasonality[]> =>
      keywords.map((k) => ({
        keyword: k,
        monthlyRatios: k === "선글라스" || k === "변색렌즈" ? SUMMER : FLAT,
      }))
  );
});
afterEach(() => vi.restoreAllMocks());

describe("discoverSeasonalKeywords (IO)", () => {
  it("두 카테고리 시드를 발굴해 카테고리 귀속을 보존하고 volume/issue 두 리스트를 만든다", async () => {
    const out = await discoverSeasonalKeywords({ shopId: "top50jn", month: 7 });

    expect(out.shopId).toBe("top50jn");
    expect(out.month).toBe(7);
    const byKw = new Map(out.volumeTop.map((k) => [k.keyword, k]));
    // 같은 키워드가 다른 카테고리 시드에서 안 나오므로 귀속이 그대로 보존된다.
    expect(byKw.get("선글라스")?.categoryName).toBe("안경렌즈");
    expect(byKw.get("안경테")?.categoryName).toBe("안경테");
    // 이슈(급상승)는 SUMMER 키워드가 상위. 선글라스(lift≈3.1, 수요 8550)가 변색렌즈보다 앞.
    expect(out.issueTop[0].keyword).toBe("선글라스");
    expect(out.issueTop[0].seasonalLift).toBeGreaterThan(2);
  });

  it("자기잠식(상위노출) 키워드는 volume/issue 두 리스트 모두에서 제외한다", async () => {
    vi.mocked(getTopExposedKeywordKeys).mockResolvedValue(new Set(["선글라스"]));
    const out = await discoverSeasonalKeywords({ shopId: "top50jn", month: 7 });

    expect(out.volumeTop.some((k) => k.keyword === "선글라스")).toBe(false);
    expect(out.issueTop.some((k) => k.keyword === "선글라스")).toBe(false);
    expect(out.notes.join(" ")).toContain("자기잠식");
  });

  it("데이터랩 시즌 조회가 실패해도 검색량 리스트는 낸다(graceful, 이슈는 비움)", async () => {
    vi.mocked(fetchMonthlySeasonality).mockRejectedValue(new Error("datalab down"));
    const out = await discoverSeasonalKeywords({ shopId: "top50jn", month: 7 });

    expect(out.volumeTop.length).toBeGreaterThan(0); // 절대량 폴백
    expect(out.issueTop).toHaveLength(0); // lift 불가 → 이슈 판정 불가
    expect(out.notes.join(" ")).toContain("시즌 데이터가 없어");
  });

  it("검색광고 발굴이 비면 빈 리스트와 안내 노트를 낸다", async () => {
    vi.mocked(fetchKeywordDemandSignals).mockResolvedValue([]);
    const out = await discoverSeasonalKeywords({ shopId: "top50jn", month: 7 });

    expect(out.volumeTop).toHaveLength(0);
    expect(out.issueTop).toHaveLength(0);
    expect(out.notes.join(" ")).toContain("후보를 발굴하지 못했습니다");
  });

  it("급상승 적격 후보가 시즌 분석 상한(60)을 넘으면 누락 한계를 노트로 알린다", async () => {
    const many = Array.from({ length: 70 }, (_, i) => sig(`이슈키워드${i}`, 1000));
    vi.mocked(fetchKeywordDemandSignals).mockImplementation(async (seeds: string[]) =>
      seeds.includes("안경테") ? many : []
    );
    vi.mocked(fetchMonthlySeasonality).mockImplementation(
      async (keywords: string[]): Promise<MonthlySeasonality[]> =>
        keywords.map((k) => ({ keyword: k, monthlyRatios: SUMMER }))
    );
    const out = await discoverSeasonalKeywords({ shopId: "top50jn", month: 7 });

    expect(out.notes.join(" ")).toContain("이슈 랭킹에서 누락");
  });
});
