import fs from "fs/promises";
import path from "path";
import { z } from "zod";

/**
 * Optical-industry glossary for disambiguating keywords that the open web reads
 * differently from the eyewear shop floor (e.g. "멀티포컬" = contact lens, not a
 * progressive spectacle lens). Entries are user-editable in data/opticalGlossary.json.
 */

const GLOSSARY_FILE = path.join(process.cwd(), "data", "opticalGlossary.json");

const glossaryEntrySchema = z.object({
  term: z.string().min(1),
  category: z.string().optional(),
  means: z.string().min(1),
  notMeans: z.string().optional(),
});

const glossarySchema = z.array(glossaryEntrySchema);

export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

export async function getGlossary(): Promise<GlossaryEntry[]> {
  try {
    const raw = await fs.readFile(GLOSSARY_FILE, "utf-8");
    const parsed = glossarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/**
 * Returns glossary entries whose term appears in any of the given keyword strings.
 * Matching is whitespace-insensitive substring matching so "기능성렌즈 추천" still
 * matches the "기능성렌즈" entry.
 */
export async function lookupGlossary(keywords: string[]): Promise<GlossaryEntry[]> {
  const entries = await getGlossary();
  if (entries.length === 0) return [];

  const haystack = keywords.filter(Boolean).map(normalize);
  const matched: GlossaryEntry[] = [];
  for (const entry of entries) {
    const needle = normalize(entry.term);
    if (haystack.some((k) => k.includes(needle))) {
      matched.push(entry);
    }
  }
  return matched;
}

/**
 * Builds a human-readable disambiguation hint block for prompts. Returns an empty
 * string when there is nothing to disambiguate so callers can drop the section.
 */
export function buildGlossaryHint(entries: GlossaryEntry[]): string {
  if (entries.length === 0) return "";
  return entries
    .map((entry) => {
      const categoryPart = entry.category ? ` (${entry.category})` : "";
      const notPart = entry.notMeans ? ` ${entry.notMeans}.` : "";
      return `- "${entry.term}"${categoryPart}: ${entry.means}.${notPart}`;
    })
    .join("\n");
}
