import Anthropic from "@anthropic-ai/sdk";
import type { KeywordOption } from "@/types";

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

const MODEL = "claude-opus-4-6";

export async function generateKeywords(
  prompt: string
): Promise<KeywordOption[]> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip markdown code fences if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ;
  const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();

  const parsed = JSON.parse(jsonText);
  // Claude returns { results: [...] } format per titlePrompt spec
  const rawResults = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(rawResults)) {
    throw new Error("키워드 생성 응답 형식이 올바르지 않습니다.");
  }
  // Map snake_case JSON keys to camelCase TypeScript fields
  return rawResults.map((r: Record<string, string>) => ({
    title: r.title,
    mainKeyword: r.mainKeyword || r.main_keyword || "",
    subKeyword1: r.subKeyword1 || r.sub_keyword_1 || "",
    subKeyword2: r.subKeyword2 || r.sub_keyword_2 || "",
  }));
}

export async function writeArticle(prompt: string): Promise<string> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}

export async function reviseArticle(prompt: string): Promise<string> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}

export async function generateImagePrompts(prompt: string): Promise<string> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
