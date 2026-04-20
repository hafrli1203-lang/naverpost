import type {
  AnalysisIssue,
  DuplicatePatternAnalysis,
  KeywordOption,
} from "@/types";

const COMMON_STOPWORDS = new Set([
  "관리",
  "방법",
  "안내",
  "선택",
  "기준",
  "효과",
  "차이",
  "이유",
  "원리",
  "정리",
  "확인",
  "추천",
  "비교",
  "점검",
  "사용",
  "주의",
  "팁",
  "가이드",
  "노하우",
  "이야기",
  "설명",
  "체크",
  "포인트",
  "상담",
  "의미",
  "변화",
  "특징",
  "종류",
  "용도",
]);

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function tokenize(text: string): string[] {
  return (text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((token) =>
    token.toLowerCase()
  );
}

function meaningfulTokens(text: string): string[] {
  return tokenize(text).filter((token) => !COMMON_STOPWORDS.has(token));
}

function overlapTokens(source: string, targets: string[]): string[] {
  const sourceTokens = new Set(meaningfulTokens(source));
  const overlaps = new Set<string>();

  for (const target of targets) {
    for (const token of meaningfulTokens(target)) {
      if (sourceTokens.has(token)) overlaps.add(token);
    }
  }

  return Array.from(overlaps);
}

function detectSharedTitlePattern(title: string, history: string[]): string[] {
  const normalizedTitle = normalize(title);
  const titleTokens = meaningfulTokens(title);
  if (titleTokens.length === 0) return [];

  return history.filter((item) => {
    const normalizedItem = normalize(item);
    if (!normalizedItem) return false;
    if (normalizedItem === normalizedTitle) return true;

    const itemTokens = meaningfulTokens(item);
    if (itemTokens.length === 0) return false;

    const sharedCount = itemTokens.filter((token) =>
      titleTokens.includes(token)
    ).length;

    const threshold = Math.max(2, Math.ceil(Math.min(titleTokens.length, itemTokens.length) * 0.6));
    return sharedCount >= threshold;
  });
}

function detectKeywordCombinationOverlap(
  option: KeywordOption,
  history: string[]
): string[] {
  const keywordTokens = [
    option.mainKeyword,
    option.subKeyword1,
    option.subKeyword2,
  ]
    .flatMap(meaningfulTokens)
    .filter(Boolean);
  if (keywordTokens.length === 0) return [];

  return history.filter((item) => {
    const itemTokens = meaningfulTokens(item);
    const sharedCount = itemTokens.filter((token) =>
      keywordTokens.includes(token)
    ).length;
    return sharedCount >= 2;
  });
}

export function analyzeNetworkDuplicateRisk(params: {
  option: KeywordOption;
  forbiddenList: string[];
  referenceList: string[];
  competitorList?: string[];
}): DuplicatePatternAnalysis {
  const { option, forbiddenList, referenceList, competitorList = [] } = params;
  const sameStoreMatches = detectSharedTitlePattern(option.title, forbiddenList);
  const crossBlogMatches = detectSharedTitlePattern(option.title, referenceList);
  const competitorMatches = detectSharedTitlePattern(option.title, competitorList);
  const keywordCombinationOverlap = detectKeywordCombinationOverlap(
    option,
    referenceList
  );
  const competitorKeywordCombinationOverlap = detectKeywordCombinationOverlap(
    option,
    competitorList
  );
  const sharedExpressionOverlap = overlapTokens(option.title, referenceList).slice(
    0,
    8
  );

  const issues: AnalysisIssue[] = [];

  if (sameStoreMatches.length > 0) {
    issues.push({
      code: "same-store-title-overlap",
      label: "같은 매장 제목 패턴 중복",
      reason: `같은 매장 기존 제목과 겹치는 패턴이 있습니다: ${sameStoreMatches[0]}`,
      severity: "high",
      source: "rss-history",
    });
  }

  if (crossBlogMatches.length > 0) {
    issues.push({
      code: "cross-blog-title-overlap",
      label: "네트워크 제목 패턴 중복",
      reason: `다른 블로그 제목과 유사한 패턴이 감지되었습니다: ${crossBlogMatches[0]}`,
      severity: "medium",
      source: "rss-history",
    });
  }

  if (competitorMatches.length > 0) {
    issues.push({
      code: "competitor-top-title-overlap",
      label: "상위 노출 경쟁 제목 중복",
      reason: `현재 네이버 상위 노출 중인 제목과 겹칩니다: ${competitorMatches[0]}`,
      severity: "high",
      source: "naver-search",
    });
  }

  if (keywordCombinationOverlap.length > 0) {
    issues.push({
      code: "cross-blog-keyword-combination-overlap",
      label: "키워드 조합 중복",
      reason: `다른 블로그 제목에서 같은 키워드 조합이 감지되었습니다: ${keywordCombinationOverlap[0]}`,
      severity: "medium",
      source: "rss-history",
    });
  }

  if (competitorKeywordCombinationOverlap.length > 0) {
    issues.push({
      code: "competitor-keyword-combination-overlap",
      label: "경쟁 제목 키워드 조합 중복",
      reason: `상위 노출 제목과 키워드 조합이 겹칩니다: ${competitorKeywordCombinationOverlap[0]}`,
      severity: "medium",
      source: "naver-search",
    });
  }

  return {
    titlePatternOverlap: [
      ...sameStoreMatches,
      ...crossBlogMatches,
      ...competitorMatches,
    ].slice(0, 6),
    keywordCombinationOverlap: [
      ...keywordCombinationOverlap,
      ...competitorKeywordCombinationOverlap,
    ].slice(0, 6),
    sectionOrderOverlap: [],
    tableStructureOverlap: [],
    expressionOverlap: sharedExpressionOverlap,
    conclusionOverlap: [],
    informationOrderOverlap: [],
    issues,
  };
}
