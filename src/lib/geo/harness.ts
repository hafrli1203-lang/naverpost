import type {
  ArticleContent,
  GeoAnalysisResult,
  GeoCategoryScore,
  GeoOptimizationResult,
  GeoRecommendation,
} from "@/types";

type Heading = {
  index: number;
  raw: string;
  text: string;
};

type GeoIntent =
  | "compare"
  | "prepare"
  | "timing"
  | "cost"
  | "location"
  | "selection"
  | "checklist"
  | "general";

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

const TEMPLATE_HEADING_PATTERNS = [
  /^##\s*FAQ\s*$/i,
  /^##\s*자주 묻는 질문\s*$/i,
  /^##\s*확인 및 안내\s*$/i,
  /^##\s*참고 및 확인 포인트\s*$/i,
  /^##\s*비교해서 보면 더 쉬운 포인트\s*$/i,
];

const TEMPLATE_LINE_PATTERNS = [
  /^\uD575\uC2EC \uB2F5\uBCC0[:\uFF1A]/u,
  /\uC5C5\uB370\uC774\uD2B8 \uAE30\uC900\uC77C/u,
  /\uC0C1\uB2F4 \uAD00\uC810\uC5D0\uC11C \uBCF4\uBA74/u,
  /\uACF5\uAC1C \uC790\uB8CC\uC640 \uD604\uC7A5 \uC0C1\uB2F4 \uAD00\uC810\uC744 \uBC14\uD0D5\uC73C\uB85C/u,
  /^[^.!?\n]{2,60}(?:\uC740|\uB294|\uC774|\uAC00)\s+\uC5B4\uB5A4 \uAE30\uC900\uC73C\uB85C \uBCF4\uBA74 \uC88B\uC744\uAE4C\uC694\?\s*\uD604\uC7AC \uC0C1\uD0DC,\s*\uC0DD\uD65C \uD328\uD134,\s*\uAE30\uB300\uD558\uB294 \uBCC0\uD654 \uAE30\uC900\uC73C\uB85C \uB098\uB220 \uBCF4\uBA74 \uD6E8\uC52C \uC774\uD574\uAC00 \uC26C\uC6CC\uC9D1\uB2C8\uB2E4\.?$/u,
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
    .filter(
      (block) =>
        block.length > 0 &&
        !block.startsWith("|") &&
        !/^[-*]\s/.test(block) &&
        !TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(block))
    );
}

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

function endsWithFinalConsonant(text: string): boolean {
  const trimmed = text.trim();
  const lastChar = trimmed.charCodeAt(trimmed.length - 1);

  if (Number.isNaN(lastChar)) return false;
  if (lastChar < 0xac00 || lastChar > 0xd7a3) return false;

  return (lastChar - 0xac00) % 28 !== 0;
}

function topicParticle(text: string): string {
  return endsWithFinalConsonant(text) ? "은" : "는";
}

function hasQuestionHeading(headings: Heading[]): boolean {
  return headings.some((heading) => /\?$|누구|어떻게|무엇|왜|언제|비교|기준/.test(heading.text));
}

function hasTable(content: string): boolean {
  return /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);
}

function isTemplateHeading(line: string): boolean {
  return TEMPLATE_HEADING_PATTERNS.some((pattern) => pattern.test(line.trim()));
}

function hasTemplateArtifacts(content: string): boolean {
  const lines = getLines(content).map((line) => line.trim());
  return (
    lines.some((line) => TEMPLATE_HEADING_PATTERNS.some((pattern) => pattern.test(line))) ||
    lines.some((line) => TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line)))
  );
}

function hasMedicalClaimRisk(content: string): boolean {
  return ABSOLUTE_PHRASE_REPLACEMENTS.some(({ from }) => from.test(content));
}

function countSourceMentions(content: string): number {
  const matches = content.match(
    /출처|논문|연구|가이드|보고서|통계|자료에 따르면|공개 자료|학회|전문가|공식|공식 자료|공식 홈페이지|보건복지부|질병관리청|국가건강정보포털/g
  );
  return matches?.length ?? 0;
}

