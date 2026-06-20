import { NextRequest, NextResponse } from "next/server";
import { analyzeTitleSimilarity } from "@/lib/analysis/titleSimilarity";
import { fetchCompetitorTitles, NaverSearchDependencyError } from "@/lib/naver/searchSignals";
import { titleSimilaritySchema } from "@/lib/validation/apiRequestSchemas";
import { parseRequestBody } from "@/lib/validation/parseRequestBody";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = parseRequestBody(titleSimilaritySchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const title = body.title?.trim() ?? "";
    const keyword = body.keyword?.trim() || title;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "title이 필요합니다." },
        { status: 400 }
      );
    }

    const providedTitles = (body.comparisonTitles ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    const competitorTitles =
      providedTitles.length > 0 ? providedTitles : await fetchCompetitorTitles([keyword], 1);
    const similarity = analyzeTitleSimilarity(title, competitorTitles);

    return NextResponse.json({
      success: true,
      data: {
        title,
        keyword,
        similarity,
        comparedTitles: competitorTitles,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "제목 유사도 분석 중 오류가 발생했습니다.";
    const status = error instanceof NaverSearchDependencyError ? 503 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
