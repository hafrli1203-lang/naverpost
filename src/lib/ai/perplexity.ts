import OpenAI from "openai";

let perplexity: OpenAI | null = null;

function getClient(): OpenAI {
  if (!perplexity) {
    perplexity = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: "https://api.perplexity.ai",
    });
  }
  return perplexity;
}

export interface ResearchCitation {
  institution: string;
  year?: string;
  fact: string;
  url?: string;
}

export interface ResearchFollowUp {
  question: string;
  answer: string;
}

export interface ResearchResult {
  summary: string;
  questions: string[];
  citations: ResearchCitation[];
  followUps: ResearchFollowUp[];
}

export interface ResearchParams {
  mainKeyword: string;
  subKeyword1?: string;
  subKeyword2?: string;
  categoryName?: string;
  /**
   * Natural article title/thesis. Leads the research subject so Perplexity researches
   * the real phrase ("안경 힌지가 벌어졌다면") instead of the glued keyword combo
   * ("안경수리 힌지"), which it misreads as corrupted/typo and defaults to generic topics.
   */
  topic?: string;
  /** Disambiguation hint from the optical glossary (buildGlossaryHint output). */
  glossaryHint?: string;
}

export interface ResearchResponse {
  text: string;
  result: ResearchResult;
  status: "ok" | "empty";
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function parseCitations(raw: unknown): ResearchCitation[] {
  if (!Array.isArray(raw)) return [];
  const results: ResearchCitation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const institution =
      typeof record.institution === "string" ? record.institution.trim() : "";
    const fact = typeof record.fact === "string" ? record.fact.trim() : "";
    if (!institution || !fact) continue;
    const year = typeof record.year === "string" ? record.year.trim() : undefined;
    const url = typeof record.url === "string" ? record.url.trim() : undefined;
    results.push({ institution, fact, year, url });
  }
  return results.slice(0, 8);
}

