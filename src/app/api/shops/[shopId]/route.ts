import { NextRequest, NextResponse } from "next/server";
import { updateShop, deleteShop } from "@/lib/data/shops";
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

function buildShopUpdates(body: Record<string, unknown>): Partial<Shop> {
  const updates: Partial<Shop> = {};
  const name = toOptionalString(body.name);
  const blogId = toOptionalString(body.blogId);

  if (name) updates.name = name;
  if (blogId) {
    updates.blogId = blogId;
    updates.rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
  }

  if ("address" in body) updates.address = toOptionalString(body.address);
  if ("naverPlaceUrl" in body) updates.naverPlaceUrl = toOptionalString(body.naverPlaceUrl);
  if ("homepageUrl" in body) updates.homepageUrl = toOptionalString(body.homepageUrl);
  if ("brandBannerText" in body) updates.brandBannerText = toOptionalString(body.brandBannerText);
  if ("parkingInfo" in body) updates.parkingInfo = toOptionalString(body.parkingInfo);
  if ("businessHours" in body) updates.businessHours = toOptionalString(body.businessHours);
  if ("mainProducts" in body) updates.mainProducts = toStringArray(body.mainProducts);
  if ("serviceStrengths" in body) updates.serviceStrengths = toStringArray(body.serviceStrengths);
  if ("visitChecklist" in body) updates.visitChecklist = toStringArray(body.visitChecklist);
  if ("avoidClaims" in body) updates.avoidClaims = toStringArray(body.avoidClaims);

  return updates;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const body = await request.json();
    const updates = buildShopUpdates(body as Record<string, unknown>);

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
