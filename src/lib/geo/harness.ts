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

const TODAY = "2026-04-17";

const ABSOLUTE_PHRASE_REPLACEMENTS: Array<{ from: RegExp; to: string }> = [
  { from: /100%\s*해결/g, to: "동일하게 해결하기 어렵습니다" },
  { from: /완벽하게\s*대체/gi, to: "동일한 결과로 대체" },
  { from: /부작용이\s*전혀\s*없/gi, to: "개인차가 있을 수 있" },
  { from: /무조건/gi, to: "상황에 따라" },
  { from: /반드시\s*좋/gi, to: "도움이 될 수 있" },
  { from: /확실하게/gi, to: "상대적으로" },
  { from: /즉시\s*효과/gi, to: "비교적 빠른 변화를 체감" },
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
  return headings.some((heading) => /\?$|까요\?|인가요\?|나요\?/.test(heading.text));
}

function hasTable(content: string): boolean {
  return /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);
}

function hasFaq(content: string): boolean {
  return /##\s*(faq|자주 묻는 질문)/i.test(content) || /Q\.\s*/.test(content);
}

function hasSourceSection(content: string): boolean {
  return /##\s*(참고|출처|참고 자료|참고 및 확인 포인트)/i.test(content) || /출처[:：]/.test(content);
}

function hasAuthorMeta(content: string, article: ArticleContent): boolean {
  return (
    content.includes(`작성 주체: ${article.shopName}`) ||
    content.includes(`작성 기준: ${article.shopName}`) ||
    content.includes("업데이트 일자:")
  );
}

function hasSectionAnswer(content: string): boolean {
  return /핵심 답변[:：]/.test(content) || /한 줄 요약[:：]/.test(content);
}

function hasMedicalClaimRisk(content: string): boolean {
  return ABSOLUTE_PHRASE_REPLACEMENTS.some(({ from }) => from.test(content));
}

function countSourceMentions(content: string): number {
  const matches = content.match(/출처[:：]|참고[:：]|연구|가이드라인|학회|논문|자료/g);
  return matches?.length ?? 0;
}

function buildPreviewDescription(content: string): string {
  const cleaned = stripMarkdown(content).replace(/\s+/g, " ");
  return cleaned.slice(0, 120);
}

function buildQuestionHeading(article: ArticleContent, currentHeading?: string): string {
  const base = currentHeading || article.mainKeyword || article.title;
  if (base.includes("차이")) {
    return `## ${base.replace(/\?+$/, "")}는 어떤 차이가 있나요?`;
  }
  if (base.includes("효과") || base.includes("시술") || base.includes("수술")) {
    return `## ${base.replace(/\?+$/, "")}는 어떻게 확인해야 할까요?`;
  }
  return `## ${base.replace(/\?+$/, "")}는 무엇인가요?`;
}

function buildComparisonTable(article: ArticleContent): string {
  return [
    "## 한눈에 보는 핵심 비교",
    "",
    "| 구분 | 핵심 확인 포인트 | 설명 |",
    "| :--- | :--- | :--- |",
    `| ${article.mainKeyword} | 적용 대상과 기대 포인트 | ${article.mainKeyword}를 볼 때는 대상, 방식, 유지 관점까지 함께 확인하는 것이 좋습니다. |`,
    `| ${article.subKeyword1} | 상담 시 비교 질문 | ${article.subKeyword1}와의 차이는 회복 흐름, 비용, 적합 대상 기준으로 나눠 보는 편이 좋습니다. |`,
    `| ${article.subKeyword2} | 선택 전 체크 항목 | ${article.subKeyword2}는 부작용 가능성, 유지 기간, 생활 패턴 적합성을 함께 확인해야 합니다. |`,
  ].join("\n");
}

