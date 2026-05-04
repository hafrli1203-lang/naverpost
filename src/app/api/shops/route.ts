import { NextRequest, NextResponse } from "next/server";
import { getShops, addShop } from "@/lib/data/shops";
import type { Shop } from "@/types";

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "string") {
    const items = value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildShopFromBody(body: Record<string, unknown>): Shop {
  const name = toOptionalString(body.name);
  const blogId = toOptionalString(body.blogId);
  if (!name || !blogId) {
    throw new Error("name과 blogId는 필수입니다.");
  }

  return {
    id: blogId,
    name,
    blogId,
    rssUrl: `https://rss.blog.naver.com/${blogId}.xml`,
    address: toOptionalString(body.address),
    naverPlaceUrl: toOptionalString(body.naverPlaceUrl),
    homepageUrl: toOptionalString(body.homepageUrl),
    brandBannerText: toOptionalString(body.brandBannerText),
    parkingInfo: toOptionalString(body.parkingInfo),
    businessHours: toOptionalString(body.businessHours),
    mainProducts: toStringArray(body.mainProducts),
    serviceStrengths: toStringArray(body.serviceStrengths),
    visitChecklist: toStringArray(body.visitChecklist),
    avoidClaims: toStringArray(body.avoidClaims),
  };
}

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
    const shop = buildShopFromBody(body as Record<string, unknown>);

    const shops = await addShop(shop);
    return NextResponse.json({ success: true, data: shops });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "매장 등록 실패" },
      { status: 500 }
    );
  }
}
