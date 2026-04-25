import { NextRequest, NextResponse } from "next/server";
import { generateBlogImage } from "@/lib/ai/imageGen";
import { saveImage } from "@/lib/storage/imageStore";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, index, prompt } = body as {
      sessionId?: string;
      index?: number;
      prompt?: string;
    };

    if (!sessionId || index === undefined || !prompt) {
      return NextResponse.json(
        { success: false, error: "sessionId, index, prompt는 필수입니다." },
        { status: 400 }
      );
    }

    const result = await generateBlogImage(prompt);
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
