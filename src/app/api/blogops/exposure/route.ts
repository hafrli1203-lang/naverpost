import { NextRequest, NextResponse } from "next/server";
import { trackExposureForShops } from "@/lib/blogops/exposure";
import { blogopsShopSchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";

export const maxDuration = 120;

// POST - measure Naver search ranks for tracked keywords and store runs in BlogOps.
// Body: { shopId?: string } — omit to track all shops.
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = parseRequestBody(blogopsShopSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 }
      );
    }
    const shopIds =
      typeof parsed.data.shopId === "string" && parsed.data.shopId.trim().length > 0
        ? [parsed.data.shopId.trim()]
        : undefined;

    const outcome = await trackExposureForShops(shopIds);
    if (!outcome.enabled) {
      return NextResponse.json(
        { success: false, error: "BLOGOPS_API_URL 미설정(연동 OFF)" },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, data: outcome.results });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "노출 추적 실패" },
      { status: 500 }
    );
  }
}
