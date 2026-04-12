import type {
  AnalysisIssue,
  DuplicatePatternAnalysis,
  KeywordOption,
} from "@/types";

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function tokenize(text: string): string[] {
  return (text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((token) =>
    token.toLowerCase()
  );
}

function overlapTokens(source: string, targets: string[]): string[] {
  const sourceTokens = new Set(tokenize(source));
  const overlaps = new Set<string>();

  for (const target of targets) {
    for (const token of tokenize(target)) {
      if (sourceTokens.has(token)) overlaps.add(token);
    }
  }

  return Array.from(overlaps);
}

function detectSharedTitlePattern(title: string, history: string[]): string[] {
  const normalizedTitle = normalize(title);
  const titleTokens = tokenize(title);

  return history.filter((item) => {
    const normalizedItem = normalize(item);
    if (!normalizedItem) return false;
    if (normalizedItem === normalizedTitle) return true;

    const itemTokens = tokenize(item);
    const sharedCount = itemTokens.filter((token) =>
      titleTokens.includes(token)
    ).length;
    return sharedCount >= Math.min(2, titleTokens.length);
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
    .flatMap(tokenize)
    .filter(Boolean);

  return history.filter((item) => {
    const itemTokens = tokenize(item);
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
}): DuplicatePatternAnalysis {
  const { option, forbiddenList, referenceList } = params;
  const sameStoreMatches = detectSharedTitlePattern(option.title, forbiddenList);
  const crossBlogMatches = detectSharedTitlePattern(option.title, referenceList);
  const keywordCombinationOverlap = detectKeywordCombinationOverlap(
    option,
    referenceList
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

  if (keywordCombinationOverlap.length > 0) {
    issues.push({
      code: "cross-blog-keyword-combination-overlap",
      label: "키워드 조합 중복",
      reason: `다른 블로그 제목에서 같은 키워드 조합이 감지되었습니다: ${keywordCombinationOverlap[0]}`,
      severity: "medium",
      source: "rss-history",
    });
  }

  return {
    titlePatternOverlap: [...sameStoreMatches, ...crossBlogMatches].slice(0, 5),
    keywordCombinationOverlap: keywordCombinationOverlap.slice(0, 5),
    sectionOrderOverlap: [],
    tableStructureOverlap: [],
    expressionOverlap: sharedExpressionOverlap,
    conclusionOverlap: [],
    informationOrderOverlap: [],
    issues,
  };
}
