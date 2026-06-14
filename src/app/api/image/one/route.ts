import { NextRequest, NextResponse } from "next/server";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";
import { getSceneReferenceImages, type SceneTag } from "@/lib/data/shopRefs";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, index, prompt, shopId, scene } = body as {
      sessionId?: string;
      index?: number;
      prompt?: string;
      shopId?: string;
      scene?: SceneTag | null;
    };

    if (!sessionId || index === undefined || !prompt) {
      return NextResponse.json(
        { success: false, error: "sessionId, index, prompt는 필수입니다." },
        { status: 400 }
      );
    }

    // 장면 태그가 있는 매장 장면에만 그 장면에 맞는 실제 매장 사진을 참조로 첨부.
    // 매장 밖/개념 이미지(scene=null)는 빈 배열 → 묘사 기반 생성.
    const refImages = scene && shopId ? await getSceneReferenceImages(shopId, scene) : [];

    const result = await generateBlogImage(prompt, refImages);
    const saved = await saveImage(sessionId, index, result.base64Data, result.mimeType);

    return NextResponse.json({
      success: true,
      data: {
        index,
        imageId: saved.imageId,
        imageUrl: `/api/image/file/${saved.imageId}`,
        base64Data: result.base64Data,
        mimeType: saved.mimeType,
        prompt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "이미지 생성 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
