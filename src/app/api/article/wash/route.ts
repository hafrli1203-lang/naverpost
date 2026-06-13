import { NextRequest, NextResponse } from "next/server";
import { reviseArticle } from "@/lib/ai/claude";
import { buildWashingPrompt } from "@/lib/prompts/washingPrompt";
import { sanitizeMedicalLaw } from "@/lib/wash/medicalLawSanitizer";
import { sanitizeAiCliches } from "@/lib/wash/aiClicheSanitizer";
import { validateContent } from "@/lib/validation/contentValidator";
import type { ArticleContent } from "@/types";

export const maxDuration = 300;

const WASHING_TIMEOUT_MS = 180_000;

function stripLeadingTitleLine(content: string, title: string): string {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstMeaningfulIndex === -1) return content.trim();

  const firstLine = lines[firstMeaningfulIndex].trim().replace(/^#+\s*/, "");
  if (firstLine === title.trim()) {
    lines.splice(firstMeaningfulIndex, 1);
    return lines.join("\n").replace(/^\s+/, "").trim();
  }
  return content.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      article?: ArticleContent;
      charCount?: number;
    };

    const article = body.article;
    if (!article?.content || !article.mainKeyword || !article.subKeyword1 || !article.subKeyword2) {
      return NextResponse.json(
        { success: false, error: "워싱할 본문과 키워드 정보가 필요합니다." },
        { status: 400 }
      );
    }

    const charCount = body.charCount ?? 2000;

    // Pass 1 — 결정론적 의료법/광고법 안전화 + 약한 AI 상투어 사람말투 치환
    const sanitized = sanitizeMedicalLaw(article.content);
    const declichedPass1 = sanitizeAiCliches(sanitized.content);

    // Pass 2 — LLM 워싱: 안경사 톤 + 본문 구조 점검 + 잔존 위반 마무리 정리
    const washingPrompt = buildWashingPrompt({
      originalContent: declichedPass1.content,
      title: article.title,
      mainKeyword: article.mainKeyword,
      subKeyword1: article.subKeyword1,
      subKeyword2: article.subKeyword2,
      charCount,
      shopName: article.shopName,
      tone: article.washingTone,
    });

    let washedRaw: string;
    try {
      washedRaw = await reviseArticle(washingPrompt, WASHING_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : "워싱 중 오류가 발생했습니다.";
      console.error("[api/article/wash] LLM revise failed", { message });
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }

    let content = stripLeadingTitleLine(washedRaw, article.title);

    // Pass 3 — LLM 워싱 후에도 잔존할 수 있는 의료/광고 위반 표현 + AI 상투어를 한 번 더 결정론적으로 청소
    const finalSanitized = sanitizeMedicalLaw(content);
    const declichedPass3 = sanitizeAiCliches(finalSanitized.content);
    content = declichedPass3.content;

    const validationKeywords = {
      title: article.title,
      mainKeyword: article.mainKeyword,
      subKeyword1: article.subKeyword1,
      subKeyword2: article.subKeyword2,
    };
    const validation = await validateContent(content, validationKeywords);

    return NextResponse.json({
      success: true,
      data: {
        ...article,
        content,
        validation,
        washingApplied: true,
        preWashContent: article.preWashContent ?? article.content,
        preWashValidation: article.preWashValidation ?? article.validation,
        washReport: {
          deterministicReplacements:
            sanitized.totalReplacements +
            finalSanitized.totalReplacements +
            declichedPass1.totalReplacements +
            declichedPass3.totalReplacements,
          aiClicheReplacements: declichedPass1.totalReplacements + declichedPass3.totalReplacements,
          deterministicByCategory: {
            medicalTerm: sanitized.byCategory["medical-term"] + finalSanitized.byCategory["medical-term"],
            exaggeration: sanitized.byCategory.exaggeration + finalSanitized.byCategory.exaggeration,
            absolute: sanitized.byCategory.absolute + finalSanitized.byCategory.absolute,
            comparison: sanitized.byCategory.comparison + finalSanitized.byCategory.comparison,
            phrase: sanitized.byCategory.phrase + finalSanitized.byCategory.phrase,
            discountPressure: sanitized.byCategory["discount-pressure"] + finalSanitized.byCategory["discount-pressure"],
          },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "워싱 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
