import type {
  ArticleContent,
  GeoAnalysisResult,
  GeoCategoryScore,
  GeoOptimizationResult,
  GeoRecommendation,
} from "@/types";

export type GeoHarnessMode = "safe" | "aggressive";

const TODAY = "2026-04-19";

const TEMPLATE_HEADING_PATTERNS = [
  /^##\s*FAQ\s*$/i,
  /^##\s*자주 묻는 질문\s*$/i,
  /^##\s*확인 및 안내\s*$/i,
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
];

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

function getParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((block) => stripMarkdown(block).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((block) => !block.startsWith("|"))
    .filter((block) => !/^\s*[-*]\s/.test(block))
    .filter((block) => !TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(block)));
}

type Heading = {
  index: number;
  raw: string;
  text: string;
};

function parseHeadings(content: string): Heading[] {
  return getLines(content)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^##\s+/.test(line) || /^###\s+/.test(line))
    .map(({ line, index }) => ({
      index,
      raw: line,
      text: normalizeLine(line.replace(/^###?\s+/, "")),
    }));
}

function isTemplateHeading(line: string): boolean {
  return TEMPLATE_HEADING_PATTERNS.some((pattern) => pattern.test(line.trim()));
}

function hasTable(content: string): boolean {
  return /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);
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
  return CLAIM_REPLACEMENTS.some(({ from }) => from.test(content));
}

function buildPreviewDescription(content: string): string {
  return stripMarkdown(content).replace(/\s+/g, " ").slice(0, 120);
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

function analyzeCategories(
  article: ArticleContent,
  _mode: GeoHarnessMode = "safe"
): GeoCategoryScore[] {
  const content = article.content;
  const headings = parseHeadings(content);
  const meaningfulHeadings = headings.filter((heading) => !isTemplateHeading(heading.raw));
  const table = hasTable(content);
  const templateArtifacts = hasTemplateArtifacts(content);
  const sourceMentions = countSourceMentions(content);
  const charCount = content.length;
  const hasKeywordCoverage =
    content.includes(article.mainKeyword) &&
    content.includes(article.subKeyword1) &&
    content.includes(article.subKeyword2);
  const validationPenalty = article.validation.revisionReasons.length * 2;
  const localSignals =
    (content.includes(article.shopName) ? 1 : 0) +
    (content.includes(article.category) ? 1 : 0) +
    (content.includes(TODAY) ? 1 : 0);

  return [
    {
      key: "ai-quote-structure",
      label: "AI 인용 구조",
      score: Math.max(
        0,
        Math.min(
          30,
          (meaningfulHeadings.length >= 4
            ? 12
            : meaningfulHeadings.length >= 3
              ? 10
              : meaningfulHeadings.length >= 2
                ? 7
                : 3) +
            (table ? 10 : 0) +
            (!templateArtifacts ? 8 : 0)
        )
      ),
      maxScore: 30,
    },
    {
      key: "trust-and-sources",
      label: "신뢰성 & 근거",
      score: Math.max(
        0,
        Math.min(
          25,
          (!hasClaimRisk(content) ? 10 : 0) +
            (sourceMentions >= 2 ? 8 : sourceMentions === 1 ? 4 : 0) +
            (!templateArtifacts ? 3 : 0) +
            (content.includes("개인차") || content.includes("상황에 따라") ? 4 : 0)
        )
      ),
      maxScore: 25,
    },
    {
      key: "entity-and-author",
      label: "엔티티 & 지역성",
      score: Math.max(0, Math.min(20, localSignals * 5 + (!templateArtifacts ? 5 : 0))),
      maxScore: 20,
    },
    {
      key: "content-quality",
      label: "본문 완성도",
      score: Math.max(
        0,
        Math.min(
          25,
          (charCount >= 1800 ? 8 : charCount >= 1400 ? 6 : 3) +
            (meaningfulHeadings.length >= 3 ? 6 : meaningfulHeadings.length >= 2 ? 4 : 2) +
            (hasKeywordCoverage ? 5 : 2) +
            (!templateArtifacts ? 2 : 0) +
            Math.max(0, 4 - validationPenalty)
        )
      ),
      maxScore: 25,
    },
  ];
}

function buildRecommendations(
  article: ArticleContent,
  _mode: GeoHarnessMode = "safe"
): GeoRecommendation[] {
  const content = article.content;
  const recommendations: GeoRecommendation[] = [];

  if (hasTemplateArtifacts(content)) {
    recommendations.push({
      id: "remove-template-blocks",
      title: "기계식 GEO 블록 제거",
      description: "FAQ, 핵심 답변, 확인 및 안내처럼 본문 흐름을 끊는 템플릿 블록을 걷어냅니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "자연스러운 본문 흐름을 해치는 부속 블록은 제거하는 편이 안전합니다.",
      before: "핵심 답변 / FAQ / 확인 및 안내 포함",
      after: "본문 안에서 자연스럽게 설명하는 구조로 정리",
      selectedByDefault: true,
    });
  }

  if (!hasTable(content) && shouldSuggestStructuredTable(article)) {
    recommendations.push({
      id: "comparison-table",
      title: "판단 기준 표 보강",
      description: "비교나 관리 기준이 중요한 글은 짧은 표가 핵심 정보를 빨리 보여줍니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "표는 비교 목적이 분명한 글에서만 제한적으로 쓰는 편이 자연스럽습니다.",
      before: "판단 기준 표 없음",
      after: "| 항목 | 먼저 볼 포인트 | 현장 안내 |",
      selectedByDefault: false,
    });
  }

  if (hasClaimRisk(content)) {
    recommendations.push({
      id: "soften-claims",
      title: "단정 표현 완화",
      description: "과도한 확정 표현을 덜어내고 개인차와 사용 환경 차이를 반영합니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "안경원 정보 글은 단정 대신 설명형 문장이 더 안전합니다.",
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
  if (score >= 90) return "구조와 신뢰 신호가 모두 안정적입니다.";
  if (score >= 75) return "기본 구조는 안정적이지만 근거와 엔티티 신호를 조금 더 다듬을 여지가 있습니다.";
  if (score >= 55) return "본문 흐름은 유지되지만 GEO 신호가 약한 편입니다.";
  return "GEO 구조와 본문 신뢰 신호를 더 보강할 필요가 있습니다.";
}

export function runGeoHarness(
  article: ArticleContent,
  mode: GeoHarnessMode = "safe"
): GeoAnalysisResult {
  const categories = analyzeCategories(article, mode);
  const score = categories.reduce((sum, item) => sum + item.score, 0);
  const citationDensityCount = countSourceMentions(article.content);
  const recommendations = buildRecommendations(article, mode);

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

function removeTemplateBlocks(content: string, article: ArticleContent): string {
  const lines = getLines(content);
  const next: string[] = [];
  let skippingTemplateSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^##\s+/.test(trimmed) || /^###\s+/.test(trimmed);

    if (isHeading && isTemplateHeading(trimmed)) {
      skippingTemplateSection = true;
      continue;
    }

    if (skippingTemplateSection && /^##\s+/.test(trimmed) && !isTemplateHeading(trimmed)) {
      skippingTemplateSection = false;
    }

    if (skippingTemplateSection) continue;
    if (TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) continue;
    if (trimmed === `${article.shopName} ${article.category} 상담 관점에서 보면`) continue;

    next.push(line);
  }

  return next.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function softenClaims(content: string): string {
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

  if (selectedRecommendationIds.includes("comparison-table") && shouldSuggestStructuredTable(article)) {
    nextContent = appendUniqueBlock(nextContent, buildStructuredTable(article));
  }

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
    appliedRecommendationIds: selectedRecommendationIds.filter(
      (id) => id === "remove-template-blocks" || id === "soften-claims" || id === "comparison-table"
    ),
    optimizedContent: nextContent,
    analysisBefore,
    analysisAfter,
  };
}
