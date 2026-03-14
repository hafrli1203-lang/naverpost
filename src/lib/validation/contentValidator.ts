import type { ValidationResult } from "@/types";
import { PROHIBITED_WORDS, CAUTION_PHRASES } from "./prohibitedWords";
import { findOverusedWords } from "./repetitionCheck";

/**
 * 금지어가 다른 단어의 일부로 사용될 때 오탐을 방지하는 허용 복합어 목록.
 * 예: "가장" 금지 → "가장자리"는 허용
 */
const ALLOWED_COMPOUNDS: Map<string, string[]> = new Map([
  ["가장", ["가장자리"]],
  ["예방", ["예방접종"]],
  ["확실", ["확실하지 않"]],
  ["정확", ["정확하지 않"]],
  ["안전한", ["안전한지"]],
  ["추천", ["추천하지"]],
  ["최대", ["최대한"]],
  ["전문가", ["전문가적"]],
]);

/**
 * 금지어가 실제로 문제가 되는 용법인지 스마트 매칭.
 * 허용 복합어 안에 포함된 경우는 해당 출현을 제외하고 판단.
 */
function isProhibitedWordPresent(content: string, word: string): boolean {
  if (!content.includes(word)) return false;

  const allowedList = ALLOWED_COMPOUNDS.get(word);
  if (!allowedList || allowedList.length === 0) return true;

  // 허용 복합어를 임시로 제거한 뒤 금지어가 여전히 남아있는지 확인
  let cleaned = content;
  for (const allowed of allowedList) {
    cleaned = cleaned.split(allowed).join("□".repeat(allowed.length));
  }
  return cleaned.includes(word);
}

/**
 * Validates blog article content against:
 * - Prohibited words list (with smart compound word filtering)
 * - Caution phrases list
 * - Repetition check (words appearing >= 20 times)
 * - Markdown table presence
 * - Keyword original form inclusion
 */
export function validateContent(
  content: string,
  keywords?: { mainKeyword: string; subKeyword1: string; subKeyword2: string }
): ValidationResult {
  const foundProhibited = PROHIBITED_WORDS.filter((word) =>
    isProhibitedWordPresent(content, word)
  );

  const foundCaution = CAUTION_PHRASES.filter((phrase) =>
    content.includes(phrase)
  );

  const overusedWords = findOverusedWords(content);

  // Check for Markdown table (at least one | --- | pattern)
  const hasTable = /\|[\s]*:?---/.test(content) || /\|.*\|.*\|/.test(content);

  // Check keyword original form inclusion
  const missingKeywords: string[] = [];
  if (keywords) {
    if (keywords.mainKeyword && !content.includes(keywords.mainKeyword)) {
      missingKeywords.push(keywords.mainKeyword);
    }
    if (keywords.subKeyword1 && !content.includes(keywords.subKeyword1)) {
      missingKeywords.push(keywords.subKeyword1);
    }
    if (keywords.subKeyword2 && !content.includes(keywords.subKeyword2)) {
      missingKeywords.push(keywords.subKeyword2);
    }
  }

  const needsRevision =
    foundProhibited.length > 0 ||
    foundCaution.length > 0 ||
    overusedWords.length > 0 ||
    !hasTable ||
    missingKeywords.length > 0;

  const revisionReasons: string[] = [];
  if (foundProhibited.length > 0) {
    revisionReasons.push(`금지어: ${foundProhibited.join(", ")}`);
  }
  if (foundCaution.length > 0) {
    revisionReasons.push(`주의표현: ${foundCaution.join(", ")}`);
  }
  if (overusedWords.length > 0) {
    const overusedStr = overusedWords
      .map((w) => `${w.word}(${w.count}회)`)
      .join(", ");
    revisionReasons.push(`20회이상 반복: ${overusedStr}`);
  }
  if (!hasTable) {
    revisionReasons.push("Markdown 표 누락");
  }
  if (missingKeywords.length > 0) {
    revisionReasons.push(`키워드 원형 누락: ${missingKeywords.join(", ")}`);
  }

  return {
    needsRevision,
    prohibitedWords: foundProhibited,
    cautionPhrases: foundCaution,
    overusedWords,
    missingKeywords,
    hasTable,
    revisionReasons,
  };
}
