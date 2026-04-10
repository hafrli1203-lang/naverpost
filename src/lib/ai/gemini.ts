const TEXT_MODEL = "gemini-2.5-flash";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
};

function getApiKey(): string {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY가 설정되지 않았습니다.");
  }
  return apiKey;
}

function normalizeGeminiError(status: number, message: string, operation: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      `Gemini API 인증 오류로 ${operation}에 실패했습니다. Vercel의 GOOGLE_AI_API_KEY를 확인하세요.`
    );
  }

  if (status === 429) {
    return new Error(`Gemini API 할당량 초과로 ${operation}에 실패했습니다.`);
  }

  return new Error(`Gemini API 호출 실패 (${operation}): ${message}`);
}

async function generateText(prompt: string, operation: string): Promise<string> {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw normalizeGeminiError(response.status, errorText, operation);
  }

  const data = (await response.json()) as GeminiGenerateContentResponse;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason;
    throw new Error(
      `Gemini 응답이 비어 있습니다 (${operation}${finishReason ? `, finishReason=${finishReason}` : ""}).`
    );
  }

  return text;
}

export async function generateImagePrompts(prompt: string): Promise<string> {
  return generateText(prompt, "이미지 프롬프트 생성");
}

export async function generateTopicSuggestions(prompt: string): Promise<string> {
  return generateText(prompt, "주제 추천");
}
