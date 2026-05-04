import { NextRequest, NextResponse } from "next/server";
import { reviseArticle } from "@/lib/ai/claude";
import { buildRevisionPrompt, buildWashingPrompt } from "@/lib/prompts/revisionPrompt";
import { validateContent } from "@/lib/validation/contentValidator";
import type { ArticleContent } from "@/types";

export const maxDuration = 300;

function sanitizeArticleContent(content: string): string {
  return content
    .replace(/문의해 주세요/g, "확인해 주세요")
    .replace(/문의해주세요/g, "확인해 주세요")
    .replace(/문의해주시/g, "확인해 주시")
    .replace(/문의/g, "확인");
}

function isCharCountOutOfRange(content: string, target: number): boolean {
  const length = content.length;
  const min = Math.floor(target * 0.9);
  const max = Math.ceil(target * 1.1);
  return length < min || length > max;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      article?: ArticleContent;
      tone?: string;
      charCount?: number;
    };

    const article = body.article;
    const charCount = body.charCount ?? 2000;
    const tone = body.tone ?? article?.washingTone ?? "standard";

    if (!article?.content || !article.mainKeyword || !article.subKeyword1 || !article.subKeyword2) {
      return NextResponse.json(
        { success: false, error: "워싱할 본문과 키워드 정보가 필요합니다." },
        { status: 400 }
      );
    }

    const washingPrompt = buildWashingPrompt({
      originalContent: article.content,
      mainKeyword: article.mainKeyword,
      subKeyword1: article.subKeyword1,
      subKeyword2: article.subKeyword2,
      charCount,
      tone,
    });

    let content = sanitizeArticleContent(await reviseArticle(washingPrompt));
    const validationKeywords = {
      title: article.title,
      mainKeyword: article.mainKeyword,
      subKeyword1: article.subKeyword1,
      subKeyword2: article.subKeyword2,
    };
    let validation = await validateContent(content, validationKeywords);
    let charOutOfRange = isCharCountOutOfRange(content, charCount);

    if (validation.needsRevision || charOutOfRange) {
      const extraProblems = charOutOfRange
        ? [
            `- 워싱 후 글자수가 ${charCount}자 ±10% 범위를 벗어났습니다 (현재 ${content.length}자). 문체는 유지하고 분량만 맞추세요.`,
          ]
        : [];
      const revisionPrompt = buildRevisionPrompt({
        originalContent: content,
        validation,
        mainKeyword: article.mainKeyword,
        subKeyword1: article.subKeyword1,
        subKeyword2: article.subKeyword2,
        charCount,
        extraProblems,
      });
      content = sanitizeArticleContent(await reviseArticle(revisionPrompt));
      validation = await validateContent(content, validationKeywords);
      charOutOfRange = isCharCountOutOfRange(content, charCount);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...article,
        content,
        validation,
        washingApplied: true,
        washingTone: tone,
        preWashContent: article.preWashContent ?? article.content,
        preWashValidation: article.preWashValidation ?? article.validation,
        preWashGeo: article.preWashGeo ?? article.geo,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "워싱 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
