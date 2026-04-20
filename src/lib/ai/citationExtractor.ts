import type { ResearchCitationEntry } from "@/types";

const INSTITUTION_PATTERNS: RegExp[] = [
  /(한국[가-힣A-Za-z]{1,10}(?:소비자원|보호원|연구원|연구소|공단|재단|학회|협회|진흥원))/g,
  /(대한[가-힣A-Za-z]{1,10}(?:협회|학회|의사협회|재단|연구회))/g,
  /(식약처|식품의약품안전처|보건복지부|통계청|공정거래위원회|국민건강보험|질병관리청|국토교통부|과학기술정보통신부|건강보험심사평가원)/g,
  /([가-힣A-Za-z]{2,10}(?:협회|연구소|공단|학회|재단|진흥원))/g,
  /([가-힣A-Za-z]{2,12}렌즈\s*기술\s*자료)/g,
  /([가-힣A-Za-z]{2,12}(?:안광학|광학|광기술)\s*(?:연구|저널|논문|보고서))/g,
];

const YEAR_PATTERN = /(19|20)\d{2}년/;
const NUMERIC_FACT_PATTERN = /\d+(?:\.\d+)?\s*(?:%|°C|℃|mm|nm|μm|dB|시간|분|초|개월|주|일|년|회|건|명|가지|배|도)/;

function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 10 && line.length <= 280);
}

function findInstitution(sentence: string): string | null {
  for (const pattern of INSTITUTION_PATTERNS) {
    const matches = Array.from(sentence.matchAll(pattern));
    if (matches.length > 0 && matches[0][1]) {
      return matches[0][1].trim();
    }
  }
  return null;
}

function extractYear(sentence: string): string | undefined {
  const match = sentence.match(YEAR_PATTERN);
  return match ? match[0] : undefined;
}

function cleanFact(sentence: string): string {
  return sentence
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCitationsFromContent(content: string): ResearchCitationEntry[] {
  const sentences = splitSentences(content);
  const collected = new Map<string, ResearchCitationEntry>();

  for (const sentence of sentences) {
    if (!NUMERIC_FACT_PATTERN.test(sentence)) continue;

    const institution = findInstitution(sentence);
    if (!institution) continue;
    if (collected.has(institution)) continue;

    const year = extractYear(sentence);
    const fact = cleanFact(sentence);
    if (fact.length < 15) continue;

    collected.set(institution, { institution, year, fact });
    if (collected.size >= 6) break;
  }

  return Array.from(collected.values());
}

export function mergeCitations(
  primary: ResearchCitationEntry[],
  secondary: ResearchCitationEntry[]
): ResearchCitationEntry[] {
  const seen = new Set<string>();
  const merged: ResearchCitationEntry[] = [];

  for (const entry of [...primary, ...secondary]) {
    const key = entry.institution.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
    if (merged.length >= 6) break;
  }

  return merged;
}
