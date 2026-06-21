import { describe, it, expect } from "vitest";
import { planSeasonalSeries, type SeasonalCandidate } from "./seasonalSeriesPlanner";

/**
 * 월별 시즌 시리즈 편성 엔진 회귀 테스트(순수·결정론, 외부 호출 0).
 * 설계: docs/designs/seasonal-series-planner.md
 */

// 12개월 비율 헬퍼: 특정 달들만 높게.
function ratios(highMonths: number[], high = 90, low = 10): number[] {
  return Array.from({ length: 12 }, (_, i) => (highMonths.includes(i + 1) ? high : low));
}

const summer: SeasonalCandidate = {
  headKeyword: "선글라스",
  monthlyRatios: ratios([6, 7, 8]), // 여름 피크
  monthlyVolume: 5000,
};
const winter: SeasonalCandidate = {
  headKeyword: "눈건조",
  monthlyRatios: ratios([12, 1, 2]), // 겨울 피크
  monthlyVolume: 3000,
};
const flat: SeasonalCandidate = {
  headKeyword: "안경테",
  monthlyRatios: ratios([], 50, 50), // 연중 평탄
  monthlyVolume: 8000,
};

const BASE = { shopId: "top50jn", startDateIso: "2026-07-01", count: 3 };

describe("planSeasonalSeries — 시즌 랭킹", () => {
  it("7월(여름)에는 여름 피크 키워드가 1위", () => {
    const plan = planSeasonalSeries({ ...BASE, month: 7, candidates: [winter, flat, summer] });
    expect(plan.picks[0].headKeyword).toBe("선글라스");
    expect(plan.picks[0].isPeakMonth).toBe(true);
  });

  it("1월(겨울)에는 겨울 피크 키워드가 1위", () => {
    const plan = planSeasonalSeries({ ...BASE, month: 1, candidates: [summer, flat, winter] });
    expect(plan.picks[0].headKeyword).toBe("눈건조");
  });

  it("시즌 점수 동점이면 절대 검색량이 높은 쪽이 위", () => {
    const a: SeasonalCandidate = { headKeyword: "A", monthlyRatios: ratios([7]), monthlyVolume: 100 };
    const b: SeasonalCandidate = { headKeyword: "B", monthlyRatios: ratios([7]), monthlyVolume: 900 };
    const plan = planSeasonalSeries({ ...BASE, month: 7, candidates: [a, b] });
    expect(plan.picks[0].headKeyword).toBe("B");
  });
});

describe("planSeasonalSeries — 피크 월 계산", () => {
  it("연중 최고 비율 월을 peakMonth로 잡는다", () => {
    const plan = planSeasonalSeries({ ...BASE, month: 3, candidates: [summer] });
    expect(plan.picks[0].peakMonth).toBe(6); // ratios([6,7,8]) 중 첫 최고 = 6월
    expect(plan.picks[0].isPeakMonth).toBe(false); // 3월은 피크 아님
  });
});

describe("planSeasonalSeries — 자기잠식 제외", () => {
  it("excludedKeys에 든 헤드는 편성에서 빠지고 note를 남긴다", () => {
    const plan = planSeasonalSeries({
      ...BASE,
      month: 7,
      candidates: [summer, winter],
      excludedKeys: ["선글라스"],
    });
    expect(plan.picks.some((p) => p.headKeyword === "선글라스")).toBe(false);
    expect(plan.notes.join(" ")).toContain("자기잠식");
  });
});

describe("planSeasonalSeries — 발행 일정", () => {
  it("기준일부터 간격(기본 3일)으로 슬롯을 배치한다", () => {
    const plan = planSeasonalSeries({ ...BASE, month: 7, candidates: [summer, winter, flat] });
    expect(plan.schedule.map((s) => s.suggestedDate)).toEqual([
      "2026-07-01",
      "2026-07-04",
      "2026-07-07",
    ]);
    expect(plan.schedule[0].slot).toBe(1);
    expect(plan.schedule[0].headKeyword).toBe(plan.picks[0].headKeyword);
  });

  it("intervalDays를 바꾸면 간격이 반영된다", () => {
    const plan = planSeasonalSeries({
      ...BASE,
      month: 7,
      candidates: [summer, winter],
      intervalDays: 7,
    });
    expect(plan.schedule[1].suggestedDate).toBe("2026-07-08");
  });
});

describe("planSeasonalSeries — 폴백/안전", () => {
  it("시즌 데이터가 없으면 검색량 순서로 편성하고 안내한다", () => {
    const noSeason: SeasonalCandidate = { headKeyword: "안경", monthlyRatios: [], monthlyVolume: 100 };
    const plan = planSeasonalSeries({ ...BASE, month: 7, candidates: [noSeason] });
    expect(plan.picks[0].peakMonth).toBeNull();
    expect(plan.notes.join(" ")).toContain("시즌");
  });

  it("후보가 요청 수보다 적으면 가능분만 + 안내", () => {
    const plan = planSeasonalSeries({ ...BASE, month: 7, count: 5, candidates: [summer] });
    expect(plan.picks).toHaveLength(1);
    expect(plan.notes.join(" ")).toContain("후보 부족");
  });

  it("같은 입력은 같은 출력(결정론)", () => {
    const args = { ...BASE, month: 7, candidates: [summer, winter, flat] };
    expect(planSeasonalSeries(args)).toEqual(planSeasonalSeries(args));
  });
});
