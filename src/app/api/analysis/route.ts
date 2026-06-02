import { NextRequest, NextResponse } from "next/server";
import { inferSmartBlockSubKeywords } from "@/lib/analysis/smartBlock";
import { analyzeAutocompleteIndex } from "@/lib/analysis/autocompleteIndex";
import { auditPosting } from "@/lib/analysis/postingAudit";

export const maxDuration = 60;

type AnalysisBody = {
  mode?: "smart-block" | "autocomplete-index" | "posting-audit";
  mainKeyword?: string;
  subKeyword1?: string;
  subKeyword2?: string;
  title?: string;
  body?: string;
};

/**
 * 블라이 대응 분석 디스패처.
 *  - smart-block        : 스마트블록 하위키워드 추론 (제목용 키워드 추천)
 *  - autocomplete-index : 자완 색인 분석 (본문 누락 조합 키워드 제안)
 *  - posting-audit      : 발행 전 포스팅 통합 점검 (형태소 비중/반복/금지어/이미지)
 */
export async function POST(request: NextRequest) {
  let payload: AnalysisBody;
  try {
    payload = (await request.json()) as AnalysisBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "요청 본문(JSON)을 해석하지 못했습니다." },
      { status: 400 }
    );
  }

  const mode = payload.mode;

  try {
    if (mode === "smart-block") {
      if (!payload.mainKeyword?.trim()) {
        return NextResponse.json(
          { success: false, error: "mainKeyword가 필요합니다." },
          { status: 400 }
        );
      }
      const data = await inferSmartBlockSubKeywords(payload.mainKeyword);
      return NextResponse.json({ success: true, data });
    }

    if (mode === "autocomplete-index") {
      if (!payload.title?.trim() || !payload.mainKeyword?.trim()) {
        return NextResponse.json(
          { success: false, error: "title과 mainKeyword가 필요합니다." },
          { status: 400 }
        );
      }
      const data = await analyzeAutocompleteIndex({
        title: payload.title,
        mainKeyword: payload.mainKeyword,
        subKeyword1: payload.subKeyword1,
        subKeyword2: payload.subKeyword2,
        body: payload.body ?? "",
      });
      return NextResponse.json({ success: true, data });
    }

    if (mode === "posting-audit") {
      if (!payload.title?.trim() || !payload.body?.trim()) {
        return NextResponse.json(
          { success: false, error: "title과 body가 필요합니다." },
          { status: 400 }
        );
      }
      const data = auditPosting({
        title: payload.title,
        body: payload.body,
        mainKeyword: payload.mainKeyword,
        subKeyword1: payload.subKeyword1,
        subKeyword2: payload.subKeyword2,
      });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "mode는 'smart-block' | 'autocomplete-index' | 'posting-audit' 중 하나여야 합니다.",
      },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "분석 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
