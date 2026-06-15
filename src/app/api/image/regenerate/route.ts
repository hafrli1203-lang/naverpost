import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";
import { washImageBuffer } from "@/lib/storage/imageWash";
import {
  getSceneReferenceImages,
  listScenePhotos,
  type SceneTag,
} from "@/lib/data/shopRefs";

export const runtime = "nodejs";
export const maxDuration = 300;

// "공간/장비/제품" 컷만 실제 사진을 그대로 서빙. 검안·피팅은 사람이 동작하는 장면이라
// 실제 사진(사람 없음) 대신 AI 생성 + 실제사진 참조로 처리한다(아래 생성 경로).
const RAW_PHOTO_SCENES = new Set<SceneTag>(["exterior", "interior", "detail"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { index, sessionId, prompt, shopId, scene } = body as {
      index: number;
      sessionId: string;
      prompt?: string;
      shopId?: string;
      scene?: SceneTag | null;
    };

    if (index === undefined || !sessionId) {
      return NextResponse.json(
        { success: false, error: "index와 sessionId는 필수입니다." },
        { status: 400 }
      );
    }

    // 매장 컷 재생성: AI로 다시 그리지 않고 "다른 실제 매장 사진"을 골라 워싱해서 서빙
    // (그래야 재생성해도 일반 AI 매장으로 되돌아가지 않고, 매번 다른 진짜 사진 + 다른 해시).
    if (shopId && scene && RAW_PHOTO_SCENES.has(scene)) {
      const pool = await listScenePhotos(shopId, scene);
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        try {
          const raw = await fs.readFile(pick);
          const washed = await washImageBuffer(raw);
          const base64Data = washed.data.toString("base64");
          const saved = await saveImage(sessionId, index, base64Data, washed.mimeType);
          return NextResponse.json({
            success: true,
            data: {
              imageId: saved.imageId,
              imageUrl: `/api/image/file/${saved.imageId}`,
              base64Data,
              mimeType: saved.mimeType,
              usedRealPhoto: true,
            },
          });
        } catch {
          // 실제 사진 실패 → 아래 생성 경로로 폴백
        }
      }
    }

    const imagePrompt =
      prompt ||
      "A clean realistic photo of modern eyeglasses in a bright, modern present-day Korean optical shop with wall-mounted backlit display shelves. Sharp, true-to-life color, not film, not vintage. 4:3 aspect ratio.";

    // 장면 태그가 있는 매장 장면에만 그 장면에 맞는 실제 매장 사진을 참조로 첨부.
    const refImages = scene && shopId ? await getSceneReferenceImages(shopId, scene) : [];

    const result = await generateBlogImage(imagePrompt, refImages);

    const saved = await saveImage(sessionId, index, result.base64Data, result.mimeType);
    const imageUrl = `/api/image/file/${saved.imageId}`;

    return NextResponse.json({
      success: true,
      data: {
        imageId: saved.imageId,
        imageUrl,
        base64Data: result.base64Data,
        mimeType: saved.mimeType,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "이미지 재생성 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
