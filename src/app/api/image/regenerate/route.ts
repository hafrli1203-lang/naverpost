import { NextRequest, NextResponse } from "next/server";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { index, sessionId, prompt } = body as {
      index: number;
      sessionId: string;
      prompt?: string;
    };

    if (index === undefined || !sessionId) {
      return NextResponse.json(
        { success: false, error: "index와 sessionId는 필수입니다." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GOOGLE_AI_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const imagePrompt =
      prompt ||
      "A high-quality photo of modern eyeglasses in a clean, bright optical shop setting. Professional product photography, 4:3 aspect ratio.";

    const result = await generateBlogImage(imagePrompt, apiKey);

    if (!result) {
      return NextResponse.json(
        { success: false, error: "이미지 생성에 실패했습니다." },
        { status: 500 }
      );
    }

    const saved = await saveImage(sessionId, index, result.base64Data);
    const imageUrl = `/api/image/file/${saved.imageId}`;

    return NextResponse.json({
      success: true,
      data: {
        imageId: saved.imageId,
        imageUrl,
        base64Data: result.base64Data,
        mimeType: result.mimeType,
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
