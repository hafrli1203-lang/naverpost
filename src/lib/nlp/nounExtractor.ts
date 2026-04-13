import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MODEL = "claude-haiku-4-5-20251001";

export interface CompetitorNounResult {
  titleNouns: Array<{ noun: string; occurrences: number }>;
  commonNouns: Array<{ noun: string; occurrences: number; blogCount: number }>;
}

export interface CompetitorBlogSample {
  title: string;
  description: string;
}

export async function extractCompetitorNouns(
  samples: CompetitorBlogSample[]
): Promise<CompetitorNounResult> {
  if (samples.length === 0) {
    return { titleNouns: [], commonNouns: [] };
  }

  const serialized = samples
    .map(
      (sample, index) =>
        `${index + 1}. 제목: ${sample.title}\n   요약: ${sample.description}`
    )
    .join("\n");

  const prompt = `다음은 네이버 블로그 검색 결과 ${samples.length}건이다.\n\n${serialized}\n\n작업:\n1. 각 제목에서 일반명사/고유명사만 추출한다. 조사, 어미, 동사는 제외한다. 복합명사는 가능한 한 의미 단위로 분리하되 업계 통용 복합명사(예: 티타늄안경테, 누진다초점)는 유지한다.\n2. 각 요약 본문에서도 동일한 기준으로 명사를 추출한다.\n3. 제목 전체에서 명사별 출현 빈도를 센다.\n4. 본문 전체에서 명사별 출현 빈도를 세고, 해당 명사가 몇 개 블로그에 등장했는지(blogCount)도 센다. blogCount 가 2 이상인 명사만 commonNouns 에 포함한다.\n5. 결과를 JSON 으로만 반환한다. 설명 문장 없이 JSON 한 덩어리만 출력한다.\n\n출력 형식:\n\`\`\`json\n{\n  "titleNouns": [{"noun": "안경테", "occurrences": 5}],\n  "commonNouns": [{"noun": "안경테", "occurrences": 12, "blogCount": 7}]\n}\n\`\`\`\n\n주의: 한글 명사만 포함한다. 1글자 명사는 제외한다.`;

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
  const parsed = JSON.parse(jsonText) as CompetitorNounResult;

  const titleNouns = Array.isArray(parsed.titleNouns)
    ? parsed.titleNouns
        .filter(
          (entry) =>
            typeof entry?.noun === "string" &&
            entry.noun.length >= 2 &&
            typeof entry.occurrences === "number"
        )
        .sort((a, b) => b.occurrences - a.occurrences)
    : [];

  const commonNouns = Array.isArray(parsed.commonNouns)
    ? parsed.commonNouns
        .filter(
          (entry) =>
            typeof entry?.noun === "string" &&
            entry.noun.length >= 2 &&
            typeof entry.occurrences === "number" &&
            typeof entry.blogCount === "number" &&
            entry.blogCount >= 2
        )
        .sort(
          (a, b) =>
            b.blogCount - a.blogCount || b.occurrences - a.occurrences
        )
    : [];

  return { titleNouns, commonNouns };
}