function hasDirectAnswerLead(content: string, article: ArticleContent): boolean {
  const leadParagraph = getParagraphs(content)[0] ?? "";
  if (!leadParagraph) return false;

  const hasTopicSignal =
    leadParagraph.includes(article.mainKeyword) ||
    leadParagraph.includes(article.subKeyword1) ||
    leadParagraph.includes(article.subKeyword2);
  const hasAnswerSignal = /기준|먼저|확인|판단|비교|차이|도움|권합니다|좋습니다/.test(leadParagraph);

  return hasTopicSignal && hasAnswerSignal && !/^안녕하세요/.test(leadParagraph);
}

function buildPreviewDescription(content: string): string {
  const cleaned = stripMarkdown(content).replace(/\s+/g, " ");
  return cleaned.slice(0, 120);
}

function detectIntent(article: ArticleContent, currentHeading?: string): GeoIntent {
  const subject = `${currentHeading ?? ""} ${article.title} ${article.mainKeyword} ${article.subKeyword1} ${article.subKeyword2}`;

  if (/비교|차이|vs|대안|무엇이 더|어떤 게 더/i.test(subject)) return "compare";
  if (/준비|상담 전|예약 전|방문 전|가기 전|전 체크/.test(subject)) return "prepare";
  if (/언제|시기|기간|타이밍|몇 월|얼마나 걸/.test(subject)) return "timing";
  if (/가격|비용|금액|예산|얼마/.test(subject)) return "cost";
  if (/위치|근처|어디|찾아|오시는 길|주차/.test(subject)) return "location";
  if (/추천|선택|고르|맞을까|적합|대상/.test(subject)) return "selection";
  if (/체크|기준|증상|확인|판단|주의|포인트/.test(subject)) return "checklist";
  return "general";
}

function buildQuestionHeading(article: ArticleContent, currentHeading?: string): string {
  const base = (currentHeading || article.mainKeyword || article.title).replace(/\?+$/, "");
  const intent = detectIntent(article, currentHeading);

  if (intent === "compare") {
    return `## ${base}${topicParticle(base)} 어떻게 비교하면 좋을까요?`;
  }

  if (intent === "prepare") {
    return `## ${base} 전에 먼저 확인할 것은 무엇일까요?`;
  }

  if (intent === "timing") {
    return `## ${base}${topicParticle(base)} 언제 확인해보면 좋을까요?`;
  }

  if (intent === "cost") {
    return `## ${base}${topicParticle(base)} 비용 기준으로 보면 어떻게 정리할 수 있을까요?`;
  }

  if (intent === "selection") {
    return `## ${base}${topicParticle(base)} 어떤 경우에 더 잘 맞을까요?`;
  }

  return `## ${base}${topicParticle(base)} 어떤 기준으로 보면 좋을까요?`;
}

function buildLeadAnswer(article: ArticleContent): string {
  const intent = detectIntent(article);
  const keyword = article.mainKeyword;

  switch (intent) {
    case "compare":
      return `${keyword}${topicParticle(keyword)} 목적, 기대하는 변화, 유지 부담을 함께 놓고 보면 차이를 이해하기가 쉬워집니다.`;
    case "prepare":
      return `${keyword}${topicParticle(keyword)} 현재 불편한 점과 일정, 예산, 궁금한 내용을 먼저 정리해 두면 방향을 잡기가 수월합니다.`;
    case "timing":
      return `${keyword}${topicParticle(keyword)} 변화 속도와 불편의 강도, 함께 나타나는 신호를 먼저 보면 우선순위를 정하기가 쉬워집니다.`;
    case "cost":
      return `${keyword}${topicParticle(keyword)} 가격만 보지 말고 포함 범위와 유지 비용, 추가로 들어갈 요소까지 같이 보는 편이 자연스럽습니다.`;
    case "location":
      return `${keyword}${topicParticle(keyword)} 거리만 보지 말고 접근성, 주차나 예약 편의, 실제 방문 동선까지 함께 확인하는 편이 좋습니다.`;
    case "selection":
      return `${keyword}${topicParticle(keyword)} 현재 상태와 기대하는 결과, 생활 패턴을 함께 놓고 보면 어떤 선택이 더 맞는지 정리하기 쉬워집니다.`;
    case "checklist":
      return `${keyword}${topicParticle(keyword)} 현재 상태, 변화 양상, 확인 포인트를 같이 보고 판단하는 편이 자연스럽습니다.`;
    default:
      return `${keyword}${topicParticle(keyword)} 지금 필요한 기준이 무엇인지부터 나눠 보면 전체 흐름을 이해하기 쉬워집니다.`;
  }
}

