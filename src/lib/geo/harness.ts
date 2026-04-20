import type {
  ArticleContent,
  GeoAnalysisResult,
  GeoCategoryScore,
  GeoOptimizationResult,
  GeoRecommendation,
} from "@/types";

export type GeoHarnessMode = "safe" | "aggressive";
export type PostTypeGuard = "general" | "price-list" | "product-intro";

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
    /공식 가이드|공식 자료|제품 설명서|관리 가이드|검사|진료|진단|권장|안내|조언|가이드라인|기준/g
  );
  return matches?.length ?? 0;
}

const SOURCE_ATTRIBUTION_PATTERNS: RegExp[] = [
  /(한국|대한|국립|보건복지부|식약처|통계청|공정거래위원회|국민건강보험|질병관리청|국토교통부|과학기술정보통신부)[가-힣A-Za-z·]*\s*(?:에|의|이)?\s*(?:\d{4}년|20\d\d)?[^.\n]{0,40}?(?:\d+(?:\.\d+)?\s*%|\d+\s*(?:명|건|회|가지|개월|주|일))/g,
  /[가-힣]{2,}(?:협회|연구소|공단|학회|재단)[^.\n]{0,40}?(?:\d{4}년|20\d\d|\d+(?:\.\d+)?\s*%|\d+\s*(?:명|건|회|개월|주|일))/g,
  /(?:에 따르면|의 자료에 따르면|고시에 따르면|가 발표한|이 발표한|의 권고안|의 조사|의 통계|의 가이드라인)/g,
];

