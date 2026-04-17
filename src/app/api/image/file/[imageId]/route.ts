import { NextRequest, NextResponse } from "next/server";
import { getImage } from "@/lib/storage/imageStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const { imageId } = await params;

  if (!imageId) {
    return NextResponse.json(
      { success: false, error: "imageId가 필요합니다." },
      { status: 400 }
    );
  }

  const storedImage = await getImage(imageId);

  if (!storedImage) {
    return NextResponse.json(
      { success: false, error: "이미지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(storedImage.buffer), {
    headers: {
      "Content-Type": storedImage.mimeType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
