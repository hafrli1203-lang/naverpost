import type { KeywordOption } from "@/types";
import { runClaude } from "./cli/claudeCli";
import { runCodex } from "./cli/codexCli";

const ARTICLE_MODEL = "claude-opus-4-8";
const EDIT_MODEL = "claude-opus-4-8";
const PROMPT_MODEL = "claude-opus-4-8";
const CODEX_ARTICLE_MODEL = "gpt-5.5";

export async function generateKeywords(
  prompt: string,
  timeoutMs = 300_000
): Promise<KeywordOption[]> {
  const text = await runClaude({ prompt, model: EDIT_MODEL, timeoutMs });

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

// 최종 제목 후보의 어색한 표현·오타·비문만 다듬는다(키워드는 보존). Opus(EDIT_MODEL) 사용.
export async function reviseKeywordTitles(
  prompt: string,
  timeoutMs = 90_000
): Promise<Array<{ index: number; title: string }>> {
  const text = await runClaude({ prompt, model: EDIT_MODEL, timeoutMs });
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
  const parsed = JSON.parse(jsonText);
  const rawResults = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(rawResults)) {
    throw new Error("Title polish returned an unexpected response shape.");
  }
  return rawResults.map((result: Record<string, unknown>) => ({
    index: Number(result.index),
    title: typeof result.title === "string" ? result.title : "",
  }));
}

export async function writeArticle(prompt: string, timeoutMs = 220_000): Promise<string> {
  return runClaude({ prompt, model: ARTICLE_MODEL, timeoutMs });
}

export async function writeArticleWithCodex(
  prompt: string,
  timeoutMs = 180_000
): Promise<string> {
  return runCodex({
    prompt: `${prompt}

[출력 지시]
- 위 조건을 모두 지켜 네이버 블로그 본문만 작성하세요.
- 제목, JSON, 해설, 코드블록 없이 본문 텍스트만 출력하세요.
- 모델 실패 복구용 작성이므로 문단을 압축하되 검색자가 끝까지 읽을 수 있게 흐름을 유지하세요.`,
    model: CODEX_ARTICLE_MODEL,
    timeoutMs,
  });
}

export async function reviseArticle(prompt: string, timeoutMs = 160_000): Promise<string> {
  return runClaude({ prompt, model: EDIT_MODEL, timeoutMs });
}

export async function generateImagePrompts(prompt: string): Promise<string> {
  return runClaude({ prompt, model: PROMPT_MODEL });
}
