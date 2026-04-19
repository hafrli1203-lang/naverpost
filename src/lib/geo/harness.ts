import type {
  ArticleContent,
  GeoAnalysisResult,
  GeoCategoryScore,
  GeoOptimizationResult,
  GeoRecommendation,
} from "@/types";

export type GeoHarnessMode = "safe" | "aggressive";
export type PostTypeGuard = "general" | "price-list" | "product-intro";

const TODAY = "2026-04-19";

const TEMPLATE_HEADING_PATTERNS = [
  /^##\s*FAQ\s*$/i,
  /^##\s*자주 묻는 질문\s*$/i,
  /^##\s*확인 및 안내\s*$/i,
  /^##\s*참고 및 확인 포인트\s*$/i,
];

const TEMPLATE_LINE_PATTERNS = [
  /^핵심 답변[:：]/u,
  /업데이트 기준일/u,
  /공개 자료와 현장 상담 관점을 바탕으로/u,
  /상담 관점에서 보면/u,
  /^[^.!?\n]{2,60}(?:은|는|이|가)\s+어떤 기준으로 보면 좋을까요\?/u,
  /지금 필요한 기준이 무엇인지부터 나눠 보면/u,
];

const CLAIM_REPLACEMENTS: Array<{ from: RegExp; to: string }> = [
  { from: /100%\s*해결/gi, to: "도움이 될 수 있음" },
  { from: /무조건/gi, to: "상황에 따라" },
  { from: /반드시 좋아집니다/gi, to: "개인차가 있을 수 있습니다" },
  { from: /완벽하게/gi, to: "보다 안정적으로" },
  { from: /완벽히\s*대체/gi, to: "100% 동일하게 구현하기 어렵" },
];

const QUESTION_ENDING_REGEX = /[?？]\s*$/;

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .trim();
}

function getLines(content: string): string[] {
  return content.split(/\r?\n/);
}

type Heading = {
  index: number;
  raw: string;
  text: string;
  isTemplate: boolean;
  isQuestion: boolean;
};

function parseHeadings(content: string): Heading[] {
  const lines = getLines(content);
  const results: Heading[] = [];
  lines.forEach((line, index) => {
    if (!/^##\s+/.test(line) && !/^###\s+/.test(line)) return;
    const raw = line.trim();
    const text = normalizeLine(raw.replace(/^###?\s+/, ""));
    results.push({
      index,
      raw,
      text,
      isTemplate: TEMPLATE_HEADING_PATTERNS.some((pattern) => pattern.test(raw)),
      isQuestion: QUESTION_ENDING_REGEX.test(text),
    });
  });
  return results;
}

function getSectionFirstBodyLine(content: string, headingIndex: number): string | null {
  const lines = getLines(content);
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (/^##\s+/.test(trimmed)) return null;
    if (/^\|/.test(trimmed)) continue;
    if (/^[-*]\s+/.test(trimmed)) continue;
    return trimmed;
  }
  return null;
}

function hasDirectAnswerLead(firstLine: string | null): boolean {
  if (!firstLine) return false;
  const plain = stripMarkdown(firstLine);
  if (plain.length < 30 || plain.length > 140) return false;
  if (QUESTION_ENDING_REGEX.test(plain)) return false;
  if (/^핵심 답변[:：]/.test(plain)) return false;
  const sentenceCount = plain.split(/[.!?。！？]\s*/).filter(Boolean).length;
  return sentenceCount <= 2;
}

function hasTable(content: string): boolean {
  return /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);
}

function countTables(content: string): number {
  const tableHeaderMatches = content.match(/^\|.+\|$/gm) ?? [];
  return tableHeaderMatches.filter((line) => line.includes("|")).length >= 3 ? 1 : 0;
}

function hasTemplateArtifacts(content: string): boolean {
  const lines = getLines(content).map((line) => line.trim());
  return (
    lines.some((line) => TEMPLATE_HEADING_PATTERNS.some((pattern) => pattern.test(line))) ||
    lines.some((line) => TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line)))
  );
}

function countSourceMentions(content: string): number {
  const matches = content.match(
    /공식 가이드|공식 자료|제품 설명서|관리 가이드|전문가 점검|상담|검사|진료|진단|권장/g
  );
  return matches?.length ?? 0;
}

function hasClaimRisk(content: string): boolean {
  return CLAIM_REPLACEMENTS.some(({ from }) => {
    from.lastIndex = 0;
    return from.test(content);
  });
}

function hasUncertaintySignal(content: string): boolean {
  return (
    content.includes("개인차") ||
    content.includes("상황에 따라") ||
    content.includes("사람마다")
  );
}

function buildPreviewDescription(content: string): string {
  return stripMarkdown(content).replace(/\s+/g, " ").slice(0, 120);
}