function shouldSuggestStructuredTable(article: ArticleContent): boolean {
  const subject = `${article.title} ${article.mainKeyword} ${article.subKeyword1} ${article.subKeyword2}`;
  return /비교|차이|vs|기준|체크|판단|준비|시기|언제|가격|비용|추천|선택/.test(subject);
}

function buildStructuredTable(article: ArticleContent): string {
  const intent = detectIntent(article);

  switch (intent) {
    case "compare":
      return [
        "## 비교해서 보면 좋은 기준",
        "",
        "| 항목 | 먼저 볼 기준 | 확인 포인트 |",
        "| :--- | :--- | :--- |",
        `| ${article.mainKeyword} | 목적과 기대 효과 | 지금 필요한 변화와 맞는지 확인 |`,
        `| ${article.subKeyword1} | 유지와 관리 부담 | 일상에서 계속 관리 가능한지 점검 |`,
        `| ${article.subKeyword2} | 상담 또는 추가 확인 필요성 | 혼자 판단하기 어려운 부분이 남는지 확인 |`,
      ].join("\n");
    case "prepare":
      return [
        "## 준비 전에 정리하면 좋은 항목",
        "",
        "| 항목 | 미리 적어둘 내용 | 이유 |",
        "| :--- | :--- | :--- |",
        "| 현재 상태 | 불편한 점, 가장 불편한 시간대 | 상담 시간을 줄이고 핵심을 바로 짚기 쉽습니다. |",
        "| 일정과 예산 | 가능한 날짜, 예산 범위 | 현실적인 선택지를 빠르게 좁히기 좋습니다. |",
        "| 궁금한 점 | 꼭 확인하고 싶은 질문 2~3개 | 현장에서 빠뜨리지 않고 확인할 수 있습니다. |",
      ].join("\n");
    case "timing":
      return [
        "## 시기를 판단할 때 먼저 볼 기준",
        "",
        "| 상황 | 먼저 볼 포인트 | 권장 대응 |",
        "| :--- | :--- | :--- |",
        "| 갑자기 변화가 큰 경우 | 통증, 비대칭, 급격한 불편이 함께 있는지 | 미루지 말고 빠르게 확인 |",
        "| 서서히 진행되는 경우 | 생활에 불편을 주는 범위까지 왔는지 | 정기 점검 또는 상담 일정 조정 |",
        "| 반복되는 경우 | 특정 시간대나 상황에서만 심해지는지 | 패턴을 정리해 상담 시 함께 전달 |",
      ].join("\n");
    case "cost":
      return [
        "## 비용을 볼 때 함께 확인할 기준",
        "",
        "| 항목 | 먼저 볼 내용 | 놓치기 쉬운 부분 |",
        "| :--- | :--- | :--- |",
        "| 기본 비용 | 안내된 금액에 무엇이 포함되는지 | 검사비, 재방문 비용, 추가 옵션 여부 |",
        "| 유지 비용 | 한 번으로 끝나는지, 주기 관리가 필요한지 | 장기적으로 드는 총비용 차이 |",
        "| 시간 비용 | 방문 횟수와 소요 시간 | 일정 조정 부담까지 포함해 판단 |",
      ].join("\n");
    case "selection":
      return [
        "## 선택할 때 정리하면 좋은 기준",
        "",
        "| 기준 | 먼저 볼 질문 | 판단 포인트 |",
        "| :--- | :--- | :--- |",
        "| 현재 상태 | 지금 가장 불편한 문제가 무엇인지 | 문제의 우선순위와 맞는 선택인지 |",
        "| 기대 결과 | 어느 정도 변화를 원하는지 | 기대치와 실제 가능 범위 차이 |",
        "| 유지 가능성 | 이후 관리가 가능한지 | 생활 패턴과 맞는지 여부 |",
      ].join("\n");
    default:
      return [
        "## 먼저 정리해서 보면 좋은 기준",
        "",
        "| 항목 | 먼저 볼 포인트 | 확인 질문 |",
        "| :--- | :--- | :--- |",
        `| ${article.mainKeyword} | 지금 가장 중요한 문제 | 먼저 해결해야 할 불편이 무엇인지 |`,
        `| ${article.subKeyword1} | 적용 범위와 과정 | 실제로 어떤 흐름으로 진행되는지 |`,
        `| ${article.subKeyword2} | 유지와 추가 확인 필요성 | 이후 관리나 상담이 더 필요한지 |`,
      ].join("\n");
  }
}

