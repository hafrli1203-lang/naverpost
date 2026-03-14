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

export async function researchKeyword(keyword: string): Promise<string> {
  const prompt = `다음 키워드에 대해 블로그 글 작성을 위한 자료를 조사해 주세요: "${keyword}"

다음 내용을 포함해 주세요:
1. 키워드의 핵심 정보, 개념, 최신 트렌드
2. 블로그 독자들이 궁금해할 만한 검색 질문 5개
3. 각 질문은 구체적이고 명확하게
4. 다양한 관점 포함 (개념, 방법, 사례, 장단점, 트렌드)
5. 신뢰할 수 있는 출처 기반

출력 형식:
[자료 요약]
(키워드 관련 핵심 정보 요약)

[후속 검색 질문 5개 목록]
1. (질문1)
2. (질문2)
3. (질문3)
4. (질문4)
5. (질문5)`;

  const response = await getClient().chat.completions.create({
    model: "sonar",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0]?.message?.content ?? "";
}
