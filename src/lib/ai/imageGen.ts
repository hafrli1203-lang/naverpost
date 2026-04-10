/**
 * 나노바나나 프로 이미지 생성기
 * Google AI Studio REST API 직접 호출 (gemini-3-pro-image-preview)
 * SDK가 아닌 REST API를 사용하여 imageConfig를 정확히 전달
 */

const IMAGE_MODEL = "gemini-3-pro-image-preview";

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export async function generateBlogImage(
  prompt: string,
  apiKey: string
): Promise<{ base64Data: string; mimeType: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "4:3" },
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Gemini image API failed (${IMAGE_MODEL}, status=${res.status}): ${errText || res.statusText}`
      );
    }

    const data = (await res.json()) as GeminiImageResponse;
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return {
            base64Data: part.inlineData.data,
            mimeType: part.inlineData.mimeType || "image/jpeg",
          };
        }
      }
    }

    const textParts = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    const finishReason = data.candidates?.[0]?.finishReason;

    throw new Error(
      `Gemini image API returned no image (${IMAGE_MODEL}${finishReason ? `, finishReason=${finishReason}` : ""}${textParts ? `, text=${textParts}` : ""})`
    );
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Gemini image API unexpected error (${IMAGE_MODEL})`);
  }
}