function detectPostType(article: ArticleContent): PostTypeGuard {
  const haystack = `${article.title} ${article.mainKeyword} ${article.subKeyword1} ${article.subKeyword2}`;
  const tableLines = (article.content.match(/^\|.+\|$/gm) ?? []).length;
  if (
    /가격|요금|프로모션|할인|이벤트가|월간/.test(haystack) &&
    tableLines >= 6
  ) {
    return "price-list";
  }
  if (/입고|신제품|컬렉션|출시|리뉴얼|브랜드 소개|프레임 추천/.test(haystack)) {
    return "product-intro";
  }
  return "general";
}

function shouldSuggestStructuredTable(article: ArticleContent): boolean {
  const subject = `${article.title} ${article.mainKeyword} ${article.subKeyword1} ${article.subKeyword2}`;
  return /비교|차이|vs|준비|시기|언제|비용|가격|관리|방법|체크|선택|기준/.test(subject);
}

function buildStructuredTable(article: ArticleContent): string {
  return [
    "## 판단 기준 정리",
    "",
    "| 항목 | 먼저 볼 포인트 | 현장 안내 |",
    "| :--- | :--- | :--- |",
    `| ${article.mainKeyword} | 현재 불편한 점과 사용 환경 | 실제 상태를 보고 우선순위를 정리 |`,
    `| ${article.subKeyword1} | 생활 습관과 관리 방식 | 반복되는 불편이 있는지 함께 확인 |`,
    `| ${article.subKeyword2} | 비용보다 체감 차이 | 과한 선택보다 맞는 선택을 우선 |`,
  ].join("\n");
}

type HeadingSignals = {
  total: number;
  meaningful: number;
  questionCount: number;
  questionRatio: number;
  directAnswerCount: number;
  directAnswerRatio: number;
};

function analyzeHeadingSignals(content: string): HeadingSignals {
  const headings = parseHeadings(content);
  const meaningful = headings.filter((heading) => !heading.isTemplate);
  const questionCount = meaningful.filter((heading) => heading.isQuestion).length;
  const directAnswerCount = meaningful.filter((heading) =>
    hasDirectAnswerLead(getSectionFirstBodyLine(content, heading.index))
  ).length;
  const meaningfulTotal = meaningful.length || 0;
  return {
    total: headings.length,
    meaningful: meaningfulTotal,
    questionCount,
    questionRatio: meaningfulTotal === 0 ? 0 : questionCount / meaningfulTotal,
    directAnswerCount,
    directAnswerRatio: meaningfulTotal === 0 ? 0 : directAnswerCount / meaningfulTotal,
  };
}

function scoreAiQuoteStructure(signals: HeadingSignals, table: boolean, templateArtifacts: boolean): number {
  let score = 0;

  if (signals.meaningful >= 4) score += 4;
  else if (signals.meaningful >= 3) score += 3;
  else if (signals.meaningful >= 2) score += 2;

  if (signals.questionRatio >= 0.5) score += 12;
  else if (signals.questionRatio >= 0.3) score += 8;
  else if (signals.questionRatio >= 0.1) score += 4;

  if (table) score += 9;
  if (!templateArtifacts) score += 5;

  return Math.max(0, Math.min(30, score));
}

function scoreTrustAndSources(
  content: string,
  sourceMentions: number,
  templateArtifacts: boolean
): number {
  let score = 0;
  if (!hasClaimRisk(content)) score += 10;
  if (sourceMentions >= 2) score += 8;
  else if (sourceMentions === 1) score += 4;
  if (hasUncertaintySignal(content)) score += 4;
  if (!templateArtifacts) score += 3;
  return Math.max(0, Math.min(25, score));
}

function scoreEntityAndAuthor(article: ArticleContent, templateArtifacts: boolean): number {
  const content = article.content;
  const hasShop = content.includes(article.shopName) ? 5 : 0;
  const hasCategory = content.includes(article.category) ? 5 : 0;
  const hasDate = content.includes(TODAY) ? 5 : 0;
  const artifactPenaltyOffset = templateArtifacts ? 0 : 5;
  return Math.max(0, Math.min(20, hasShop + hasCategory + hasDate + artifactPenaltyOffset));
}

function scoreContentQuality(
  article: ArticleContent,
  signals: HeadingSignals,
  templateArtifacts: boolean
): number {
  const content = article.content;
  const charCount = content.length;
  const hasKeywordCoverage =
    content.includes(article.mainKeyword) &&
    content.includes(article.subKeyword1) &&
    content.includes(article.subKeyword2);
  const validationPenalty = article.validation?.revisionReasons?.length ?? 0;

  let score = 0;
  if (charCount >= 1800) score += 8;
  else if (charCount >= 1400) score += 6;
  else score += 3;

  if (signals.directAnswerRatio >= 0.5) score += 8;
  else if (signals.directAnswerRatio >= 0.3) score += 5;
  else score += 2;

  if (hasKeywordCoverage) score += 5;
  else score += 2;

  if (!templateArtifacts) score += 2;
  score += Math.max(0, 2 - validationPenalty);

  return Math.max(0, Math.min(25, score));
}

