const TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503, 504]);
const MAX_RETRIES_PER_MODEL = 2;

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
    throw new Error("GOOGLE_AI_API_KEY is not configured.");
  }
  return apiKey;
}

function normalizeGeminiError(status: number, message: string, operation: string, model: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      `Gemini API authentication failed during ${operation} on ${model}. Check GOOGLE_AI_API_KEY in Vercel.`
    );
  }

  if (status === 429) {
    return new Error(`Gemini API rate limit hit during ${operation} on ${model}.`);
  }

  if (status === 503) {
    return new Error(`Gemini API is temporarily overloaded during ${operation} on ${model}: ${message}`);
  }

  return new Error(`Gemini API request failed during ${operation} on ${model}: ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateTextWithModel(prompt: string, operation: string, model: string): Promise<string> {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
    throw Object.assign(
      normalizeGeminiError(response.status, errorText, operation, model),
      { status: response.status }
    );
  }

  const data = (await response.json()) as GeminiGenerateContentResponse;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason;
    throw new Error(
      `Gemini returned an empty response during ${operation} on ${model}${finishReason ? ` (finishReason=${finishReason})` : ""}.`
    );
  }

  return text;
}

async function generateText(prompt: string, operation: string): Promise<string> {
  let lastError: Error | null = null;

  for (const model of TEXT_MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        return await generateTextWithModel(prompt, operation, model);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;
        const status = (error as { status?: number })?.status;
        const shouldRetry = typeof status === "number" && RETRYABLE_STATUS_CODES.has(status);

        if (!shouldRetry || attempt === MAX_RETRIES_PER_MODEL) {
          break;
        }

        await delay(1000 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`Gemini request failed during ${operation}.`);
}

export async function generateImagePrompts(prompt: string): Promise<string> {
  return generateText(prompt, "image prompt generation");
}

export async function generateTopicSuggestions(prompt: string): Promise<string> {
  return generateText(prompt, "topic suggestion");
}
