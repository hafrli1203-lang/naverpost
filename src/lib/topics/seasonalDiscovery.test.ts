import { describe, it, expect } from "vitest";
import { rankSeasonalKeywords, type DiscoveryCandidate } from "./seasonalDiscovery";

/** 순수 랭킹 함수만 검증(외부 IO 없음). 결정론·무비용. */

const SUMMER = [10, 10, 10, 10, 10, 90, 95, 90, 10, 10, 10, 10]; // 7월=95 연중피크
const WINTER = [80, 70, 20, 10, 10, 10, 10, 10, 10, 20, 60, 85]; // 12월=85 피크

function c(over: Partial<DiscoveryCandidate> & { keyword: string }): DiscoveryCandidate {
  return {
    categoryId: "frames",
    categoryName: "안경테",
    monthlyRatios: [],
    monthlyVolume: null,
    ...over,
  };
}

describe("rankSeasonalKeywords", () => {
  it("그 달 추정 수요(절대량×시즌비율)로 정렬한다", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      candidates: [
        c({ keyword: "겨울키워드", monthlyRatios: WINTER, monthlyVolume: 10000 }), // 7월 비율 10 → 1000
        c({ keyword: "여름키워드", monthlyRatios: SUMMER, monthlyVolume: 5000 }), // 7월 비율 95 → 4750
      ],
    });
    expect(out[0].keyword).toBe("여름키워드");
    expect(out[0].estimatedMonthlyDemand).toBe(4750);
    expect(out[0].isPeakMonth).toBe(true);
    expect(out[1].estimatedMonthlyDemand).toBe(1000);
  });

  it("시즌데이터 없으면 절대량으로 폴백 정렬한다", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      candidates: [
        c({ keyword: "작은볼륨", monthlyVolume: 100 }),
        c({ keyword: "큰볼륨", monthlyVolume: 9000 }),
      ],
    });
    expect(out[0].keyword).toBe("큰볼륨");
    expect(out[0].estimatedMonthlyDemand).toBe(9000);
    expect(out[0].peakMonth).toBeNull();
  });

  it("자기잠식 키워드는 제외한다", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      excludedKeys: new Set(["여름키워드"]),
      candidates: [
        c({ keyword: "여름키워드", monthlyRatios: SUMMER, monthlyVolume: 5000 }),
        c({ keyword: "겨울키워드", monthlyRatios: WINTER, monthlyVolume: 10000 }),
      ],
    });
    expect(out.map((k) => k.keyword)).toEqual(["겨울키워드"]);
  });

  it("같은 키워드는 한 번만(공백·대소문자 무시)", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      candidates: [
        c({ keyword: "변색 렌즈", monthlyVolume: 3000 }),
        c({ keyword: "변색렌즈", monthlyVolume: 9000 }),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].keyword).toBe("변색 렌즈"); // 첫 등장 유지
  });

  it("count로 상위만 자른다", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 2,
      candidates: [
        c({ keyword: "a", monthlyVolume: 100 }),
        c({ keyword: "b", monthlyVolume: 200 }),
        c({ keyword: "c", monthlyVolume: 300 }),
      ],
    });
    expect(out.map((k) => k.keyword)).toEqual(["c", "b"]);
  });

  it("절대량 null은 맨 뒤로 보낸다", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      candidates: [
        c({ keyword: "볼륨없음", monthlyVolume: null }),
        c({ keyword: "볼륨있음", monthlyVolume: 50 }),
      ],
    });
    expect(out[0].keyword).toBe("볼륨있음");
    expect(out[1].keyword).toBe("볼륨없음");
  });

  it("mode=issue는 급상승 배수(그 달/연평균)로 정렬한다", () => {
    // 큰볼륨은 사철 고른 수요(lift 낮음), 시즌키워드는 7월에 급등(lift 높음).
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      mode: "issue",
      candidates: [
        c({ keyword: "사철고른", monthlyRatios: new Array(12).fill(50), monthlyVolume: 20000 }), // lift 1
        c({ keyword: "여름급등", monthlyRatios: SUMMER, monthlyVolume: 3000 }), // 7월 95/평균≈29.6 → lift≈3.2
      ],
    });
    expect(out[0].keyword).toBe("여름급등");
    expect(out[0].seasonalLift).toBeGreaterThan(2);
  });

  it("mode=issue는 시즌데이터 없거나 검색량 미달(<200)이면 제외한다", () => {
    const out = rankSeasonalKeywords({
      month: 7,
      count: 10,
      mode: "issue",
      candidates: [
        c({ keyword: "시즌없음", monthlyVolume: 9000 }), // monthlyRatios 없음 → 제외
        c({ keyword: "검색량미달", monthlyRatios: SUMMER, monthlyVolume: 100 }), // <200 → 제외
        c({ keyword: "통과", monthlyRatios: SUMMER, monthlyVolume: 5000 }),
      ],
    });
    expect(out.map((k) => k.keyword)).toEqual(["통과"]);
  });
});
