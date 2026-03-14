import { NextRequest, NextResponse } from "next/server";
import { getImage } from "@/lib/storage/imageStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const { imageId } = await params;

  if (!imageId) {
    return NextResponse.json(
      { success: false, error: "imageId는 필수입니다." },
      { status: 400 }
    );
  }

  const imageBuffer = await getImage(imageId);

  if (!imageBuffer) {
    return NextResponse.json(
      { success: false, error: "이미지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(imageBuffer), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
