import { NextRequest, NextResponse } from "next/server";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";
import { getSceneReferenceImages, type SceneTag } from "@/lib/data/shopRefs";

export const runtime = "nodejs";
export const maxDuration = 300;

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
