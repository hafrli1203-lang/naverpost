import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";
import { washImageBuffer } from "@/lib/storage/imageWash";
import {
  getSceneReferenceImages,
  listScenePhotos,
  listDetailRefPhotos,
  pickDetailCategory,
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

    // 공간 컷(외관/내부/디테일, 사람 없음)만 실제 사진을 워싱해 직접 서빙한다.
    // 사람이 등장하는 fitting은 직접 서빙하지 않는다(원본과 동일인 방지) → 아래에서 새로 생성.
    if (shopId && scene && RAW_PHOTO_SCENES.has(scene)) {
      // detail = 안경 부품/제품 디테일 → 6매장 공유 풀(주제 매칭) 우선, 없으면 매장 detail.
      let pool =
        scene === "detail"
          ? await listDetailRefPhotos(pickDetailCategory(prompt ?? ""))
          : await listScenePhotos(shopId, scene);
      if (pool.length === 0 && scene === "detail") {
        pool = await listScenePhotos(shopId, scene);
      }
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

    // 장면 태그가 있는 매장 장면에 그 장면의 실제 "매장 사진"을 참조로 첨부(사람 사진 미투입).
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
