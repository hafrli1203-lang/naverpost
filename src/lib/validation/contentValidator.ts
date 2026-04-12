import type { ValidationResult } from "@/types";
import { PROHIBITED_WORDS, CAUTION_PHRASES } from "./prohibitedWords";
import { findOverusedWords } from "./repetitionCheck";
import { analyzeMorphology } from "./morphologyAnalyzer";
import { analyzeLanguageRisk } from "./contentSignalAnalyzer";
import { analyzeTitleBodyAlignment } from "./titleBodyAlignment";
import { analyzeNetworkDuplicateRisk } from "./networkDuplicateAnalyzer";

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
  keywords?: {
    title?: string;
    mainKeyword: string;
    subKeyword1: string;
    subKeyword2: string;
    forbiddenList?: string[];
    referenceList?: string[];
  }
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

  const keywordCandidates = keywords
    ? [keywords.mainKeyword, keywords.subKeyword1, keywords.subKeyword2].filter(Boolean)
    : [];
  const title = keywords?.title ?? keywords?.mainKeyword ?? "";
  const morphology = analyzeMorphology({
    title,
    content,
    keywords: keywordCandidates,
  });
  const languageRisk = analyzeLanguageRisk(content);
  const structure = analyzeTitleBodyAlignment({
    title,
    content,
    keywords: keywordCandidates,
  });
  const duplicateRisk = keywords
    ? analyzeNetworkDuplicateRisk({
        option: {
          title,
          mainKeyword: keywords.mainKeyword,
          subKeyword1: keywords.subKeyword1,
          subKeyword2: keywords.subKeyword2,
        },
        forbiddenList: keywords.forbiddenList ?? [],
        referenceList: keywords.referenceList ?? [],
      })
    : {
        titlePatternOverlap: [],
        keywordCombinationOverlap: [],
        sectionOrderOverlap: [],
        tableStructureOverlap: [],
        expressionOverlap: [],
        conclusionOverlap: [],
        informationOrderOverlap: [],
        issues: [],
      };

  const needsRevision =
    foundProhibited.length > 0 ||
    foundCaution.length > 0 ||
    overusedWords.length > 0 ||
    !hasTable ||
    missingKeywords.length > 0 ||
    languageRisk.profanity.length > 0 ||
    languageRisk.abuse.length > 0 ||
    languageRisk.adult.length > 0 ||
    structure.missingTitleKeywordCoverage.length > 0;

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
  if (morphology.missingTitleMorphemesInBody.length > 0) {
    revisionReasons.push(
      `제목 형태소 활성화 부족: ${morphology.missingTitleMorphemesInBody.join(", ")}`
    );
  }
  if (languageRisk.profanity.length > 0) {
    revisionReasons.push(`비속어 검출: ${languageRisk.profanity.join(", ")}`);
  }
  if (languageRisk.abuse.length > 0) {
    revisionReasons.push(`비하 표현 검출: ${languageRisk.abuse.join(", ")}`);
  }
  if (languageRisk.adult.length > 0) {
    revisionReasons.push(`민감 표현 검출: ${languageRisk.adult.join(", ")}`);
  }
  if (languageRisk.commercial.length > 0) {
    revisionReasons.push(`상업어 사용: ${languageRisk.commercial.join(", ")}`);
  }
  if (languageRisk.emphasis.length > 0) {
    revisionReasons.push(`강조어 사용: ${languageRisk.emphasis.join(", ")}`);
  }
  if (structure.missingTitleKeywordCoverage.length > 0) {
    revisionReasons.push(
      `제목-본문 일치 보강 필요: ${structure.missingTitleKeywordCoverage.join(", ")}`
    );
  }
  if (duplicateRisk.titlePatternOverlap.length > 0) {
    revisionReasons.push(
      `제목 패턴 중복 위험: ${duplicateRisk.titlePatternOverlap.slice(0, 2).join(", ")}`
    );
  }
  if (duplicateRisk.keywordCombinationOverlap.length > 0) {
    revisionReasons.push(
      `키워드 조합 중복 위험: ${duplicateRisk.keywordCombinationOverlap
        .slice(0, 2)
        .join(", ")}`
    );
  }

  return {
    needsRevision,
    prohibitedWords: foundProhibited,
    cautionPhrases: foundCaution,
    overusedWords,
    missingKeywords,
    hasTable,
    revisionReasons,
    morphology,
    languageRisk,
    structure,
    duplicateRisk,
    issues: [
      ...morphology.issues,
      ...languageRisk.issues,
      ...structure.issues,
      ...duplicateRisk.issues,
    ],
  };
}
