import type { ArticleBrief, Category, KeywordOption, Shop } from "@/types";

function summarizeResearch(researchData: string): string {
  const lines = researchData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("[") && !line.startsWith("- "));

  return lines.slice(0, 8).join("\n");
}

function buildCompetitorSignalSummary(competitorMorphology?: {
  status: "available" | "unavailable";
  sampleSize: number;
  bodySampleSize?: number;
  commonNouns: string[];
  titleNouns: string[];
  bodyNouns?: string[];
  bodyHighlights?: string[];
  titleAngles?: string[];
  contentBlocks?: string[];
  cautionPoints?: string[];
}): string[] {
  if (!competitorMorphology || competitorMorphology.status !== "available") {
    return [];
  }

  const lines: string[] = [];

  if (competitorMorphology.commonNouns.length > 0) {
    lines.push(
      `상위 노출 글 공통 명사(${competitorMorphology.sampleSize}건 기준): ${competitorMorphology.commonNouns
        .slice(0, 12)
        .join(", ")}`
    );
  }

  if (competitorMorphology.titleNouns.length > 0) {
    lines.push(
      `상위 제목에 자주 쓰인 핵심어: ${competitorMorphology.titleNouns
        .slice(0, 10)
        .join(", ")}`
    );
  }

  if ((competitorMorphology.bodyNouns?.length ?? 0) > 0) {
    lines.push(
      `상위 본문에서 반복된 핵심어(${competitorMorphology.bodySampleSize ?? 0}건 기준): ${competitorMorphology.bodyNouns
        ?.slice(0, 12)
        .join(", ")}`
    );
  }

  if ((competitorMorphology.bodyHighlights?.length ?? 0) > 0) {
    lines.push(
      `상위 글 본문에서 반복되는 논점: ${(competitorMorphology.bodyHighlights ?? []).join(", ")}`
    );
  }

  if ((competitorMorphology.titleAngles?.length ?? 0) > 0) {
    lines.push(`상위 제목 패턴: ${(competitorMorphology.titleAngles ?? []).join(" / ")}`);
  }

  if ((competitorMorphology.contentBlocks?.length ?? 0) > 0) {
    lines.push(
      `상위 본문 구조 힌트: ${(competitorMorphology.contentBlocks ?? []).join(" / ")}`
    );
  }

  if ((competitorMorphology.cautionPoints?.length ?? 0) > 0) {
    lines.push(
      `노출 관점 주의사항: ${(competitorMorphology.cautionPoints ?? []).join(" / ")}`
    );
  }

  return lines;
}

function extractTitleMorphologyGuide(keyword: KeywordOption): string[] {
  const source = `${keyword.title} ${keyword.mainKeyword} ${keyword.subKeyword1} ${keyword.subKeyword2}`;
  const tokens = Array.from(
    new Set(
      (source.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((token) => token.toLowerCase())
    )
  );

  return tokens.slice(0, 8).map(
    (token) =>
      `본문에서 "${token}"를 직접 설명하거나 예시와 함께 풀어 제목-본문 정합성을 유지합니다.`
  );
}

function extractDuplicateAvoidanceRules(params: {
  sameStoreHistory: string[];
  crossBlogTitles: string[];
  keyword: KeywordOption;
}): string[] {
  const rules: string[] = [
    "제목 첫 문장을 기존 발행 제목과 다르게 시작합니다.",
    "같은 정보라도 구성 순서와 소제목 문장을 바꿔 중복 인상을 줄입니다.",
    "서브 키워드는 문장 속에서 자연스럽게 풀고 나열형 사용은 피합니다.",
    "비교 문단이 필요하면 선택 기준을 먼저 제시하고 결론을 뒤로 미룹니다.",
    "마무리는 과장형 CTA보다 확인 포인트와 다음 행동 제안 중심으로 정리합니다.",
  ];

  if (params.sameStoreHistory.length > 0) {
    rules.push(`기존 같은 매장 글 예시: ${params.sameStoreHistory[0]}`);
  }

  if (params.crossBlogTitles.length > 0) {
    rules.push(`다른 블로그에서 이미 많이 쓴 제목 예시: ${params.crossBlogTitles[0]}`);
  }

  if (params.keyword.analysis?.searchIntentAxis) {
    rules.push(
      `이번 글은 "${params.keyword.analysis.searchIntentAxis}" 의도를 우선 반영해 제목과 본문 흐름을 맞춥니다.`
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
    bodySampleSize?: number;
    commonNouns: string[];
    titleNouns: string[];
    bodyNouns?: string[];
    bodyHighlights?: string[];
    titleAngles?: string[];
    contentBlocks?: string[];
    cautionPoints?: string[];
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
    researchSummary: [
      summarizeResearch(researchData),
      ...buildCompetitorSignalSummary(competitorMorphology),
    ]
      .filter(Boolean)
      .join("\n"),
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
    sources:
      competitorMorphology?.status === "available"
        ? ["perplexity", "rss-history", "local-content", "document-rule", "naver-search"]
        : ["perplexity", "rss-history", "local-content", "document-rule"],
  };
}
