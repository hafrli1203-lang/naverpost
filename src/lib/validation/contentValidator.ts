import type { ValidationResult } from "@/types";
import { PROHIBITED_WORDS, CAUTION_PHRASES } from "./prohibitedWords";
import { findOverusedWords } from "./repetitionCheck";

/**
 * Validates blog article content against:
 * - Prohibited words list
 * - Caution phrases list
 * - Repetition check (words appearing >= 20 times)
 */
export function validateContent(content: string): ValidationResult {
  const foundProhibited = PROHIBITED_WORDS.filter((word) =>
    content.includes(word)
  );

  const foundCaution = CAUTION_PHRASES.filter((phrase) =>
    content.includes(phrase)
  );

  const overusedWords = findOverusedWords(content);

  const needsRevision =
    foundProhibited.length > 0 ||
    foundCaution.length > 0 ||
    overusedWords.length > 0;

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

  return {
    needsRevision,
    prohibitedWords: foundProhibited,
    cautionPhrases: foundCaution,
    overusedWords,
    revisionReasons,
  };
}
