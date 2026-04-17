import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

const MODEL = "claude-haiku-4-5-20251001";

export interface CompetitorNounResult {
  titleNouns: Array<{ noun: string; occurrences: number }>;
  commonNouns: Array<{ noun: string; occurrences: number; blogCount: number }>;
  bodyNouns: Array<{ noun: string; occurrences: number; blogCount: number }>;
  bodyHighlights: string[];
}

export interface CompetitorBlogSample {
  title: string;
  description: string;
  body?: string;
}

export interface ContentNoun {
  noun: string;
  count: number;
}

function extractJsonBlock(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

export async function extractContentNouns(text: string): Promise<ContentNoun[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const prompt = [
    "Extract meaningful Korean nouns from the content below.",
    "Ignore particles, endings, stopwords, brand-only noise, and generic filler words.",
    "Return only JSON in this shape:",
    '{ "nouns": [{ "noun": "example", "count": 5 }] }',
    "",
    trimmed,
  ].join("\n");

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const out = message.content[0].type === "text" ? message.content[0].text : "";
  const parsed = JSON.parse(extractJsonBlock(out)) as { nouns?: unknown };

  if (!Array.isArray(parsed.nouns)) return [];
  return parsed.nouns
    .filter(
      (entry): entry is ContentNoun =>
        typeof (entry as ContentNoun)?.noun === "string" &&
        (entry as ContentNoun).noun.length >= 2 &&
        typeof (entry as ContentNoun)?.count === "number"
    )
    .sort((a, b) => b.count - a.count);
}

export async function generateRelatedKeywords(
  seeds: string[],
  domainHint?: string
): Promise<string[]> {
  const cleanedSeeds = seeds.map((seed) => seed.trim()).filter(Boolean);
  if (cleanedSeeds.length === 0) return [];

  const prompt = [
    "Generate practical related Korean search keywords.",
    "Keep them specific, likely to appear in search refinement, and suitable for blog planning.",
    "Return only JSON in this shape:",
    '{ "keywords": ["keyword 1", "keyword 2"] }',
    domainHint ? `Domain hint: ${domainHint}` : "",
    "Seeds:",
    ...cleanedSeeds.map((seed) => `- ${seed}`),
  ]
    .filter(Boolean)
    .join("\n");

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const out = message.content[0].type === "text" ? message.content[0].text : "";
  const parsed = JSON.parse(extractJsonBlock(out)) as { keywords?: unknown };

  if (!Array.isArray(parsed.keywords)) return [];
  return parsed.keywords
    .filter((item): item is string => typeof item === "string" && item.trim().length >= 2)
    .map((item) => item.trim());
}

export async function extractCompetitorNouns(
  samples: CompetitorBlogSample[]
): Promise<CompetitorNounResult> {
  if (samples.length === 0) {
    return {
      titleNouns: [],
      commonNouns: [],
      bodyNouns: [],
      bodyHighlights: [],
    };
  }

  const serialized = samples
    .map(
      (sample, index) =>
        `${index + 1}. title: ${sample.title}\n` +
        `description: ${sample.description}\n` +
        `body: ${sample.body?.trim() || "(no body sample)"}`
    )
    .join("\n\n");

  const prompt = [
    "Analyze the following top-ranking Korean blog samples for search-driven writing patterns.",
    "Focus on topic nouns and repeated content themes.",
    "Rules:",
    "- titleNouns: nouns that recur in titles.",
    "- commonNouns: nouns recurring across title + description + body, with blogCount >= 2.",
    "- bodyNouns: nouns recurring in body samples, with blogCount >= 2.",
    "- bodyHighlights: 3 to 5 short Korean phrases summarizing repeated body-level angles or discussion points.",
    "- Ignore particles, endings, generic filler, and single-blog noise.",
    "- Return only JSON.",
    'Format: {"titleNouns":[{"noun":"예시","occurrences":5}],"commonNouns":[{"noun":"예시","occurrences":12,"blogCount":7}],"bodyNouns":[{"noun":"예시","occurrences":8,"blogCount":4}],"bodyHighlights":["핵심 논점 1"]}',
    "",
    serialized,
  ].join("\n");

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const out = message.content[0].type === "text" ? message.content[0].text : "";
  const parsed = JSON.parse(extractJsonBlock(out)) as Partial<CompetitorNounResult>;

  const titleNouns = Array.isArray(parsed.titleNouns)
    ? parsed.titleNouns
        .filter(
          (entry) =>
            typeof entry?.noun === "string" &&
            entry.noun.length >= 2 &&
            typeof entry.occurrences === "number"
        )
        .sort((a, b) => b.occurrences - a.occurrences)
    : [];

  const commonNouns = Array.isArray(parsed.commonNouns)
    ? parsed.commonNouns
        .filter(
          (entry) =>
            typeof entry?.noun === "string" &&
            entry.noun.length >= 2 &&
            typeof entry.occurrences === "number" &&
            typeof entry.blogCount === "number" &&
            entry.blogCount >= 2
        )
        .sort((a, b) => b.blogCount - a.blogCount || b.occurrences - a.occurrences)
    : [];

  const bodyNouns = Array.isArray(parsed.bodyNouns)
    ? parsed.bodyNouns
        .filter(
          (entry) =>
            typeof entry?.noun === "string" &&
            entry.noun.length >= 2 &&
            typeof entry.occurrences === "number" &&
            typeof entry.blogCount === "number" &&
            entry.blogCount >= 2
        )
        .sort((a, b) => b.blogCount - a.blogCount || b.occurrences - a.occurrences)
    : [];

  const bodyHighlights = Array.isArray(parsed.bodyHighlights)
    ? parsed.bodyHighlights
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length >= 4)
        .map((entry) => entry.trim())
        .slice(0, 5)
    : [];

  return {
    titleNouns,
    commonNouns,
    bodyNouns,
    bodyHighlights,
  };
}
