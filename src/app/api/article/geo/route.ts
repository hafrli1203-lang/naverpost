import { NextRequest, NextResponse } from "next/server";
import { applyGeoRecommendations, runGeoHarness } from "@/lib/geo/harness";
import { validateContent } from "@/lib/validation/contentValidator";
import type { ArticleContent, GeoRecommendation } from "@/types";

type GeoRequestBody =
  | {
      mode: "analyze";
      article: ArticleContent;
    }
  | {
      mode: "apply";
      article: ArticleContent;
      selectedRecommendationIds: GeoRecommendation["id"][];
    };

function buildValidationKeywords(article: ArticleContent) {
  return {
    title: article.title,
    mainKeyword: article.mainKeyword,
    subKeyword1: article.subKeyword1,
    subKeyword2: article.subKeyword2,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeoRequestBody;

    if (!body.article?.content || !body.article?.title) {
      return NextResponse.json(
        { success: false, error: "article.title과 article.content가 필요합니다." },
        { status: 400 }
      );
    }

    if (body.mode === "analyze") {
      const analysis = runGeoHarness(body.article);
      return NextResponse.json({ success: true, data: analysis });
    }

    if (body.mode === "apply") {
      const result = applyGeoRecommendations(
        body.article,
        body.selectedRecommendationIds ?? []
      );

      const validation = await validateContent(
        result.optimizedContent,
        buildValidationKeywords(body.article)
      );

      const optimizedArticle: ArticleContent = {
        ...body.article,
        content: result.optimizedContent,
        validation,
        geo: result.analysisAfter,
      };

      return NextResponse.json({
        success: true,
        data: {
          article: optimizedArticle,
          optimization: result,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "지원하지 않는 mode입니다." },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GEO 분석 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
