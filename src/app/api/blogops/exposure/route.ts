import { NextRequest, NextResponse } from "next/server";
import { trackExposureForShops } from "@/lib/blogops/exposure";

export const maxDuration = 120;

// POST - measure Naver search ranks for tracked keywords and store runs in BlogOps.
// Body: { shopId?: string } — omit to track all shops.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { shopId?: string };
    const shopIds =
      typeof body.shopId === "string" && body.shopId.trim().length > 0
        ? [body.shopId.trim()]
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
