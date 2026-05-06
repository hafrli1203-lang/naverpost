import type { KeywordOption, KeywordValidationResult } from "@/types";
import { CAUTION_PHRASES, PROHIBITED_WORDS } from "./prohibitedWords";

const TITLE_EXTRA_PROHIBITED_WORDS = [
  "꼭",
  "필독",
  "후회",
  "비용",
  "가격",
  "추천",
  "후기",
  "상담",
  "문의",
  "예약",
  "할인",
  "무료",
];

function findProhibitedTitleTerms(option: KeywordOption): string[] {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  const terms = [
    ...PROHIBITED_WORDS,
    ...CAUTION_PHRASES,
    ...TITLE_EXTRA_PROHIBITED_WORDS,
  ];

  return Array.from(new Set(terms.filter((term) => source.includes(term))));
}

/**
 * Validates a keyword option against the 7 rules from the spec.
 *
 * Rules:
 * 1. All keywords must be exactly 2-word combinations
 * 2. Main keyword's first word must appear in both sub keywords
 * 3. Main keyword must appear verbatim in the title
 * 4. Sub keywords are body expansion hints. At least one sub-keyword core
 *    should be visible in the title; forcing both makes titles read like
 *    keyword lists.
 * 5. Title length must be 15-30 characters
 * 6. Title must not overlap with forbiddenList
 * 7. Cross-store perspective overlap is handled by networkDuplicateAnalyzer.
 */
export function validateKeywordOption(
  option: KeywordOption,
  forbiddenList: string[],
  referenceList: string[]
): KeywordValidationResult {
  const failures: { rule: string; reason: string }[] = [];

  const { title, mainKeyword, subKeyword1, subKeyword2 } = option;

  // Rule 1: All keywords must be exactly 2-word combinations
  const mainWords = mainKeyword.trim().split(/\s+/);
  const sub1Words = subKeyword1.trim().split(/\s+/);
  const sub2Words = subKeyword2.trim().split(/\s+/);

  if (mainWords.length !== 2) {
    failures.push({
      rule: "rule1",
      reason: `메인 키워드 "${mainKeyword}"는 정확히 2단어 조합이어야 합니다 (현재 ${mainWords.length}단어)`,
    });
  }
  if (sub1Words.length !== 2) {
    failures.push({
      rule: "rule1",
      reason: `서브 키워드1 "${subKeyword1}"는 정확히 2단어 조합이어야 합니다 (현재 ${sub1Words.length}단어)`,
    });
  }
  if (sub2Words.length !== 2) {
    failures.push({
      rule: "rule1",
      reason: `서브 키워드2 "${subKeyword2}"는 정확히 2단어 조합이어야 합니다 (현재 ${sub2Words.length}단어)`,
    });
  }

  // Rule 2: Main keyword's first word must appear in both sub keywords
  if (mainWords.length >= 1) {
    const mainFirstWord = mainWords[0];
    if (!subKeyword1.includes(mainFirstWord)) {
      failures.push({
        rule: "rule2",
        reason: `서브 키워드1 "${subKeyword1}"에 메인 키워드의 첫 단어 "${mainFirstWord}"가 포함되어야 합니다`,
      });
    }
    if (!subKeyword2.includes(mainFirstWord)) {
      failures.push({
        rule: "rule2",
        reason: `서브 키워드2 "${subKeyword2}"에 메인 키워드의 첫 단어 "${mainFirstWord}"가 포함되어야 합니다`,
      });
    }
  }

  // Rule 3: Main keyword must appear verbatim in the title
  if (!title.includes(mainKeyword)) {
    failures.push({
      rule: "rule3",
      reason: `제목에 메인 키워드 "${mainKeyword}"가 원형 그대로 포함되어야 합니다`,
    });
  }

  // Rule 4: Sub keywords guide body expansion. The title should expose at
  // least one core subtopic, while the second subtopic can be expanded in the
  // body. Requiring both cores caused mechanical titles such as "A B와 C 확인".
  const sub1Core = sub1Words[1];
  const sub2Core = sub2Words[1];
  const hasSub1Core = Boolean(sub1Core && (title.includes(sub1Core) || title.includes(subKeyword1)));
  const hasSub2Core = Boolean(sub2Core && (title.includes(sub2Core) || title.includes(subKeyword2)));
  if (sub1Core && sub2Core && !hasSub1Core && !hasSub2Core) {
    failures.push({
      rule: "rule4",
      reason: `제목에서 서브 키워드 "${subKeyword1}" 또는 "${subKeyword2}" 중 하나의 의미는 확인되어야 합니다`,
    });
  }

  // Rule 5: Title length must be 15-30 characters
  const titleLength = title.length;
  if (titleLength < 15 || titleLength > 30) {
    failures.push({
      rule: "rule5",
      reason: `제목 길이는 15~30자이어야 합니다 (현재 ${titleLength}자): "${title}"`,
    });
  }

  const prohibitedTerms = findProhibitedTitleTerms(option);
  if (prohibitedTerms.length > 0) {
    failures.push({
      rule: "rule8",
      reason: `제목/키워드에 금칙어가 포함되어 사용할 수 없습니다: ${prohibitedTerms.join(", ")}`,
    });
  }

  // Rule 6: Same-store duplicate protection. The target blog must not reuse the
  // same title or the same main keyword/material from its own history.
  const titleNormalized = title.replace(/\s/g, "");
  for (const forbidden of forbiddenList) {
    const forbiddenNormalized = forbidden.replace(/\s/g, "");
    if (
      forbiddenNormalized.length > 0 &&
      titleNormalized === forbiddenNormalized
    ) {
      failures.push({
        rule: "rule6",
        reason: `제목 "${title}"이 이미 발행된 글 제목과 중복됩니다`,
      });
      break;
    }
  }
  const sameStoreMainKeyword = forbiddenList.some((forbidden) => forbidden.includes(mainKeyword));
  if (sameStoreMainKeyword) {
    failures.push({
      rule: "rule6",
      reason: `같은 매장 기존 글에 메인 키워드 "${mainKeyword}"가 이미 사용되었습니다`,
    });
  }

  void referenceList;

  return {
    isValid: failures.length === 0,
    failures,
  };
}
