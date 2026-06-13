import { NextRequest, NextResponse } from "next/server";
import { backfillPublishedPosts } from "@/lib/blogops/backfill";

export const maxDuration = 120;

// POST - register published RSS posts of each shop into BlogOps.
// Body: { shopId?: string } — omit to backfill all shops. Idempotent.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { shopId?: string };
    const shopIds =
      typeof body.shopId === "string" && body.shopId.trim().length > 0
        ? [body.shopId.trim()]
        : undefined;

    const outcome = await backfillPublishedPosts(shopIds);
    if (!outcome.enabled) {
      return NextResponse.json(
        { success: false, error: "BLOGOPS_API_URL 미설정(연동 OFF)" },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, data: outcome.results });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "백필 실패" },
      { status: 500 }
    );
  }
}