function buildSectionAnswer(headingText: string): string {
  const normalized = headingText.replace(/\?+$/, "");
  return `핵심 답변: 이 섹션에서는 ${normalized}를 판단할 때 먼저 봐야 할 기준을 짧게 정리합니다.`;
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

function buildSourceSection(article: ArticleContent): string {
  const sourceLines = article.brief?.researchSummary
    ?.split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .slice(0, 3) ?? [];

  const bullets = sourceLines.length > 0
    ? sourceLines.map((line) => `- ${line}`)
    : [
        "- 작성 시점의 공개 자료와 일반적인 상담 기준을 바탕으로 정리했습니다.",
        "- 최종 결정 전에는 개인 상태와 일정, 비용 조건을 별도로 확인하는 편이 좋습니다.",
      ];

  return [
    "## 참고 및 확인 포인트",
    "",
    `- 작성 기준: ${article.shopName} ${article.category} 콘텐츠 가이드`,
    `- 업데이트 일자: ${TODAY}`,
    ...bullets,
  ].join("\n");
}

function buildAuthorMeta(article: ArticleContent): string {
  return [
    `- 작성 주체: ${article.shopName}`,
    `- 분류: ${article.category}`,
    `- 업데이트 일자: ${TODAY}`,
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

  const categories: GeoCategoryScore[] = [
    {
      key: "ai-quote-structure",
      label: "AI 인용 구조",
      score: Math.max(
        0,
        Math.min(
          30,
          (questionHeading ? 8 : 0) +
            (table ? 8 : 0) +
            (sectionAnswer ? 8 : 0) +
            (faq ? 6 : 0)
        )
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
      label: "엔티티 & 저자",
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

  return categories;
}

function buildRecommendations(article: ArticleContent, categories: GeoCategoryScore[]): GeoRecommendation[] {
  const content = article.content;
  const headings = parseHeadings(content);
  const firstHeading = headings[0];
  const recommendations: GeoRecommendation[] = [];

  if (!hasQuestionHeading(headings)) {
    recommendations.push({
      id: "question-heading",
      title: "소제목 질문형 변환",
      description: "AI와 검색엔진이 직접 답변을 매칭하기 쉬운 질문형 소제목으로 바꿉니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "질문형 소제목이 없어서 AEO/GEO 추출 포인트가 약합니다.",
      before: firstHeading?.raw ?? "질문형 소제목 없음",
      after: buildQuestionHeading(article, firstHeading?.text),
      selectedByDefault: true,
    });
  }

  if (!hasTable(content)) {
    recommendations.push({
      id: "comparison-table",
      title: "비교 테이블 추가",
      description: "핵심 차이를 표로 정리해 생성형 AI가 구조적으로 읽기 쉽게 만듭니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "표가 없어서 차이점·선택 기준을 구조적으로 인용하기 어렵습니다.",
      before: "비교 표 없음",
      after: "| 구분 | 핵심 확인 포인트 | 설명 |",
      selectedByDefault: true,
    });
  }

  if (hasMedicalClaimRisk(content)) {
    recommendations.push({
      id: "soften-claims",
      title: "의료법 저촉 표현 수정",
      description: "과장되거나 단정적인 표현을 완곡한 정보형 문장으로 바꿉니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "과장 표현은 신뢰성과 검색 노출 안정성을 동시에 떨어뜨립니다.",
      before: "단정형 표현 존재",
      after: "상황에 따라, 개인차가 있을 수 있습니다, 동일하게 보기 어렵습니다",
      selectedByDefault: true,
    });
  }

  if (!hasSectionAnswer(content)) {
    recommendations.push({
      id: "section-answer",
      title: "섹션별 핵심 답변 강화",
      description: "각 섹션 시작부에 40~60자 내외의 요약 답변을 넣어 답변 추출성을 높입니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "섹션 요약이 없으면 검색엔진이 핵심 문장을 뽑기 어렵습니다.",
      before: "핵심 답변 라인 없음",
      after: "핵심 답변: 이 섹션에서는 ...를 먼저 정리합니다.",
      selectedByDefault: true,
    });
  }

  if (!hasFaq(content)) {
    recommendations.push({
      id: "faq",
      title: "FAQ 섹션 추가",
      description: "자주 묻는 질문 섹션을 추가해 검색의 직접 답변 패턴을 강화합니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "FAQ가 없어서 질문형 검색 수요를 흡수하기 어렵습니다.",
      before: "FAQ 없음",
      after: "## FAQ",
      selectedByDefault:
        (categories.find((item) => item.key === "ai-quote-structure")?.score ?? 0) < 24,
    });
  }

  if (!hasSourceSection(content)) {
    recommendations.push({
      id: "source-note",
      title: "출처 및 확인 포인트 추가",
      description: "참고 자료와 검토 기준을 명시해 인용 신뢰도를 보강합니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "출처 및 업데이트 기준이 없어 신뢰 신호가 약합니다.",
      before: "참고/출처 섹션 없음",
      after: "## 참고 및 확인 포인트",
      selectedByDefault: true,
    });
  }

  if (!hasAuthorMeta(content, article)) {
    recommendations.push({
      id: "author-meta",
      title: "작성 주체 및 업데이트 정보 추가",
      description: "매장명, 분류, 업데이트 일자를 명시해 엔티티 신호를 보강합니다.",
      category: "entity-and-author",
      impact: "medium",
      reason: "작성 주체와 업데이트 일자가 명시되지 않아 엔티티 신호가 약합니다.",
      before: "작성 주체/업데이트 정보 없음",
      after: `- 작성 주체: ${article.shopName}`,
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
  if (score >= 75) return "전반적으로 양호하지만 몇 가지 GEO 구조 보강 여지가 있습니다.";
  if (score >= 55) return "핵심 GEO 요소를 보강하면 인용 가능성을 더 높일 수 있습니다.";
  return "GEO 핵심 구조가 부족해 후처리 보강이 필요한 상태입니다.";
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
    citationDensityLabel: citationDensityCount >= 2 ? "우수" : citationDensityCount >= 1 ? "보통" : "부족",
    citationDensityCount,
  };
}

function replaceFirstHeading(lines: string[], article: ArticleContent): string[] {
  const headings = parseHeadings(lines.join("\n"));
  const firstHeading = headings[0];
  if (!firstHeading) {
    return [buildQuestionHeading(article), "", ...lines];
  }

  if (/\?$|까요\?|인가요\?|나요\?/.test(firstHeading.text)) {
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

    if ((/^##\s+/.test(line) || /^###\s+/.test(line)) && !/^##\s*(faq|자주 묻는 질문)/i.test(line)) {
      const headingText = normalizeLine(line.replace(/^###?\s+/, ""));
      const nextLine = normalizeLine(lines[index + 1] ?? "");
      if (!/^핵심 답변[:：]/.test(nextLine)) {
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
    nextContent = appendUniqueBlock(nextContent, buildSourceSection(article));
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
