import type { ResearchCitationEntry } from "@/types";

const INSTITUTION_PATTERNS: RegExp[] = [
  // {0,10}: 한국/대한 바로 뒤에 접미사가 오는 직접형도 잡는다. {1,10}이면 한국과 접미사
  // 사이 최소 1글자를 요구해 "한국소비자원"·"대한안경사협회"의 직접형을 놓쳤다(실측).
  /(한국[가-힣A-Za-z]{0,10}(?:소비자원|보호원|연구원|연구소|공단|재단|학회|협회|진흥원))/g,
  /(대한[가-힣A-Za-z]{0,10}(?:협회|학회|의사협회|재단|연구회))/g,
  /(식약처|식품의약품안전처|보건복지부|통계청|공정거래위원회|국민건강보험|질병관리청|국토교통부|과학기술정보통신부|건강보험심사평가원)/g,
  /([가-힣A-Za-z]{2,10}(?:협회|연구소|공단|학회|재단|진흥원))/g,
  /([가-힣A-Za-z]{2,12}렌즈\s*기술\s*자료)/g,
  /([가-힣A-Za-z]{2,12}(?:안광학|광학|광기술)\s*(?:연구|저널|논문|보고서))/g,
  // 제조사 자료: Perplexity 프롬프트가 3차 출처로 권장하지만(자이스/에실로 등) 위 패턴이
  // "렌즈" 없는 제조사명을 못 잡아 본문이 제조사를 인용해도 신호가 0으로 누락됐다.
  // 브랜드 뒤에 자료유형 접미사를 요구해 제품명 오탐(예: "아큐브 30개입")을 막는다.
  /((?:칼\s*자이스|자이스|에실로|호야|니콘|로덴스탁|케미렌즈|케미|아큐브|바슈롬|쿠퍼비전|알콘|시바비전)\s*(?:기술\s*자료|백서|연구\s*자료|리포트|자료에\s*따르면))/g,
  // 국제 표준 문서(ISO/ANSI). 수치 사실(NUMERIC_FACT_PATTERN)이 같은 문장에 있을 때만 surface된다.
  /(ISO\s*\d{3,5}(?:-\d+)?|ANSI\s*[A-Z]?\d{2,4}(?:\.\d+)?)/g,
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
