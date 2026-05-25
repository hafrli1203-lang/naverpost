import type { SearchVolumeSignal } from "@/types";

export interface KeywordOpportunityInput {
  keyword: string;
  monthlyTotalSearches?: number | null;
  blogDocumentCount?: number | null;
  trend?: SearchVolumeSignal["trend"];
  now?: Date;
}

export interface KeywordOpportunityScore {
  competitionRatio: number | null;
  opportunityScore: number;
  seasonalFit: "high" | "medium" | "low" | "unknown";
  seasonalReason: string;
}

const SEASONAL_KEYWORDS_BY_MONTH: Record<number, string[]> = {
  1: ["겨울", "연말", "건조", "김서림", "실내", "부모님"],
  2: ["겨울", "새학기", "학생", "어린이", "시력검사", "건조"],
  3: ["새학기", "개학", "학생", "어린이", "시력검사", "봄"],
  4: ["봄", "자외선", "야외", "렌즈교체", "눈피로"],
  5: ["가정의달", "부모님", "노안", "선물", "자외선"],
  6: ["여름", "자외선", "선글라스", "변색렌즈", "렌즈건조"],
  7: ["여름", "휴가", "자외선", "렌즈위생", "선글라스"],
  8: ["여름", "휴가", "자외선", "개학", "시력검사"],
  9: ["가을", "환절기", "눈건조", "업무", "독서"],
  10: ["가을", "환절기", "눈피로", "운전", "독서"],
  11: ["가을", "겨울", "건조", "김서림", "실내"],
  12: ["겨울", "연말", "부모님", "김서림", "건조", "실내"],
};

export function combineKeywordGroups(groups: string[][], maxResults = 80): string[] {
  const normalizedGroups = groups
    .map((group) =>
      Array.from(
        new Set(
          group
            .map((keyword) => keyword.trim().replace(/\s+/g, " "))
            .filter(Boolean)
        )
      )
    )
    .filter((group) => group.length > 0);

  if (normalizedGroups.length === 0) return [];

  const results = new Set<string>();
  for (let i = 0; i < normalizedGroups.length; i += 1) {
    for (let j = 0; j < normalizedGroups.length; j += 1) {
      if (i === j) continue;
      for (const left of normalizedGroups[i]) {
        for (const right of normalizedGroups[j]) {
          const keyword = `${left} ${right}`.trim().replace(/\s+/g, " ");
          if (keyword.split(/\s+/).length !== 2) continue;
          results.add(keyword);
          if (results.size >= maxResults) return Array.from(results);
        }
      }
    }
  }

  return Array.from(results);
}

export function scoreKeywordOpportunity(
  input: KeywordOpportunityInput
): KeywordOpportunityScore {
  const monthlyTotal = input.monthlyTotalSearches ?? 0;
  const blogCount = input.blogDocumentCount ?? 0;
  const competitionRatio =
    monthlyTotal > 0 && blogCount > 0 ? blogCount / monthlyTotal : null;
  const now = input.now ?? new Date();
  const month = now.getMonth() + 1;
  const seasonalWords = SEASONAL_KEYWORDS_BY_MONTH[month] ?? [];
  const matchedSeasonalWord = seasonalWords.find((word) => input.keyword.includes(word));

  const seasonalFit = matchedSeasonalWord
    ? "high"
    : /자외선|김서림|건조|부모님|새학기|개학|환절기|휴가|운전|실내/.test(input.keyword)
      ? "medium"
      : "unknown";
  const seasonalReason = matchedSeasonalWord
    ? `${month}월 시즌어 "${matchedSeasonalWord}"와 맞습니다.`
    : seasonalFit === "medium"
      ? `${month}월 직접 시즌어는 아니지만 계절성 소재로 확장 가능합니다.`
      : `${month}월 시즌 신호는 약합니다.`;

  let score = 0;
  if (monthlyTotal >= 30 && monthlyTotal <= 3000) score += 45;
  else if (monthlyTotal > 0 && monthlyTotal < 30) score += 12;
  else if (monthlyTotal > 3000) score += 18;

  if (competitionRatio !== null) {
    if (competitionRatio <= 3) score += 35;
    else if (competitionRatio <= 10) score += 22;
    else if (competitionRatio <= 30) score += 8;
    else score -= 18;
  }

  if (input.trend === "rising") score += 12;
  if (input.trend === "falling") score -= 8;
  if (seasonalFit === "high") score += 12;
  if (seasonalFit === "medium") score += 5;

  return {
    competitionRatio,
    opportunityScore: Math.max(0, Math.min(100, score)),
    seasonalFit,
    seasonalReason,
  };
}

export function enrichOpportunitySignal(signal: SearchVolumeSignal): SearchVolumeSignal {
  const score = scoreKeywordOpportunity({
    keyword: signal.keyword,
    monthlyTotalSearches: signal.monthlyTotalSearches,
    blogDocumentCount: signal.blogDocumentCount,
    trend: signal.trend,
  });

  return {
    ...signal,
    competitionRatio: score.competitionRatio,
    opportunityScore: score.opportunityScore,
    seasonalFit: score.seasonalFit,
    seasonalReason: score.seasonalReason,
  };
}
