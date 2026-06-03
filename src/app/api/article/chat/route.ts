import { NextRequest, NextResponse } from "next/server";
import { reviseArticle } from "@/lib/ai/claude";
import { buildChatRevisionPrompt } from "@/lib/prompts/chatRevisionPrompt";
import { validateContent } from "@/lib/validation/contentValidator";
import { lookupGlossary, buildGlossaryHint } from "@/lib/domain/opticalGlossary";
import type { ArticleContent, ChatMessage } from "@/types";

export const maxDuration = 300;

const CHAT_REVISION_TIMEOUT_MS = 150_000;

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

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const role = record.role === "assistant" ? "assistant" : "user";
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (content) messages.push({ role, content });
  }
  return messages;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      article?: ArticleContent;
      messages?: unknown;
      charCount?: number;
    };

    const article = body.article;
    if (!article?.content || !article.mainKeyword) {
      return NextResponse.json(
        { success: false, error: "수정할 본문과 키워드 정보가 필요합니다." },
        { status: 400 }
      );
    }

    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return NextResponse.json(
        { success: false, error: "마지막에 사용자 지시가 있어야 합니다." },
        { status: 400 }
      );
    }

    const charCount = body.charCount ?? article.content.length ?? 2000;

    const glossaryEntries = await lookupGlossary([
      article.mainKeyword,
      article.subKeyword1,
      article.subKeyword2,
      article.title,
    ]);
    const glossaryHint = buildGlossaryHint(glossaryEntries);

    const prompt = buildChatRevisionPrompt({
      currentContent: article.content,
      mainKeyword: article.mainKeyword,
      subKeyword1: article.subKeyword1,
      subKeyword2: article.subKeyword2,
      categoryName: article.category,
      glossaryHint,
      messages,
      charCount,
      tone: article.washingTone,
    });

    let revisedRaw: string;
    try {
      revisedRaw = await reviseArticle(prompt, CHAT_REVISION_TIMEOUT_MS);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "재수정 중 오류가 발생했습니다.";
      console.error("[api/article/chat] revise failed", { message });
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }

    const content = stripLeadingTitleLine(revisedRaw, article.title);

    const validation = await validateContent(content, {
      title: article.title,
      mainKeyword: article.mainKeyword,
      subKeyword1: article.subKeyword1,
      subKeyword2: article.subKeyword2,
    });

    const assistantNote = "지시하신 내용을 반영해 본문을 다시 작성했어요.";
    const updatedChat: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: assistantNote },
    ];

    const updatedArticle: ArticleContent = {
      ...article,
      content,
      validation,
      revisionChat: updatedChat,
    };

    return NextResponse.json({ success: true, data: updatedArticle });
  } catch (err) {
    const message = err instanceof Error ? err.message : "재수정 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
