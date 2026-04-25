import { NextRequest, NextResponse } from "next/server";
import { generateImagePrompts } from "@/lib/ai/claude";
import { buildImagePrompts } from "@/lib/prompts/imagePrompt";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleContent, title, mainKeyword } = body as {
      articleContent?: string;
      title?: string;
      mainKeyword?: string;
    };

    if (!articleContent || !title || !mainKeyword) {
      return NextResponse.json(
        { success: false, error: "articleContent, title, mainKeyword는 필수입니다." },
        { status: 400 }
      );
    }

    const promptText = buildImagePrompts({ articleContent, title, mainKeyword });
    const raw = await generateImagePrompts(promptText);
    const prompts = raw
      .split("\n")
      .map((p) => p.trim())
      .map((p) => (p.startsWith("(") && p.endsWith(")") ? p.slice(1, -1).trim() : p))
      .map((p) => (p.startsWith("(") ? p.slice(1).trim() : p))
      .filter((p) => p.length > 20)
      .slice(0, 10);

    if (prompts.length === 0) {
      return NextResponse.json(
        { success: false, error: "프롬프트 생성 결과가 비어 있습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { prompts } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "프롬프트 생성 중 오류";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
