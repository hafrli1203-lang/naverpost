import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { buildReferenceDigest } from "@/lib/documents/referenceFormatter";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 15000;

async function extractTextFromFile(fileName: string, buffer: Buffer): Promise<string> {
  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  if (fileName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  throw new Error("지원 파일 형식: .txt, .md, .docx, .pdf");
}

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
        { success: false, error: "파일 크기는 10MB 이하만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = (await extractTextFromFile(fileName, buffer)).trim();

    if (extractedText.length > MAX_TEXT_LENGTH) {
      extractedText = `${extractedText.slice(0, MAX_TEXT_LENGTH)}\n\n...(중략)`;
    }

    if (!extractedText) {
      return NextResponse.json(
        { success: false, error: "파일에서 읽을 수 있는 텍스트를 찾지 못했습니다." },
        { status: 400 }
      );
    }

    const digest = buildReferenceDigest(file.name, extractedText);

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        textLength: extractedText.length,
        text: digest.text,
        rawText: digest.rawText,
        sectionCount: digest.sectionCount,
        tableCount: digest.tableCount,
        snippetCount: digest.snippetCount,
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