function buildResearchString(result: ResearchResult): string {
  const sections: string[] = [];
  if (result.summary.trim()) {
    sections.push(`[자료 요약]\n${result.summary.trim()}`);
  }
  if (result.followUps.length > 0) {
    const blocks = result.followUps.map(
      (item, idx) => `${idx + 1}. ${item.question}\n   → ${item.answer}`
    );
    sections.push(`[후속 질문 심화 자료]\n${blocks.join("\n")}`);
  } else if (result.questions.length > 0) {
    const numbered = result.questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n");
    sections.push(`[후속 검색 질문]\n${numbered}`);
  }
  if (result.citations.length > 0) {
    const lines = result.citations.map((citation) => {
      const yearPart = citation.year ? ` (${citation.year})` : "";
      return `- ${citation.institution}${yearPart}: ${citation.fact}`;
    });
    sections.push(`[인용 가능 자료]\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

/** Builds the combined search subject from main + sub keywords + category context. */
function buildSearchSubject(params: ResearchParams): string {
  const parts = [params.mainKeyword, params.subKeyword1, params.subKeyword2]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const keywordLine = parts.join(" / ");
  const categoryLine = params.categoryName
    ? `\n분야: 안경·안경렌즈·콘택트렌즈 도메인 (${params.categoryName})`
    : "";
  const glossaryLine = params.glossaryHint
    ? `\n[용어 정확한 의미 — 반드시 이 의미로 해석하고 조사]\n${params.glossaryHint}`
    : "";
  // "검색 키워드(메인/서브)"라는 표현을 그대로 주면 Perplexity가 "블로그 키워드 전략·
  // 글쓰기 방법"을 조사해 와 본문이 엉뚱한 메타 주제로 흐른다(실측: "안경수리 힌지"→
  // "안경원 블로그 키워드 조합법"). 실제 안경 도메인 현상으로 묶어 조사하게 한다.
  // 또한 붙인 키워드 조합("안경수리 힌지")만 주면 Perplexity가 "오타/깨짐"으로 보고 일반
  // 주제로 기본값 처리한다. 자연스러운 제목을 주제로 앞세우면 정확히 해석한다.
  const topicLine = params.topic?.trim();
  const subjectHeader = topicLine
    ? `조사할 주제: ${topicLine}\n관련 검색어(보조 참고): ${keywordLine}`
    : `조사할 주제(아래 표현이 가리키는 실제 안경 관련 현상·지식): ${keywordLine}`;
  return `${subjectHeader}${categoryLine}${glossaryLine}`;
}

// 호출당 개별 타임아웃 + 1회 재시도. 이게 없으면 후속 질문 5개 중 하나만 늦어도
// Promise.all이 외부 40초까지 매달려 성공한 메인 요약까지 통째로 빈값으로 버려졌다.
// 개별 타임아웃으로 느린 호출은 그 호출만 null로 떨어지고 나머지 자료는 살아남는다.
const PERPLEXITY_CALL_TIMEOUT_MS = 15_000;

async function callPerplexity(
  prompt: string,
  timeoutMs = PERPLEXITY_CALL_TIMEOUT_MS
): Promise<string> {
  const response = await getClient().chat.completions.create(
    {
      model: "sonar",
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: timeoutMs, maxRetries: 1 }
  );
  return response.choices[0]?.message?.content ?? "";
}

/** Re-searches a single follow-up question and returns a concise factual answer. */
async function researchFollowUpQuestion(
  question: string,
  subject: string
): Promise<ResearchFollowUp | null> {
  const prompt = `아래 맥락의 키워드에 대한 후속 질문을 조사해 핵심만 2~3문장으로 한국어로 답하세요.
마크다운이나 머리말 없이 답변 문장만 출력합니다. 추측하지 말고 확인된 사실만 답하세요.

${subject}

후속 질문: ${question}`;
  try {
    const answer = (await callPerplexity(prompt)).trim();
    if (!answer) return null;
    return { question, answer };
  } catch {
    return null;
  }
}

/**
 * Researches a keyword for blog writing.
 * 1) First search uses main + both sub keywords + category + glossary context together.
 * 2) Re-searches all returned follow-up questions in parallel to build richer material.
 */
export async function researchKeyword(params: ResearchParams): Promise<ResearchResponse> {
  const subject = buildSearchSubject(params);

  const prompt = `다음 안경 도메인 주제에 대해 한국 블로그 글 작성에 필요한 실제 자료를 조사해 주세요.
아래 표현들을 하나의 안경 관련 주제로 묶어, 그 현상의 원인·구조·증상·관리·대처에 관한 사실을 조사하세요.

※ 주의: 이것은 블로그 글쓰기·SEO·키워드 전략에 대한 질문이 절대 아닙니다.
"메인 키워드/서브 키워드를 어떻게 조합하나" "안경원 블로그 운영법" 같은 메타 주제는 답하지 마세요.
위 표현이 가리키는 실제 안경·안경테·렌즈의 물리적 현상과 도메인 지식만 조사하세요.

${subject}

다음 항목을 JSON으로만 반환하세요. 마크다운이나 설명문 없이 JSON만 출력합니다.

{
  "summary": "키워드 관련 핵심 정보를 300자 내외로 요약 (위 용어 의미를 반드시 반영)",
  "questions": ["블로그 독자가 궁금해할 질문 5개"],
  "citations": [
    {
      "institution": "한국 공공기관·정부부처·협회·연구소 또는 공신력 있는 제조사/학술 자료",
      "year": "발표 연도 (있으면)",
      "fact": "해당 기관이 발표한 구체적 수치·기준·권고 한 줄",
      "url": "원문 URL (있으면)"
    }
  ]
}

citations 탐색 우선순위:
1차 — 정부·공공기관 (최우선):
  * 식품의약품안전처 (mfds.go.kr)
  * 보건복지부 (mohw.go.kr)
  * 통계청 (kostat.go.kr)
  * 한국소비자원 (kca.go.kr)
  * 공정거래위원회 (ftc.go.kr)
  * 국민건강보험공단 (nhis.or.kr)
  * 질병관리청 (kdca.go.kr)
  * 건강보험심사평가원

2차 — 전문 학회·협회:
  * 대한안경사협회 (optic.or.kr), 대한안과학회
  * 한국광학회, 한국안광학회
  * 대한시과학회

3차 — 공신력 있는 2차 자료 (1·2차가 없을 때):
  * 대기업 기술 자료 (예: "자이스 기술 자료", "에실로 백서", "케미렌즈 기술 자료")
  * 학술지 논문 (예: "광학 저널 논문")
  * 국제 표준 문서 (ISO, ANSI 등)

citations 작성 규칙:
- 실제 검색으로 확인된 자료만 넣고 최대 5개까지. 개수 하한은 없다(개수 채우려고 만들지 말 것).
- 1차 기관 자료가 없으면 2차, 2차도 없으면 3차 자료. 확인 안 되면 그냥 비운다.
- 기관명이 모호하거나 출처가 불분명하면 포함하지 말 것
- 사실은 블로그 본문에 인용할 수 있을 만큼 구체적일 것 (수치, 비율, 기준, 권고)
- ★ 기관명·연도·수치·URL을 절대 지어내지 말 것. 그럴듯하게 지어 채우는 건 금지다. 확인된 게 없으면 빈 배열([])이 정답이다.`;

  let content = "";
  try {
    content = await callPerplexity(prompt);
  } catch {
    content = "";
  }

  const jsonText = extractJsonBlock(content);

  let summary = "";
  let questions: string[] = [];
  let citations: ResearchCitation[] = [];

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      if (typeof parsed.summary === "string") {
        summary = parsed.summary.trim();
      }
      if (Array.isArray(parsed.questions)) {
        questions = parsed.questions
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 5);
      }
      citations = parseCitations(parsed.citations);
    } catch {
      summary = content.trim();
    }
  } else {
    summary = content.trim();
  }

  // Re-search every follow-up question in parallel to build richer material.
  const followUps: ResearchFollowUp[] = [];
  if (questions.length > 0) {
    const settled = await Promise.all(
      questions.map((question) => researchFollowUpQuestion(question, subject))
    );
    for (const item of settled) {
      if (item) followUps.push(item);
    }
  }

  const result: ResearchResult = { summary, questions, citations, followUps };
  const status: "ok" | "empty" =
    summary.length > 0 || citations.length > 0 || followUps.length > 0 ? "ok" : "empty";

  return {
    text: buildResearchString(result),
    result,
    status,
  };
}
