import { NextRequest, NextResponse } from "next/server";
import { updateShop, deleteShop } from "@/lib/data/shops";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const body = await request.json();
    const { name, blogId } = body as { name?: string; blogId?: string };

    const updates: Record<string, string> = {};
    if (name) updates.name = name;
    if (blogId) {
      updates.blogId = blogId;
      updates.rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    }

    const shops = await updateShop(shopId, updates);
    return NextResponse.json({ success: true, data: shops });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "매장 수정 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const shops = await deleteShop(shopId);
    return NextResponse.json({ success: true, data: shops });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "매장 삭제 실패" },
      { status: 500 }
    );
  }
}
