import { NextRequest, NextResponse } from "next/server";
import { validateContent } from "@/lib/validation/contentValidator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content } = body as { content: string };

    if (!content) {
      return NextResponse.json(
        { success: false, error: "content는 필수입니다." },
        { status: 400 }
      );
    }

    const validation = validateContent(content);

    return NextResponse.json({ success: true, data: validation });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "검증 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
