import { NextRequest } from "next/server";
import { generateImagePrompts } from "@/lib/ai/claude";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage, getGenerationParams, deleteGenerationParams } from "@/lib/storage/imageStore";
import { buildImagePrompts } from "@/lib/prompts/imagePrompt";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for SSE

// POST: 파라미터를 body에 직접 받아 이미지 생성 (Vercel 서버리스 호환)
export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "GOOGLE_AI_API_KEY not configured" })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  let body: { sessionId: string; articleContent: string; title: string; mainKeyword: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Invalid request body" })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  const { sessionId, articleContent, title, mainKeyword } = body;
  if (!sessionId || !articleContent || !title || !mainKeyword) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Missing required fields" })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  return new Response(createImageStream(apiKey, sessionId, articleContent, title, mainKeyword), {
    headers: sseHeaders(),
  });
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

function createImageStream(
  apiKey: string,
  sessionId: string,
  articleContent: string,
  title: string,
  mainKeyword: string
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const promptText = buildImagePrompts({ articleContent, title, mainKeyword });
        const rawPrompts = await generateImagePrompts(promptText);
        const prompts = rawPrompts
          .split("\n")
          .map((p) => p.trim())
          .map((p) => (p.startsWith("(") && p.endsWith(")") ? p.slice(1, -1).trim() : p))
          .filter((p) => p.length > 0)
          .slice(0, 10);

        const total = prompts.length;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < total; i++) {
          send({ type: "progress", index: i, total });
          try {
            const result = await generateBlogImage(prompts[i], apiKey);
            if (result) {
              const saved = await saveImage(sessionId, i, result.base64Data);
              send({
                type: "image-ready",
                index: i,
                imageId: saved.imageId,
                imageUrl: `/api/image/file/${saved.imageId}`,
                prompt: prompts[i],
                total,
              });
              successCount++;
            } else {
              send({ type: "image-failed", index: i, total });
              failCount++;
            }
          } catch {
            send({ type: "image-failed", index: i, total });
            failCount++;
          }
        }
        send({ type: "complete", successCount, failCount, total });
      } catch (err) {
        send({
          type: "complete",
          successCount: 0, failCount: 0, total: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
      controller.close();
    },
  });
}

// GET: params를 URL에서 직접 받거나 token 기반 fallback
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const encodedParams = searchParams.get("params") ?? "";
  const token = searchParams.get("token") ?? "";

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "GOOGLE_AI_API_KEY not configured" })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  // params 직접 전달 방식 (Vercel 서버리스 호환)
  if (encodedParams) {
    try {
      const decoded = decodeURIComponent(escape(atob(encodedParams)));
      const { sessionId, articleContent, title, mainKeyword } = JSON.parse(decoded);
      if (!sessionId || !articleContent || !title || !mainKeyword) {
        return new Response(
          `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Invalid params" })}\n\n`,
          { headers: sseHeaders() }
        );
      }
      return new Response(
        createImageStream(apiKey, sessionId, articleContent, title, mainKeyword),
        { headers: sseHeaders() }
      );
    } catch {
      return new Response(
        `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Failed to decode params" })}\n\n`,
        { headers: sseHeaders() }
      );
    }
  }

  // token 기반 fallback (하위 호환)
  if (!token) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "params or token parameter is required" })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  const params = await getGenerationParams(token);
  if (!params) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Session not found or expired. Please try again." })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  await deleteGenerationParams(token);
  return new Response(
    createImageStream(apiKey, params.sessionId, params.articleContent, params.title, params.mainKeyword),
    { headers: sseHeaders() }
  );
}
