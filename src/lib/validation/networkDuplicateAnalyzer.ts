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

// 한국어 조사를 말단에서 제거해 "속도에" / "속도를" / "속도" 가 같은 토큰으로 매칭되도록 한다.
// 어간이 2자 미만으로 줄어드는 경우는 유지(과도한 절단 방지).
const PARTICLE_SUFFIXES = [
  "으로부터",
  "으로서",
  "으로써",
  "에게서",
  "에서의",
  "이라고",
  "이라도",
  "이라는",
  "라고",
  "라도",
  "라는",
  "으로",
  "에서",
  "에게",
  "에도",
  "에만",
  "까지",
  "부터",
  "이나",
  "이며",
  "이고",
  "에",
  "과",
  "와",
  "의",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "도",
  "만",
  "나",
];

function stripKoreanParticle(token: string): string {
  for (const suffix of PARTICLE_SUFFIXES) {
    if (token.length > suffix.length + 1 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function tokenize(text: string): string[] {
  return (text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((token) =>
    stripKoreanParticle(token.toLowerCase())
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

// 조합 중복 판정.
// - "main-only": 같은 매장 보호. 과거 제목이 메인 키워드 핵심 토큰을 모두 포함하면 중복.
//   (같은 매장은 같은 메인 키워드/소재를 재발행하지 않는다.)
// - "main-and-sub": 다른 매장/경쟁 보호. 메인이 같아도 관점(서브)이 다르면 허용하고,
//   메인 핵심 토큰을 모두 포함하면서 서브의 변별 토큰까지 겹칠 때만 "조합 동일"로 본다.
//   (예전에는 토큰 2개만 겹쳐도 중복 처리해 흔한 키워드가 전부 탈락했다.)
function detectKeywordCombinationOverlap(
  option: KeywordOption,
  history: string[],
  mode: "main-only" | "main-and-sub"
): string[] {
  const mainTokens = meaningfulTokens(option.mainKeyword);
  if (mainTokens.length === 0) return [];
  const subTokens = new Set(
    [
      ...meaningfulTokens(option.subKeyword1),
      ...meaningfulTokens(option.subKeyword2),
    ].filter((token) => !mainTokens.includes(token))
  );

  return history.filter((item) => {
    const itemTokens = new Set(meaningfulTokens(item));
    const mainHit = mainTokens.every((token) => itemTokens.has(token));
    if (!mainHit) return false;
    if (mode === "main-only") return true;
    return Array.from(subTokens).some((token) => itemTokens.has(token));
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
  const sameStoreKeywordCombinationOverlap = detectKeywordCombinationOverlap(
    option,
    forbiddenList,
    "main-only"
  );
  const keywordCombinationOverlap = detectKeywordCombinationOverlap(
    option,
    referenceList,
    "main-and-sub"
  );
  const competitorKeywordCombinationOverlap = detectKeywordCombinationOverlap(
    option,
    competitorList,
    "main-and-sub"
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

  if (sameStoreKeywordCombinationOverlap.length > 0) {
    issues.push({
      code: "same-store-keyword-combination-overlap",
      label: "같은 매장 키워드 조합 중복",
      reason: `같은 매장 기존 제목에서 같은 키워드 조합이 감지되었습니다: ${sameStoreKeywordCombinationOverlap[0]}`,
      severity: "high",
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
      ...sameStoreKeywordCombinationOverlap,
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
