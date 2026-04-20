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

export interface ResearchResult {
  summary: string;
  questions: string[];
  citations: ResearchCitation[];
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
  if (result.questions.length > 0) {
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

export async function researchKeyword(keyword: string): Promise<{
  text: string;
  result: ResearchResult;
}> {
  const prompt = `다음 키워드에 대해 한국 블로그 글 작성에 필요한 자료를 조사해 주세요: "${keyword}"

다음 항목을 JSON으로만 반환하세요. 마크다운이나 설명문 없이 JSON만 출력합니다.

{
  "summary": "키워드 관련 핵심 정보를 300자 내외로 요약",
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
- 가능하면 최소 2개, 최대 5개를 목표로
- 1차 기관 자료가 없으면 2차, 2차도 없으면 3차 자료라도 포함
- 기관명이 모호하거나 출처가 불분명하면 포함하지 말 것
- 사실은 블로그 본문에 인용할 수 있을 만큼 구체적일 것 (수치, 비율, 기준, 권고)
- 사실을 지어내지 말 것. 실제 검색해서 확인된 자료만
- 정말로 아무것도 찾을 수 없으면 빈 배열로 반환`;

  const response = await getClient().chat.completions.create({
    model: "sonar",
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "";
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

  const result: ResearchResult = { summary, questions, citations };
  return {
    text: buildResearchString(result),
    result,
  };
}
