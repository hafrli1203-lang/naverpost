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
