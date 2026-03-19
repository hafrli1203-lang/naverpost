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

// GET: 기존 token 기반 방식 (하위 호환)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token") ?? "";

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "GOOGLE_AI_API_KEY not configured" })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    );
  }

  if (!token) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "token parameter is required" })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Retrieve params stored by the session endpoint
        const params = await getGenerationParams(token);
        if (!params) {
          send({
            type: "complete",
            successCount: 0,
            failCount: 0,
            total: 0,
            error: "Session not found or expired. Please try again.",
          });
          controller.close();
          return;
        }

        const { sessionId, articleContent, title, mainKeyword } = params;

        // Clean up the params file now that we have the data
        await deleteGenerationParams(token);

        // Generate image prompts via Claude
        const promptText = buildImagePrompts({
          articleContent,
          title,
          mainKeyword,
        });
        const rawPrompts = await generateImagePrompts(promptText);
        const prompts = rawPrompts
          .split("\n")
          .map((p) => p.trim())
          // Strip surrounding parentheses that the prompt template produces: (prompt text)
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
              const imageUrl = `/api/image/file/${saved.imageId}`;
              send({
                type: "image-ready",
                index: i,
                imageId: saved.imageId,
                imageUrl,
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
          successCount: 0,
          failCount: 0,
          total: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
