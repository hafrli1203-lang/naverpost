import { NextRequest, NextResponse } from "next/server";
import { saveGenerationParams } from "@/lib/storage/imageStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, articleContent, title, mainKeyword } = body;

    if (!sessionId || !articleContent || !title || !mainKeyword) {
      return NextResponse.json(
        { error: "sessionId, articleContent, title, mainKeyword are required" },
        { status: 400 }
      );
    }

    const token = await saveGenerationParams({
      sessionId,
      articleContent,
      title,
      mainKeyword,
    });

    return NextResponse.json({ token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
