import { NextRequest } from "next/server";
import { generateImagePrompts } from "@/lib/ai/claude";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage, getGenerationParams, deleteGenerationParams } from "@/lib/storage/imageStore";
import { buildImagePrompts, parseScenePrompt } from "@/lib/prompts/imagePrompt";
import { getShopById } from "@/lib/data/shops";
import { getShopProfile, getSceneReferenceImages } from "@/lib/data/shopRefs";
import {
  imageGenerateSchema,
  parseRequestBody,
} from "@/lib/validation/imageRequestSchemas";

export const runtime = "nodejs";
// 개별 gti 호출이 최대 ~320s까지 걸릴 수 있고, 동시성 제한으로 작업을 여러 파동에 나눠
// 처리하므로 전체 핸들러 시간이 길어진다. one/route 와 동일하게 600s 여유를 둔다.
export const maxDuration = 600;

// 동시 spawn 상한. 과거 10개 동시 spawn은 Windows 프로세스 초기화 실패(0xC0000142)와
// 백엔드 혼잡성 401을 유발했고, 반대로 3개는 배치가 과도하게 느려졌다. 5개로 두면
// 10장을 2파동에 처리(속도 회복)하면서 동시 spawn 압력은 절반으로 낮춘다. 간헐 실패는
// gtiCli 내부 재시도(혼잡성 401·빈응답·파일 레이스)가 흡수한다.
const IMAGE_CONCURRENCY = 5;

/**
 * items 를 worker 로 처리하되 동시에 최대 limit 개만 실행한다(워커 풀).
 * worker 는 자체적으로 try/catch 하여 개별 실패가 전체를 멈추지 않는다.
 */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function runLane(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }
  const laneCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: laneCount }, () => runLane()));
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Invalid request body" })}\n\n`,
      { headers: sseHeaders() }
    );
  }

  const parsed = parseRequestBody(imageGenerateSchema, raw);
  if (!parsed.ok) {
    return new Response(
      `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Missing required fields" })}\n\n`,
      { headers: sseHeaders() }
    );
  }
  const { sessionId, articleContent, title, mainKeyword, shopId } = parsed.data;

  return new Response(createImageStream(sessionId, articleContent, title, mainKeyword, shopId), {
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
  sessionId: string,
  articleContent: string,
  title: string,
  mainKeyword: string,
  shopId?: string
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      console.log("[image.generate] start", {
        provider: "cli",
        promptModel: "claude-sonnet-4-6",
        imageModel: "gpt-image-2 (gti)",
        sessionId,
      });

      try {
        let shop: { name: string; interiorDescription?: string } | undefined;
        if (shopId) {
          const shopRecord = await getShopById(shopId);
          if (shopRecord) {
            const profile = await getShopProfile(shopId);
            shop = { name: shopRecord.name, interiorDescription: profile?.interiorDescription };
          }
        }

        const promptText = buildImagePrompts({ articleContent, title, mainKeyword, shop });
        const rawPrompts = await generateImagePrompts(promptText);
        const prompts = rawPrompts
          .split("\n")
          .map((p) => p.trim())
          .map((p) => (p.startsWith("(") && p.endsWith(")") ? p.slice(1, -1).trim() : p))
          .filter((p) => p.length > 0)
          .map((line) => parseScenePrompt(line))
          .filter((p) => p.prompt.length > 0)
          .slice(0, 10);

        console.log("[image.generate] prompts", {
          sessionId,
          promptCount: prompts.length,
          samplePrompt: prompts[0]?.prompt.slice(0, 120) ?? "",
        });

        if (prompts.length === 0) {
          throw new Error("Image prompt generation returned 0 prompts.");
        }

        const total = prompts.length;
        let successCount = 0;
        let failCount = 0;

        // 동시성 제한(IMAGE_CONCURRENCY)으로 작업을 여러 파동에 나눠 처리한다. 과거 전량
        // 동시 spawn은 Windows 프로세스 초기화 실패와 백엔드 스로틀(타임아웃·ENOENT)을
        // 유발했다. SSE 컨트롤러가 쓰기를 직렬화하므로 완료 순서가 섞여도 클라가 index로 처리한다.
        for (let i = 0; i < total; i++) {
          send({ type: "progress", index: i, total });
        }

        await mapWithConcurrency(
          prompts,
          IMAGE_CONCURRENCY,
          async ({ prompt, scene }, i) => {
            try {
              const refImages =
                scene && shopId ? await getSceneReferenceImages(shopId, scene) : [];
              const result = await generateBlogImage(prompt, refImages);
              const saved = await saveImage(sessionId, i, result.base64Data, result.mimeType);
              send({
                type: "image-ready",
                index: i,
                imageId: saved.imageId,
                imageUrl: `/api/image/file/${saved.imageId}`,
                base64Data: result.base64Data,
                mimeType: saved.mimeType,
                prompt,
                total,
              });
              successCount++;
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown image generation error";
              console.error("[image.generate] image-failed", {
                sessionId,
                index: i,
                prompt,
                error: message,
              });
              send({ type: "image-failed", index: i, total, error: message });
              failCount++;
            }
          }
        );

        console.log("[image.generate] complete", { sessionId, successCount, failCount, total });
        send({ type: "complete", successCount, failCount, total });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[image.generate] fatal", { sessionId, error: message });
        send({
          type: "complete",
          successCount: 0, failCount: 0, total: 0,
          error: message,
        });
      }
      controller.close();
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const encodedParams = searchParams.get("params") ?? "";
  const token = searchParams.get("token") ?? "";

  if (encodedParams) {
    try {
      const decoded = decodeURIComponent(escape(atob(encodedParams)));
      const { sessionId, articleContent, title, mainKeyword, shopId } = JSON.parse(decoded);
      if (!sessionId || !articleContent || !title || !mainKeyword) {
        return new Response(
          `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Invalid params" })}\n\n`,
          { headers: sseHeaders() }
        );
      }
      return new Response(
        createImageStream(sessionId, articleContent, title, mainKeyword, shopId),
        { headers: sseHeaders() }
      );
    } catch {
      return new Response(
        `data: ${JSON.stringify({ type: "complete", successCount: 0, failCount: 0, total: 0, error: "Failed to decode params" })}\n\n`,
        { headers: sseHeaders() }
      );
    }
  }

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
    createImageStream(
      params.sessionId,
      params.articleContent,
      params.title,
      params.mainKeyword,
      (params as { shopId?: string }).shopId
    ),
    { headers: sseHeaders() }
  );
}
