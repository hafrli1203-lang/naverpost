import { NextRequest, NextResponse } from "next/server";
import { validateContent } from "@/lib/validation/contentValidator";
import { articleValidateSchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseRequestBody(articleValidateSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 }
      );
    }
    const { content, tone } = parsed.data;

    const validation = await validateContent(
      content,
      tone
        ? {
            mainKeyword: "",
            subKeyword1: "",
            subKeyword2: "",
            tone,
          }
        : undefined
    );

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
