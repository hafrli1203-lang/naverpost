import type {
  ArticleContent,
  GeoAnalysisResult,
  GeoCategoryScore,
  GeoRecommendation,
  GeoOptimizationResult,
} from "@/types";

type Heading = {
  level: 2 | 3;
  index: number;
  raw: string;
  text: string;
};

const TODAY = "2026-04-18";

const ABSOLUTE_PHRASE_REPLACEMENTS: Array<{ from: RegExp; to: string }> = [
  { from: /100%\s*해결/gi, to: "도움이 될 수 있는 방향으로" },
  { from: /무조건\s*좋(?:다|아요|습니다)/gi, to: "상황에 따라 도움이 될 수 있습니다" },
  { from: /반드시\s*필요/gi, to: "필요할 수 있습니다" },
  { from: /완벽(?:하게)?/gi, to: "보다 안정적으로" },
  { from: /즉시\s*효과/gi, to: "상대적으로 빠른 체감" },
  { from: /최고(?:의)?/gi, to: "선호도가 높은" },
  { from: /확실한\s*개선/gi, to: "개선 가능성을 기대할 수 있는" },
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

function parseHeadings(content: string): Heading[] {
  return getLines(content)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^##\s+/.test(line) || /^###\s+/.test(line))
    .map(({ line, index }) => ({
      level: line.startsWith("### ") ? 3 : 2,
      index,
      raw: line,
      text: normalizeLine(line.replace(/^###?\s+/, "")),
    }));
}

function hasQuestionHeading(headings: Heading[]): boolean {
  return headings.some((heading) => /\?$|누구|어떻게|무엇|왜|비교/.test(heading.text));
}

function hasTable(content: string): boolean {
  return /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);
}

function hasFaq(content: string): boolean {
  return /##\s*faq/i.test(content) || /자주 묻는 질문/.test(content) || /Q\.\s*/.test(content);
}

function hasSourceSection(content: string): boolean {
  return /##\s*(확인 및 안내|참고 및 확인 포인트|참고 자료|출처 안내)/.test(content);
}

function hasAuthorMeta(content: string, article: ArticleContent): boolean {
  return (
    content.includes(`${article.shopName}`) &&
    (content.includes("업데이트 기준일") || content.includes("상담 관점"))
  );
}

function hasSectionAnswer(content: string): boolean {
  return /핵심 답변:/.test(content);
}

function hasMedicalClaimRisk(content: string): boolean {
  return ABSOLUTE_PHRASE_REPLACEMENTS.some(({ from }) => from.test(content));
}

function countSourceMentions(content: string): number {
  const matches = content.match(/공개 자료|상담 관점|업데이트 기준일|확인 및 안내|참고 자료|출처/g);
  return matches?.length ?? 0;
}

function buildPreviewDescription(content: string): string {
  const cleaned = stripMarkdown(content).replace(/\s+/g, " ");
  return cleaned.slice(0, 120);
}

function buildQuestionHeading(article: ArticleContent, currentHeading?: string): string {
  const base = currentHeading || article.mainKeyword || article.title;
  if (base.includes("비교")) {
    return `## ${base.replace(/\?+$/, "")}는 어떻게 비교하면 좋을까요?`;
  }
  if (base.includes("준비") || base.includes("상담")) {
    return `## ${base.replace(/\?+$/, "")} 전에 먼저 확인할 것은 무엇일까요?`;
  }
  return `## ${base.replace(/\?+$/, "")}는 어떤 기준으로 보면 좋을까요?`;
}

function buildComparisonTable(article: ArticleContent): string {
  return [
    "## 비교해서 보면 더 쉬운 포인트",
    "",
    "| 항목 | 먼저 볼 기준 | 확인 포인트 |",
    "| :--- | :--- | :--- |",
    `| ${article.mainKeyword} | 현재 불편한 점 | 생활 패턴, 예산, 유지 부담을 함께 보는 편이 좋습니다. |`,
    `| ${article.subKeyword1} | 적용이 쉬운지 | 바로 실천할 수 있는지, 일상에서 유지 가능한지 확인하는 것이 좋습니다. |`,
    `| ${article.subKeyword2} | 상담이 필요한지 | 스스로 판단하기 어려운 부분은 상담에서 다시 확인하는 편이 안전합니다. |`,
  ].join("\n");
}

function buildSectionAnswer(headingText: string): string {
  const normalized = headingText.replace(/\?+$/, "");
  return `핵심 답변: ${normalized}는 현재 상태, 생활 패턴, 기대하는 변화 기준으로 나눠 보면 훨씬 이해가 쉬워집니다.`;
}

function buildFaqSection(article: ArticleContent): string {
  return [
    "## FAQ",
    "",
    `### ${article.mainKeyword}는 누구에게 먼저 확인이 필요할까요?`,
    `핵심 답변: ${article.mainKeyword}는 증상, 생활 패턴, 기존 관리 이력을 함께 보고 판단하는 편이 좋습니다.`,
    "",
    `### ${article.subKeyword1}와 ${article.subKeyword2}는 어떻게 비교하면 좋을까요?`,
    `핵심 답변: ${article.subKeyword1}와 ${article.subKeyword2}는 비용, 유지 흐름, 회복 부담, 적용 대상 기준으로 나눠 비교하면 이해가 쉽습니다.`,
    "",
    `### ${article.shopName}에서 상담 전에 준비하면 좋은 것은 무엇인가요?`,
    `핵심 답변: 현재 불편한 점, 기대하는 변화, 예산, 일정 제약을 정리해 가면 ${article.category} 상담이 훨씬 구체적으로 진행됩니다.`,
  ].join("\n");
}

function buildNaturalSourceSection(article: ArticleContent): string {
  const sourceLines =
    article.brief?.researchSummary
      ?.split(/\r?\n/)
      .map((line) => stripMarkdown(normalizeLine(line)))
      .filter(Boolean)
      .slice(0, 2) ?? [];

  const summarySentence =
    sourceLines.length > 0
      ? `공개 자료에서는 ${sourceLines.join(" 또한 ")}`
      : "공개 자료와 일반적인 상담 기준에서는 생활 패턴과 현재 상태를 함께 보는 접근이 반복적으로 강조됩니다.";

  return [
    "## 확인 및 안내",
    "",
    `${article.shopName} ${article.category} 상담 관점에서 보면 ${article.mainKeyword}는 한 가지 기준으로 단정하기보다 현재 불편한 점과 생활 패턴을 함께 보는 편이 좋습니다.`,
    `이 글은 ${TODAY} 기준 공개 자료와 현장 상담 관점을 바탕으로 정리했으며, ${summarySentence}`,
    "개인 상태에 따라 적용 방법과 우선순위는 달라질 수 있으므로, 실제 선택 전에는 상담에서 한 번 더 확인하는 편이 안전합니다.",
  ].join("\n");
}

function buildAuthorMeta(article: ArticleContent): string {
  return [
    `${article.shopName} ${article.category} 기준으로 정리한 내용입니다.`,
    `업데이트 기준일은 ${TODAY}입니다.`,
    "",
  ].join("\n");
}

function analyzeCategories(article: ArticleContent): GeoCategoryScore[] {
  const content = article.content;
  const headings = parseHeadings(content);
  const questionHeading = hasQuestionHeading(headings);
  const table = hasTable(content);
  const faq = hasFaq(content);
  const sectionAnswer = hasSectionAnswer(content);
  const sources = hasSourceSection(content);
  const authorMeta = hasAuthorMeta(content, article);
  const citationCount = countSourceMentions(content);
  const charCount = content.length;
  const hasKeywordCoverage =
    content.includes(article.mainKeyword) &&
    content.includes(article.subKeyword1) &&
    content.includes(article.subKeyword2);
  const validationPenalty = article.validation.revisionReasons.length * 2;

  return [
    {
      key: "ai-quote-structure",
      label: "AI 인용 구조",
      score: Math.max(
        0,
        Math.min(30, (questionHeading ? 8 : 0) + (table ? 8 : 0) + (sectionAnswer ? 8 : 0) + (faq ? 6 : 0))
      ),
      maxScore: 30,
    },
    {
      key: "trust-and-sources",
      label: "신뢰성 & 출처",
      score: Math.max(
        0,
        Math.min(
          25,
          (sources ? 10 : 0) +
            (!hasMedicalClaimRisk(content) ? 8 : 0) +
            (citationCount >= 2 ? 4 : citationCount > 0 ? 2 : 0) +
            (authorMeta ? 3 : 0)
        )
      ),
      maxScore: 25,
    },
    {
      key: "entity-and-author",
      label: "엔티티 & 작성자",
      score: Math.max(
        0,
        Math.min(
          20,
          (content.includes(article.shopName) ? 8 : 0) +
            (content.includes(article.category) ? 4 : 0) +
            (authorMeta ? 4 : 0) +
            (content.includes(TODAY) ? 4 : 0)
        )
      ),
      maxScore: 20,
    },
    {
      key: "content-quality",
      label: "콘텐츠 품질",
      score: Math.max(
        0,
        Math.min(
          25,
          (charCount >= 1800 ? 8 : charCount >= 1400 ? 6 : 3) +
            (headings.length >= 3 ? 6 : headings.length >= 2 ? 4 : 2) +
            (hasKeywordCoverage ? 5 : 2) +
            Math.max(0, 6 - validationPenalty)
        )
      ),
      maxScore: 25,
    },
  ];
}

function buildRecommendations(article: ArticleContent, categories: GeoCategoryScore[]): GeoRecommendation[] {
  const content = article.content;
  const headings = parseHeadings(content);
  const firstHeading = headings[0];
  const recommendations: GeoRecommendation[] = [];

  if (!hasQuestionHeading(headings)) {
    recommendations.push({
      id: "question-heading",
      title: "질문형 소제목 추가",
      description: "검색형 질문에 바로 답하는 구조로 바꾸면 인용 가능성이 올라갑니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "질문형 소제목은 GEO/AEO 구조 점수에 직접 도움이 됩니다.",
      before: firstHeading?.raw ?? "질문형 소제목 없음",
      after: buildQuestionHeading(article, firstHeading?.text),
      selectedByDefault: true,
    });
  }

  if (!hasTable(content)) {
    recommendations.push({
      id: "comparison-table",
      title: "비교표 추가",
      description: "핵심 정보를 한눈에 비교할 수 있으면 구조화 점수가 좋아집니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "비교표는 요약과 인용에 유리한 구조 신호입니다.",
      before: "비교표 없음",
      after: "| 항목 | 먼저 볼 기준 | 확인 포인트 |",
      selectedByDefault: true,
    });
  }

  if (hasMedicalClaimRisk(content)) {
    recommendations.push({
      id: "soften-claims",
      title: "과장 표현 완화",
      description: "단정적인 문장을 줄이면 신뢰도 감점 위험을 낮출 수 있습니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "과장 표현은 신뢰성 점수와 직접 연결됩니다.",
      before: "강한 단정 표현 포함",
      after: "상황에 따라 도움이 될 수 있는 표현으로 조정",
      selectedByDefault: true,
    });
  }

  if (!hasSectionAnswer(content)) {
    recommendations.push({
      id: "section-answer",
      title: "섹션별 핵심 답변 추가",
      description: "각 소제목 바로 아래에 짧은 답을 두면 정보 이해가 빨라집니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "짧은 핵심 답변은 AI 인용과 검색형 요약에 유리합니다.",
      before: "핵심 답변 없음",
      after: "핵심 답변: 먼저 볼 기준을 짧게 정리",
      selectedByDefault: true,
    });
  }

  if (!hasFaq(content)) {
    recommendations.push({
      id: "faq",
      title: "FAQ 추가",
      description: "자주 묻는 질문 구조를 넣으면 검색형 유입 대응력이 좋아집니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "FAQ는 질문형 검색 대응과 구조화 점수에 도움이 됩니다.",
      before: "FAQ 없음",
      after: "## FAQ",
      selectedByDefault:
        (categories.find((item) => item.key === "ai-quote-structure")?.score ?? 0) < 24,
    });
  }

  if (!hasSourceSection(content)) {
    recommendations.push({
      id: "source-note",
      title: "확인 및 안내 문단 추가",
      description: "출처 신호는 남기되 운영 메모처럼 보이지 않도록 자연 문장으로 정리합니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "신뢰 신호는 유지하면서 독자 경험을 덜 해치는 방식입니다.",
      before: "출처 안내 문단 없음",
      after: "## 확인 및 안내",
      selectedByDefault: true,
    });
  }

  if (!hasAuthorMeta(content, article)) {
    recommendations.push({
      id: "author-meta",
      title: "작성 주체와 기준일 추가",
      description: "작성 관점과 업데이트 기준일을 자연스럽게 넣어 신뢰도를 보강합니다.",
      category: "entity-and-author",
      impact: "medium",
      reason: "작성 주체와 기준일은 엔티티/작성자 점수에 도움이 됩니다.",
      before: "작성 기준 문장 없음",
      after: `${article.shopName} ${article.category} 기준으로 정리한 내용입니다.`,
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
  if (score >= 90) return "생성형 AI 인용 구조와 신뢰 신호가 잘 정리된 상태입니다.";
  if (score >= 75) return "기본 구조는 안정적이지만 일부 신뢰 신호를 더 보강할 수 있습니다.";
  if (score >= 55) return "구조와 신뢰 신호가 일부 부족해 발행 전 보강이 필요합니다.";
  return "GEO 관점에서 구조 보강이 많이 필요한 상태입니다.";
}

export function runGeoHarness(article: ArticleContent): GeoAnalysisResult {
  const categories = analyzeCategories(article);
  const score = categories.reduce((sum, item) => sum + item.score, 0);
  const citationDensityCount = countSourceMentions(article.content);
  const recommendations = buildRecommendations(article, categories);

  return {
    score,
    grade: buildGrade(score),
    summary: buildSummary(score),
    categories,
    recommendations,
    previewTitle: article.title,
    previewDescription: buildPreviewDescription(article.content),
    citationDensityLabel:
      citationDensityCount >= 2 ? "충분" : citationDensityCount >= 1 ? "보통" : "부족",
    citationDensityCount,
  };
}

function replaceFirstHeading(lines: string[], article: ArticleContent): string[] {
  const headings = parseHeadings(lines.join("\n"));
  const firstHeading = headings[0];
  if (!firstHeading) {
    return [buildQuestionHeading(article), "", ...lines];
  }

  if (/\?$|누구|어떻게|무엇|왜|비교/.test(firstHeading.text)) {
    return lines;
  }

  const next = [...lines];
  next[firstHeading.index] = buildQuestionHeading(article, firstHeading.text);
  return next;
}

function injectSectionAnswers(lines: string[]): string[] {
  const next: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    next.push(line);

    if ((/^##\s+/.test(line) || /^###\s+/.test(line)) && !/^##\s*faq/i.test(line)) {
      const headingText = normalizeLine(line.replace(/^###?\s+/, ""));
      const nextLine = normalizeLine(lines[index + 1] ?? "");
      if (!/^핵심 답변:/.test(nextLine)) {
        next.push(buildSectionAnswer(headingText));
      }
    }
  }

  return next;
}

function softenClaims(content: string): string {
  let next = content;
  for (const { from, to } of ABSOLUTE_PHRASE_REPLACEMENTS) {
    next = next.replace(from, to);
  }
  return next;
}

function appendUniqueBlock(content: string, block: string): string {
  const normalizedBlock = normalizeLine(block.split("\n")[0] ?? "");
  if (content.includes(normalizedBlock)) {
    return content;
  }
  return `${content.trim()}\n\n${block}`;
}

function prependAuthorMeta(content: string, article: ArticleContent): string {
  if (hasAuthorMeta(content, article)) return content;
  return `${buildAuthorMeta(article)}${content.trim()}`;
}

export function applyGeoRecommendations(
  article: ArticleContent,
  selectedRecommendationIds: GeoRecommendation["id"][]
): GeoOptimizationResult {
  const analysisBefore = runGeoHarness(article);
  let nextContent = article.content;

  if (selectedRecommendationIds.includes("question-heading")) {
    nextContent = replaceFirstHeading(getLines(nextContent), article).join("\n");
  }

  if (selectedRecommendationIds.includes("section-answer")) {
    nextContent = injectSectionAnswers(getLines(nextContent)).join("\n");
  }

  if (selectedRecommendationIds.includes("comparison-table")) {
    nextContent = appendUniqueBlock(nextContent, buildComparisonTable(article));
  }

  if (selectedRecommendationIds.includes("faq")) {
    nextContent = appendUniqueBlock(nextContent, buildFaqSection(article));
  }

  if (selectedRecommendationIds.includes("source-note")) {
    nextContent = appendUniqueBlock(nextContent, buildNaturalSourceSection(article));
  }

  if (selectedRecommendationIds.includes("author-meta")) {
    nextContent = prependAuthorMeta(nextContent, article);
  }

  if (selectedRecommendationIds.includes("soften-claims")) {
    nextContent = softenClaims(nextContent);
  }

  const analysisAfter = runGeoHarness({
    ...article,
    content: nextContent,
  });

  return {
    appliedRecommendationIds: selectedRecommendationIds,
    optimizedContent: nextContent,
    analysisBefore,
    analysisAfter,
  };
}