function analyzeCategories(article: ArticleContent): GeoCategoryScore[] {
  const content = article.content;
  const headingSignals = analyzeHeadingSignals(content);
  const table = hasTable(content);
  const templateArtifacts = hasTemplateArtifacts(content);
  const sourceMentions = countSourceMentions(content);

  return [
    {
      key: "ai-quote-structure",
      label: "AI 인용 구조",
      score: scoreAiQuoteStructure(headingSignals, table, templateArtifacts),
      maxScore: 30,
    },
    {
      key: "trust-and-sources",
      label: "신뢰성 & 근거",
      score: scoreTrustAndSources(content, sourceMentions, templateArtifacts),
      maxScore: 25,
    },
    {
      key: "entity-and-author",
      label: "엔티티 & 지역성",
      score: scoreEntityAndAuthor(article, templateArtifacts),
      maxScore: 20,
    },
    {
      key: "content-quality",
      label: "본문 완성도",
      score: scoreContentQuality(article, headingSignals, templateArtifacts),
      maxScore: 25,
    },
  ];
}

function sampleHeadings(headings: Heading[], count = 2): Heading[] {
  return headings.slice(0, count);
}

function buildRecommendations(article: ArticleContent): GeoRecommendation[] {
  const content = article.content;
  const postType = detectPostType(article);
  const headings = parseHeadings(content);
  const meaningful = headings.filter((heading) => !heading.isTemplate);
  const signals = analyzeHeadingSignals(content);
  const templateArtifacts = hasTemplateArtifacts(content);
  const recommendations: GeoRecommendation[] = [];

  if (templateArtifacts) {
    recommendations.push({
      id: "remove-template-blocks",
      title: "레거시 GEO 흔적 제거",
      description: "FAQ, 핵심 답변, 확인 및 안내처럼 본문 흐름을 끊는 템플릿 블록을 걷어냅니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "이전 GEO가 남긴 기계식 블록은 AI 인용 시 오히려 감점 요인입니다.",
      before: "핵심 답변 / FAQ / 확인 및 안내 포함",
      after: "본문 안에서 자연스럽게 설명하는 구조로 정리",
      selectedByDefault: true,
    });
  }

  const canRewrite = postType === "general";

  if (canRewrite && signals.questionRatio < 0.5 && meaningful.length >= 2) {
    const beforeSample = sampleHeadings(
      meaningful.filter((heading) => !heading.isQuestion),
      1
    )[0];
    recommendations.push({
      id: "question-heading",
      title: "소제목 질문형 변환",
      description: "AI가 질문형 소제목을 사용자 쿼리와 직접 매칭합니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "Generative Engine이 답변을 뽑을 때 가장 먼저 찾는 신호입니다.",
      before: beforeSample ? beforeSample.raw : "설명형 소제목이 다수",
      after: "## 예: OO는 어떤 기준으로 선택하나요?",
      selectedByDefault: true,
    });
  }

  if (canRewrite && signals.directAnswerRatio < 0.5 && meaningful.length >= 2) {
    recommendations.push({
      id: "direct-answer-lead",
      title: "섹션별 핵심 답변 강화",
      description: "각 섹션 첫 줄에 40~80자 직답 문장을 추가해 AI 답변 추출을 돕습니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "AEO(Answer Engine Optimization) 핵심 요소로, 스니펫 추출 확률을 높입니다.",
      before: "섹션 첫 줄이 도입 문장으로 시작",
      after: "섹션 첫 줄에 40~80자 요약 답변 삽입",
      selectedByDefault: true,
    });
  }

  if (canRewrite && !hasTable(content) && shouldSuggestStructuredTable(article)) {
    recommendations.push({
      id: "comparison-table",
      title: "비교 테이블 추가",
      description: "구조화된 데이터로 AI가 정보를 추출·인용하기 쉽게 만듭니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "비교·기준·시기 정리 글에서 표는 AI가 가장 먼저 집는 구조화 신호입니다.",
      before: "비교 표 없음",
      after: "본문 중간에 3~4열 markdown 비교표 삽입",
      selectedByDefault: true,
    });
  }

  if (hasClaimRisk(content)) {
    recommendations.push({
      id: "soften-claims",
      title: "단정 표현 완화",
      description: "과도한 확정 표현을 덜어내고 개인차와 상황 차이를 반영합니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "의료법·광고법 관점 뿐 아니라 AI 신뢰 신호에서도 단정 표현은 감점 요인입니다.",
      before: "강한 확정 표현 포함",
      after: "상황에 따라 다를 수 있다는 표현으로 조정",
      selectedByDefault: true,
    });
  }

  return recommendations;
}

