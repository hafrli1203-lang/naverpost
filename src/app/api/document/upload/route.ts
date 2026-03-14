import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "파일이 필요합니다." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "파일 크기는 10MB를 초과할 수 없습니다." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = "";

    if (fileName.endsWith(".txt")) {
      extractedText = buffer.toString("utf-8");
    } else if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileName.endsWith(".pdf")) {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      extractedText = result.text;
      await parser.destroy();
    } else {
      return NextResponse.json(
        { success: false, error: "지원하는 파일 형식: .txt, .docx, .pdf" },
        { status: 400 }
      );
    }

    // Trim and limit text length to prevent excessive prompt size
    extractedText = extractedText.trim();
    if (extractedText.length > 15000) {
      extractedText = extractedText.slice(0, 15000) + "\n\n...(이하 생략)";
    }

    if (!extractedText) {
      return NextResponse.json(
        { success: false, error: "파일에서 텍스트를 추출할 수 없습니다." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        textLength: extractedText.length,
        text: extractedText,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "파일 처리 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