function countSourceAttributions(content: string): number {
  let total = 0;
  for (const pattern of SOURCE_ATTRIBUTION_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}


function hasClaimRisk(content: string): boolean {
  return CLAIM_REPLACEMENTS.some(({ from }) => {
    from.lastIndex = 0;
    return from.test(content);
  });
}

const UNCERTAINTY_PHRASES = [
  "개인차",
  "개인마다",
  "상황에 따라",
  "사람마다",
  "사람에 따라",
  "경우에 따라",
  "체감이 다를",
  "체감 차이",
  "다를 수 있",
] as const;

function hasUncertaintySignal(content: string): boolean {
  return UNCERTAINTY_PHRASES.some((phrase) => content.includes(phrase));
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

const CLICHE_PATTERNS: RegExp[] = [
  /많은 분들이/g,
  /요즘 들어/g,
  /최근 들어/g,
  /바쁜 일상/g,
  /고민이\s*많으신/g,
  /한 번쯤은 있으시/g,
  /누구나 한 번쯤/g,
  /정보를 정리해 드릴게요/g,
];

const CONCRETE_NUMBER_PATTERN =
  /\d+(?:\.\d+)?\s*(?:%|°C|℃|mm|nm|μm|dB|도|시간|분|초|개월|주|일|년|회|건|명|가지)/g;

function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches?.length ?? 0;
}

function hasListStructure(content: string): boolean {
  return /^\s*[-*•]\s+/m.test(content);
}

const INTENT_FRAMING_PATTERNS: RegExp[] = [
  /\d+대\s*(?:직장인|주부|학생|여성|남성|엄마|아빠)/,
  /한\s*번쯤/,
  /경험[이은는,]?\s*(?:혹시\s*)?있으/,
  /겪어\s*보/,
  /이런\s*경험/,
  /적\s*있으신/,
  /있으신가요/,
  /상황을\s*떠올려/,
  /장면[이을]?\s*떠올/,
  /예를\s*들어\s*.{0,40}\s*상황/,
  /(?:출근|퇴근|운전|외출|등산|골프|여행|캠핑|수영|러닝)\s*(?:할\s*때|중|하다|하면서)/,
  /오후\s*\d+시/,
  /(?:아침|점심|오후|저녁|퇴근\s*후)\s*(?:에는?|이면|되면|쯤)/,
  /(?:모니터|스마트폰|컴퓨터|노트북|태블릿)\s*(?:을|를|에|에서|보면|볼\s*때)/,
];

function hasIntentFraming(content: string): boolean {
  const intro = content.split(/\n##\s/, 1)[0] ?? "";
  return INTENT_FRAMING_PATTERNS.some((pattern) => pattern.test(intro));
}

function scoreAiQuoteStructure(
  signals: HeadingSignals,
  table: boolean,
  content: string
): number {
  let score = 0;

  if (signals.meaningful >= 4) score += 4;
  else if (signals.meaningful >= 3) score += 3;
  else if (signals.meaningful >= 2) score += 2;

  if (table) score += 10;
  else if (hasListStructure(content)) score += 4;

  score += Math.round(Math.min(1, signals.directAnswerRatio) * 12);

  return Math.max(0, Math.min(30, score));
}

function countDirectQuotes(content: string): number {
  const pattern = /["“][^"“”\n]{6,}["”]/g;
  return countMatches(content, pattern);
}

const WEAK_ATTRIBUTION_PATTERN =
  /(?:연구\s*결과|조사\s*결과|알려져\s*있|권고되|보고되|연구진|학계|의학계|전문가들|임상\s*결과|권장하고\s*있|권장되|권장되는|발표된|제시된|분석된|에\s*따르면|의\s*자료|의\s*조사|의\s*통계|의\s*보고|의\s*발표|의\s*기준)/g;

const STAT_CONTEXT_PATTERN =
  /\d+(?:\.\d+)?\s*(?:%|℃|°C|mm|nm|μm|dB|시간|분|초|개월|주|일|년|회|건|명|가지|배|도)/g;

const INSTITUTION_MENTION_PATTERN =
  /한국[가-힣A-Za-z]{1,10}(?:소비자원|보호원|연구원|연구소|공단|재단|학회|협회|진흥원|센터)|대한[가-힣A-Za-z]{1,10}(?:협회|학회|의사협회|재단|연구회)|국립[가-힣A-Za-z]{1,10}(?:센터|원|연구원|보호원)|식약처|식품의약품안전처|보건복지부|통계청|공정거래위원회|국민건강보험|질병관리청|국토교통부|과학기술정보통신부|건강보험심사평가원|[가-힣A-Za-z]{2,10}(?:협회|연구소|공단|학회|재단|진흥원|센터)(?:\s*기술\s*자료)?/g;

function countUniqueInstitutions(content: string): number {
  const matches = content.match(INSTITUTION_MENTION_PATTERN);
  if (!matches) return 0;
  return new Set(matches.map((entry) => entry.trim())).size;
}

function scoreTrustAndSources(content: string): number {
  let score = 0;

  const institutionCount = countUniqueInstitutions(content);
  score += Math.min(22, institutionCount * 10);

  const weakAttributionCount = countMatches(content, WEAK_ATTRIBUTION_PATTERN);
  score += Math.min(9, weakAttributionCount * 3);

  const concreteFactCount = countMatches(content, STAT_CONTEXT_PATTERN);
  score += Math.min(10, concreteFactCount);

  const quoteCount = countDirectQuotes(content);
  score += Math.min(5, quoteCount * 5);

  return Math.max(0, Math.min(35, score));
}

function scoreEntityAndIntent(article: ArticleContent): number {
  const content = article.content;
  const hasShop = content.includes(article.shopName) ? 2 : 0;
  const hasCategory = content.includes(article.category) ? 2 : 0;
  const hasUncertainty = hasUncertaintySignal(content) ? 2 : 0;
  const intentFraming = hasIntentFraming(content) ? 8 : 0;
  return Math.max(0, Math.min(14, hasShop + hasCategory + hasUncertainty + intentFraming));
}

const NARRATIVE_SIGNAL_PATTERNS: RegExp[] = [
  /쉽게\s*(?:말하면|설명하면|풀어|비유|이해|생각하면)/g,
  /예를\s*들어/g,
  /비유하면/g,
  /마치\s*[^.]{0,20}처럼/g,
  /(?:상상|떠올려)\s*보/g,
  /비슷[해하][요다]/g,
  /와\s*비슷한\s*(?:이유|구조|느낌|경우|상황)/g,
];

function scoreContentQuality(
  article: ArticleContent,
  templateArtifacts: boolean
): number {
  const content = article.content;

  let score = 0;

  const concreteFacts = countMatches(content, CONCRETE_NUMBER_PATTERN);
  score += Math.min(6, concreteFacts);

  let clicheHits = 0;
  for (const pattern of CLICHE_PATTERNS) {
    clicheHits += countMatches(content, pattern);
  }
  score -= Math.min(4, clicheHits * 2);

  let narrativeHits = 0;
  for (const pattern of NARRATIVE_SIGNAL_PATTERNS) {
    narrativeHits += countMatches(content, pattern);
  }
  score += Math.min(5, narrativeHits * 2);

  const keywordsPresent = [
    article.mainKeyword,
    article.subKeyword1,
    article.subKeyword2,
  ].filter((keyword) => keyword && content.includes(keyword)).length;
  score += Math.min(5, Math.round(keywordsPresent * 1.7));

  const paragraphs = content
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !/^##?\s/.test(block));
  if (paragraphs.length > 0) {
    const avgLen =
      paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
    if (avgLen >= 60 && avgLen <= 260) score += 3;
    else if (avgLen < 400) score += 1;
  }

  if (!templateArtifacts) score += 1;
  if (content.length < 1100) score -= 3;

  const validationPenalty = article.validation?.revisionReasons?.length ?? 0;
  if (validationPenalty === 0) score += 1;

  return Math.max(0, Math.min(21, score));
}

function analyzeCategories(article: ArticleContent): GeoCategoryScore[] {
  const content = article.content;
  const headingSignals = analyzeHeadingSignals(content);
  const table = hasTable(content);
  const templateArtifacts = hasTemplateArtifacts(content);

  return [
    {
      key: "ai-quote-structure",
      label: "AI 인용 구조",
      score: scoreAiQuoteStructure(headingSignals, table, content),
      maxScore: 30,
    },
    {
      key: "trust-and-sources",
      label: "신뢰성 & 근거",
      score: scoreTrustAndSources(content),
      maxScore: 35,
    },
    {
      key: "entity-and-author",
      label: "엔티티 & 지역성",
      score: scoreEntityAndIntent(article),
      maxScore: 14,
    },
    {
      key: "content-quality",
      label: "본문 완성도",
      score: scoreContentQuality(article, templateArtifacts),
      maxScore: 21,
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
  const claimRisk = hasClaimRisk(content);
  const articleHasTable = hasTable(content);

  if (canRewrite) {
    const answerShort = signals.directAnswerRatio < 0.8;
    recommendations.push({
      id: "direct-answer-lead",
      title: "섹션별 단정형 직답 강화",
      description: "각 섹션 첫 줄에 40~80자 단정형 요약 문장을 배치해 AI 스니펫 추출을 돕습니다.",
      category: "trust-and-sources",
      impact: "high",
      reason:
        "AI 검색은 질문형 소제목이 아니라 섹션 첫 문장의 **단정형 답변**을 인용합니다 (AEO 핵심).",
      before: answerShort
        ? "섹션 첫 줄이 도입 문장으로 시작"
        : "이미 단정형 직답이 충분함",
      after: "섹션 첫 줄에 40~80자 단정형 요약 배치",
      selectedByDefault: answerShort,
    });
  }

  if (canRewrite) {
    const needsTable =
      !articleHasTable || shouldSuggestStructuredTable(article);
    recommendations.push({
      id: "comparison-table",
      title: "비교 테이블 추가",
      description: "구조화된 데이터로 AI가 정보를 추출·인용하기 쉽게 만듭니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "비교·기준·시기 정리 글에서 표는 AI가 가장 먼저 집는 구조화 신호입니다.",
      before: articleHasTable ? "표가 1개 있음" : "비교 표 없음",
      after: "본문 중간에 3~4열 markdown 비교표 삽입",
      selectedByDefault: !articleHasTable && needsTable,
    });
  }

  recommendations.push({
    id: "soften-claims",
    title: "단정 표현 완화",
    description: "과도한 확정 표현을 덜어내고 개인차와 상황 차이를 반영합니다.",
    category: "trust-and-sources",
    impact: "high",
    reason: "의료법·광고법 관점 뿐 아니라 AI 신뢰 신호에서도 단정 표현은 감점 요인입니다.",
    before: claimRisk ? "강한 확정 표현 포함" : "단정 표현이 적음",
    after: "상황에 따라 다를 수 있다는 표현으로 조정",
    selectedByDefault: claimRisk,
  });

  if (canRewrite) {
    const clicheHits = CLICHE_PATTERNS.reduce(
      (sum, pattern) => sum + countMatches(content, pattern),
      0
    );
    recommendations.push({
      id: "remove-cliches",
      title: "상투적 표현 정돈",
      description: "'많은 분들이', '요즘 들어' 같은 클리셰를 자연스러운 표현으로 다듬습니다.",
      category: "ai-quote-structure",
      impact: "medium",
      reason: "구체성 없는 상투어는 AI가 본문을 '흔한 일반론'으로 판단하게 만듭니다.",
      before: clicheHits > 0 ? `클리셰 ${clicheHits}회 사용` : "클리셰 거의 없음",
      after: "구체적·자연스러운 표현으로 교체",
      selectedByDefault: clicheHits > 0,
    });
  }

  if (canRewrite) {
    const hasQuote = /["“][^"“”\n]{6,}["”]/.test(content);
    recommendations.push({
      id: "add-expert-quote",
      title: "전문가 따옴표 인용",
      description: "협회·기관 권고 내용을 따옴표 인용으로 1건 삽입합니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "AI 검색은 직접 인용 따옴표를 권위 신호로 우선 추출합니다.",
      before: hasQuote ? "이미 따옴표 인용 있음" : "직접 인용 없음",
      after: '\'대한안경사협회는 "~를 권장한다"고 안내\' 형식으로 자연 삽입',
      selectedByDefault: !hasQuote,
    });
  }

  if (canRewrite) {
    const attributionCount = countSourceAttributions(content);
    recommendations.push({
      id: "add-source-citation",
      title: "출처 인용 추가",
      description: "한국 공공기관·협회·연구소 자료를 본문 1~2곳에 자연스럽게 녹입니다.",
      category: "trust-and-sources",
      impact: "high",
      reason: "AI 검색이 인용할 블로그를 고를 때 가장 크게 보는 신호입니다.",
      before:
        attributionCount >= 2
          ? "출처 인용 충분함"
          : attributionCount === 1
            ? "출처 인용 1건"
            : "구체 출처 인용 없음",
      after: "'한국소비자원 2024년 자료에 따르면 ~' 식으로 1~2건 삽입",
      selectedByDefault: attributionCount < 2,
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
