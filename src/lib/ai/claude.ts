import type { KeywordOption } from "@/types";
import { runClaude } from "./cli/claudeCli";

const ARTICLE_MODEL = "claude-opus-4-7";
const EDIT_MODEL = "claude-sonnet-4-6";
const PROMPT_MODEL = "claude-sonnet-4-6";
const GEO_MODEL = "claude-sonnet-4-6";

export async function generateKeywords(prompt: string): Promise<KeywordOption[]> {
  const text = await runClaude({ prompt, model: EDIT_MODEL });

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();

  const parsed = JSON.parse(jsonText);
  const rawResults = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(rawResults)) {
    throw new Error("Keyword generation returned an unexpected response shape.");
  }

  return rawResults.map((result: Record<string, string>) => ({
    title: result.title,
    mainKeyword: result.mainKeyword || result.main_keyword || "",
    subKeyword1: result.subKeyword1 || result.sub_keyword_1 || "",
    subKeyword2: result.subKeyword2 || result.sub_keyword_2 || "",
  }));
}

export async function writeArticle(prompt: string): Promise<string> {
  return runClaude({ prompt, model: ARTICLE_MODEL });
}

export async function reviseArticle(prompt: string): Promise<string> {
  return runClaude({ prompt, model: EDIT_MODEL });
}

export async function rewriteArticleForGeo(
  prompt: string,
  timeoutMs = 180_000
): Promise<string> {
  return runClaude({ prompt, model: GEO_MODEL, timeoutMs });
}

export async function generateImagePrompts(prompt: string): Promise<string> {
  return runClaude({ prompt, model: PROMPT_MODEL });
}
