import { NextRequest } from "next/server";
import { generateImagePrompts } from "@/lib/ai/claude";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";
import { buildImagePrompts } from "@/lib/prompts/imagePrompt";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for SSE

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sessionId = searchParams.get("sessionId") ?? "";
  const articleContent = searchParams.get("articleContent") ?? "";
  const title = searchParams.get("title") ?? "";
  const mainKeyword = searchParams.get("mainKeyword") ?? "";

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
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
