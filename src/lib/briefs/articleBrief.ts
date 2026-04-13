import type { ArticleBrief, Category, KeywordOption, Shop } from "@/types";

function summarizeResearch(researchData: string): string {
  const lines = researchData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("[") && !line.startsWith("- "));

  return lines.slice(0, 8).join("\n");
}

function extractTitleMorphologyGuide(keyword: KeywordOption): string[] {
  const source = `${keyword.title} ${keyword.mainKeyword} ${keyword.subKeyword1} ${keyword.subKeyword2}`;
  const tokens = Array.from(
    new Set((source.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((token) => token.toLowerCase()))
  );

  return tokens.slice(0, 8).map(
    (token) => `본문에서 "${token}" 관련 설명을 실제 정보와 연결해 자연스럽게 활성화`
  );
}

function extractDuplicateAvoidanceRules(params: {
  sameStoreHistory: string[];
  crossBlogTitles: string[];
  keyword: KeywordOption;
}): string[] {
  const rules: string[] = [
    "제목 문구를 그대로 반복하지 말고 본문 구조로 차별화",
    "같은 매장 기존 글과 동일한 정보 배열을 피하기",
    "서브 키워드 중 하나를 중심축으로 앞부분 설명 순서를 차별화",
    "표가 들어간다면 기존 글과 다른 비교 항목으로 구성",
    "결론 문장을 상투적인 홍보형 문장으로 반복하지 않기",
  ];

  if (params.sameStoreHistory.length > 0) {
    rules.push(`같은 매장 기존 제목 패턴 참고: ${params.sameStoreHistory[0]}`);
  }

  if (params.crossBlogTitles.length > 0) {
    rules.push(`다른 블로그 유사 방향 참고: ${params.crossBlogTitles[0]}`);
  }

  if (params.keyword.analysis?.searchIntentAxis) {
    rules.push(
      `이번 글의 주된 검색의도 축은 "${params.keyword.analysis.searchIntentAxis}"로 유지`
    );
  }

  return rules;
}

export function buildArticleBrief(params: {
  keyword: KeywordOption;
  shop: Shop;
  category: Category;
  topic: string;
  articleType: "info" | "promo";
  charCount: 1000 | 1500 | 2000 | 2500;
  tone: "standard" | "friendly" | "casual" | "business" | "expert";
  contentSubtype?: "blog" | "event" | "season" | "short";
  researchData: string;
  sameStoreHistory: string[];
  crossBlogTitles: string[];
  competitorMorphology?: {
    status: "available" | "unavailable";
    sampleSize: number;
    commonNouns: string[];
    titleNouns: string[];
  };
}): ArticleBrief {
  const {
    keyword,
    shop,
    category,
    topic,
    articleType,
    charCount,
    tone,
    contentSubtype,
    researchData,
    sameStoreHistory,
    crossBlogTitles,
    competitorMorphology,
  } = params;

  return {
    title: keyword.title,
    topic,
    articleType,
    charCount,
    tone,
    contentSubtype,
    shop,
    category,
    mainKeyword: keyword.mainKeyword,
    subKeyword1: keyword.subKeyword1,
    subKeyword2: keyword.subKeyword2,
    researchSummary: summarizeResearch(researchData),
    titleMorphologyGuide: extractTitleMorphologyGuide(keyword),
    duplicateAvoidanceRules: extractDuplicateAvoidanceRules({
      sameStoreHistory,
      crossBlogTitles,
      keyword,
    }),
    networkContext: {
      currentBlogId: shop.blogId,
      sameStoreHistory,
      crossBlogStoreAngles: crossBlogTitles.slice(0, 5),
    },
    competitorMorphology,
    sources: competitorMorphology?.status === "available"
      ? ["perplexity", "rss-history", "local-content", "document-rule", "naver-search"]
      : ["perplexity", "rss-history", "local-content", "document-rule"],
  };
}