function analyzeCategories(article: ArticleContent): GeoCategoryScore[] {
  const content = article.content;
  const headings = parseHeadings(content);
  const questionHeading = hasQuestionHeading(headings);
  const directAnswerLead = hasDirectAnswerLead(content, article);
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
          (directAnswerLead ? 12 : 0) +
            (questionHeading ? 8 : 0) +
            (table ? 6 : 0) +
            (!templateArtifacts ? 4 : 0)
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
          (!hasMedicalClaimRisk(content) ? 10 : 0) +
            (sourceMentions >= 2 ? 8 : sourceMentions === 1 ? 4 : 0) +
            (!templateArtifacts ? 3 : 0) +
            (content.includes("상담") || content.includes("검사") ? 4 : 0)
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
            (headings.length >= 3 ? 6 : headings.length >= 2 ? 4 : 2) +
            (hasKeywordCoverage ? 5 : 2) +
            (!templateArtifacts ? 2 : 0) +
            Math.max(0, 4 - validationPenalty)
        )
      ),
      maxScore: 25,
    },
  ];
}

function buildRecommendations(article: ArticleContent): GeoRecommendation[] {
  const content = article.content;
  const headings = parseHeadings(content);
  const firstHeading = headings[0];
  const recommendations: GeoRecommendation[] = [];

  if (hasTemplateArtifacts(content)) {
    recommendations.push({
      id: "remove-template-blocks",
      title: "기계식 GEO 블록 제거",
      description: "FAQ, 핵심 답변, 확인 안내처럼 본문 흐름을 끊는 템플릿 블록을 걷어냅니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "AI용 구조를 흉내 낸 부속 블록보다 자연스러운 본문 흐름이 더 중요합니다.",
      before: "핵심 답변 / FAQ / 확인 및 안내 블록 포함",
      after: "본문 흐름 안에서 요점을 설명하는 구조로 정리",
      selectedByDefault: true,
    });
  }

  if (!hasDirectAnswerLead(content, article) && false) {
    recommendations.push({
      id: "direct-answer-lead",
      title: "도입부에 바로 답하기",
      description: "첫 문단에서 질문의 핵심 기준을 먼저 말해 AI와 사용자 모두가 요지를 빨리 파악하게 합니다.",
      category: "ai-quote-structure",
      impact: "high",
      reason: "긴 도입보다 앞부분의 명확한 답변이 인용과 요약에 유리합니다.",
      before: "일반적인 도입 또는 인사말 중심",
      after: buildLeadAnswer(article),
      selectedByDefault: true,
    });
  }

  if (!hasQuestionHeading(headings) && false) {
    recommendations.push({
      id: "question-heading",
      title: "질문형 소제목으로 정리",
      description: "소제목을 실제 검색 질문처럼 바꿔 정보 구조를 더 선명하게 만듭니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "질문형 소제목은 사용자의 탐색 의도와 본문 구조를 자연스럽게 맞춰줍니다.",
      before: firstHeading?.raw ?? "질문형 소제목 없음",
      after: buildQuestionHeading(article, firstHeading?.text),
      selectedByDefault: true,
    });
  }

  if (!hasTable(content) && shouldSuggestStructuredTable(article)) {
    recommendations.push({
      id: "comparison-table",
      title: "판단 기준 표 보강",
      description: "증상이나 검사 시점처럼 기준이 중요한 글은 짧은 표로 정리하면 핵심이 빨리 보입니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "표는 비교 목적이 분명할 때만 제한적으로 쓰는 편이 자연스럽습니다.",
      before: "판단 기준 표 없음",
      after: "| 상황 | 먼저 볼 포인트 | 권장 대응 |",
      selectedByDefault: false,
    });
  }

  if (hasMedicalClaimRisk(content)) {
    recommendations.push({
      id: "soften-claims",
      title: "과장 표현 완화",
      description: "의료·건강성 주제에서 단정적인 문장을 줄여 신뢰도를 높입니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "YMYL 성격의 글에서는 강한 확정 표현이 오히려 신뢰를 떨어뜨릴 수 있습니다.",
      before: "강한 단정 표현 포함",
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
  if (score >= 90) return "사람이 읽기 좋은 흐름과 AI가 인용하기 쉬운 구조가 함께 갖춰진 상태입니다.";
  if (score >= 75) return "기본 구조는 안정적이지만 도입부나 근거 문장을 조금 더 다듬을 여지가 있습니다.";
  if (score >= 55) return "본문 흐름은 있으나 기계식 블록이나 모호한 도입 때문에 인용 가능성이 떨어질 수 있습니다.";
  return "GEO 관점에서 본문 구조와 신뢰 표현을 다시 정리할 필요가 있습니다.";
}

export function runGeoHarness(article: ArticleContent): GeoAnalysisResult {
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
      citationDensityCount >= 2 ? "충분" : citationDensityCount === 1 ? "보통" : "부족",
    citationDensityCount,
  };
}

function replaceFirstHeading(lines: string[], article: ArticleContent): string[] {
  const headings = parseHeadings(lines.join("\n"));
  const firstHeading = headings[0];
  if (!firstHeading) {
    return [buildQuestionHeading(article), "", ...lines];
  }

  if (/\?$|누구|어떻게|무엇|왜|언제|비교|기준/.test(firstHeading.text)) {
    return lines;
  }

  const next = [...lines];
  next[firstHeading.index] = buildQuestionHeading(article, firstHeading.text);
  return next;
}

function insertLeadParagraph(content: string, paragraph: string): string {
  if (content.includes(paragraph)) return content;

  const lines = getLines(content);
  const firstMeaningfulIndex = lines.findIndex((line) => normalizeLine(line).length > 0);

  if (firstMeaningfulIndex >= 0 && /^##\s+/.test(lines[firstMeaningfulIndex])) {
    const next = [...lines];
    next.splice(firstMeaningfulIndex + 1, 0, "", paragraph, "");
    return next.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return `${paragraph}\n\n${content.trim()}`;
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

    if (skippingTemplateSection) {
      continue;
    }

    if (TEMPLATE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      continue;
    }

    if (trimmed === `${article.shopName} ${article.category} 기준으로 정리한 내용입니다.`) {
      continue;
    }

    next.push(line);
  }

  return next.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function softenClaims(content: string): string {
  let next = content;
  for (const { from, to } of ABSOLUTE_PHRASE_REPLACEMENTS) {
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
  selectedRecommendationIds: GeoRecommendation["id"][]
): GeoOptimizationResult {
  const analysisBefore = runGeoHarness(article);
  let nextContent = article.content;

  if (selectedRecommendationIds.includes("remove-template-blocks")) {
    nextContent = removeTemplateBlocks(nextContent, article);
  }

  if (selectedRecommendationIds.includes("soften-claims")) {
    nextContent = softenClaims(nextContent);
  }

  if (selectedRecommendationIds.includes("question-heading") && false) {
    nextContent = replaceFirstHeading(getLines(nextContent), article).join("\n");
  }

  if (selectedRecommendationIds.includes("direct-answer-lead") && false) {
    nextContent = insertLeadParagraph(nextContent, buildLeadAnswer(article));
  }

  if (selectedRecommendationIds.includes("comparison-table") && shouldSuggestStructuredTable(article)) {
    nextContent = appendUniqueBlock(nextContent, buildStructuredTable(article));
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
