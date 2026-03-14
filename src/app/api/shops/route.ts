import { NextRequest, NextResponse } from "next/server";
import { getShops, addShop } from "@/lib/data/shops";
import type { Shop } from "@/types";

export async function GET() {
  try {
    const shops = await getShops();
    return NextResponse.json({ success: true, data: shops });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "매장 목록 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, blogId } = body as { name: string; blogId: string };

    if (!name || !blogId) {
      return NextResponse.json(
        { success: false, error: "name과 blogId는 필수입니다." },
        { status: 400 }
      );
    }

    const shop: Shop = {
      id: blogId,
      name,
      blogId,
      rssUrl: `https://rss.blog.naver.com/${blogId}.xml`,
    };

    const shops = await addShop(shop);
    return NextResponse.json({ success: true, data: shops });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "매장 등록 실패" },
      { status: 500 }
    );
  }
}