function buildGrade(score: number): GeoAnalysisResult["grade"] {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 55) return "fair";
  return "poor";
}

function buildSummary(score: number): string {
  if (score >= 90) return "AI 인용 구조와 신뢰 신호가 모두 안정적입니다.";
  if (score >= 75) return "기본 구조는 안정적이지만 질문형 소제목과 직답을 조금 더 다듬을 여지가 있습니다.";
  if (score >= 55) return "본문은 유지되지만 AI 인용 구조 신호가 약한 편입니다. 질문형 소제목과 섹션 직답을 보강하면 좋습니다.";
  return "AI 인용에 불리한 구조입니다. 질문형 소제목·섹션 직답·비교표를 함께 보강해야 합니다.";
}

export function runGeoHarness(
  article: ArticleContent,
  mode: GeoHarnessMode = "safe"
): GeoAnalysisResult {
  void mode;
  const categories = analyzeCategories(article);
  const score = categories.reduce((sum, item) => sum + item.score, 0);
  const citationDensityCount = countSourceMentions(article.content);
  const recommendations = buildRecommendations(article);

  return {
    score,
    grade: buildGrade(score),
    summary: buildSummary(score),
    categories,
    recommendations,
    previewTitle: article.title,
    previewDescription: buildPreviewDescription(article.content),
    citationDensityLabel:
      citationDensityCount >= 2 ? "높음" : citationDensityCount === 1 ? "보통" : "낮음",
    citationDensityCount,
  };
}

export function removeTemplateBlocks(content: string, article: ArticleContent): string {
  const lines = getLines(content);
  const next: string[] = [];
  let skippingTemplateSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^##\s+/.test(trimmed) || /^###\s+/.test(trimmed);
    const isTemplateHeading = TEMPLATE_HEADING_PATTERNS.some((pattern) => pattern.test(trimmed));

    if (isHeading && isTemplateHeading) {
      skippingTemplateSection = true;
      continue;
    }

    if (skippingTemplateSection && /^##\s+/.test(trimmed) && !isTemplateHeading) {
      skippingTemplateSection = false;
    }

    if (skippingTemplateSection) continue;
    if (TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) continue;
    if (trimmed === `${article.shopName} ${article.category} 상담 관점에서 보면`) continue;

    next.push(line);
  }

  return next.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function softenClaims(content: string): string {
  let next = content;
  for (const { from, to } of CLAIM_REPLACEMENTS) {
    next = next.replace(from, to);
  }
  return next;
}

function appendUniqueBlock(content: string, block: string): string {
  const marker = normalizeLine(block.split("\n")[0] ?? "");
  if (content.includes(marker)) return content;
  return `${content.trim()}\n\n${block}`;
}

export function applyGeoRecommendations(
  article: ArticleContent,
  selectedRecommendationIds: GeoRecommendation["id"][],
  mode: GeoHarnessMode = "safe"
): GeoOptimizationResult {
  const analysisBefore = runGeoHarness(article, mode);
  let nextContent = article.content;

  if (selectedRecommendationIds.includes("remove-template-blocks")) {
    nextContent = removeTemplateBlocks(nextContent, article);
  }

  if (selectedRecommendationIds.includes("soften-claims")) {
    nextContent = softenClaims(nextContent);
  }

  if (
    selectedRecommendationIds.includes("comparison-table") &&
    shouldSuggestStructuredTable(article) &&
    !hasTable(nextContent)
  ) {
    nextContent = appendUniqueBlock(nextContent, buildStructuredTable(article));
  }

  const appliedDeterministicIds = selectedRecommendationIds.filter(
    (id) => id === "remove-template-blocks" || id === "soften-claims" || id === "comparison-table"
  );

  const analysisAfter = runGeoHarness({ ...article, content: nextContent }, mode);

  if (analysisAfter.score < analysisBefore.score) {
    return {
      appliedRecommendationIds: [],
      optimizedContent: article.content,
      analysisBefore,
      analysisAfter: analysisBefore,
    };
  }

  return {
    appliedRecommendationIds: appliedDeterministicIds,
    optimizedContent: nextContent,
    analysisBefore,
    analysisAfter,
  };
}

export {
  analyzeHeadingSignals,
  countTables,
  detectPostType,
  hasTable,
  hasTemplateArtifacts,
};
export type { HeadingSignals };
