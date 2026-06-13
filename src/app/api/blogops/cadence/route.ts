import { NextRequest, NextResponse } from "next/server";
import { getCadenceReport } from "@/lib/blogops/cadence";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const shopId = request.nextUrl.searchParams.get("shopId") ?? undefined;
    const data = await getCadenceReport(shopId || undefined);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "발행 일관성 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
