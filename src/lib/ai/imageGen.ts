/**
 * 나노바나나 프로 이미지 생성기
 * Google AI Studio REST API 직접 호출 (gemini-2.0-flash-exp-image-generation)
 * SDK가 아닌 REST API를 사용하여 imageConfig를 정확히 전달
 */

const IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";

export async function generateBlogImage(
  prompt: string,
  apiKey: string
): Promise<{ base64Data: string } | null> {
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
      return null;
    }

    const data = await res.json();
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return { base64Data: part.inlineData.data };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
