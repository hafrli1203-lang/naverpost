import type { KeywordOption, KeywordValidationResult } from "@/types";

/**
 * Validates a keyword option against the 7 rules from the spec.
 *
 * Rules:
 * 1. All keywords must be exactly 2-word combinations
 * 2. Main keyword's first word must appear in both sub keywords
 * 3. Main keyword must appear verbatim in the title
 * 4. Both sub keywords' meanings must be reflected in the title
 * 5. Title length must be 15-30 characters
 * 6. Title must not overlap with forbiddenList
 * 7. Title must not share same perspective as referenceList
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

  // Rule 4: Both sub keywords' meanings must be reflected in the title
  // Check by verifying each word of sub keywords appears in the title
  const sub1FirstWord = sub1Words[0] ?? "";
  const sub1SecondWord = sub1Words[1] ?? "";
  const sub2FirstWord = sub2Words[0] ?? "";
  const sub2SecondWord = sub2Words[1] ?? "";

  const sub1Reflected =
    title.includes(subKeyword1) ||
    (title.includes(sub1FirstWord) && title.includes(sub1SecondWord));
  const sub2Reflected =
    title.includes(subKeyword2) ||
    (title.includes(sub2FirstWord) && title.includes(sub2SecondWord));

  if (!sub1Reflected) {
    failures.push({
      rule: "rule4",
      reason: `서브 키워드1 "${subKeyword1}"의 의미가 제목에 드러나야 합니다`,
    });
  }
  if (!sub2Reflected) {
    failures.push({
      rule: "rule4",
      reason: `서브 키워드2 "${subKeyword2}"의 의미가 제목에 드러나야 합니다`,
    });
  }

  // Rule 5: Title length must be 15-25 characters
  const titleLength = title.length;
  if (titleLength < 15 || titleLength > 25) {
    failures.push({
      rule: "rule5",
      reason: `제목 길이는 15~25자이어야 합니다 (현재 ${titleLength}자): "${title}"`,
    });
  }

  // Rule 6: Title must not overlap with forbiddenList (same topic = same store)
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

  // Rule 7: Title must not share same perspective as referenceList
  // Check if main keyword appears in reference titles (same keyword = same perspective risk)
  const duplicatePerspective = referenceList.some((refTitle) => {
    if (!refTitle) return false;
    // Same main keyword in another store's title implies same perspective
    return refTitle.includes(mainKeyword);
  });
  if (duplicatePerspective) {
    failures.push({
      rule: "rule7",
      reason: `메인 키워드 "${mainKeyword}"는 다른 매장의 글과 관점이 겹칩니다 (참고 목록 확인 필요)`,
    });
  }

  return {
    isValid: failures.length === 0,
    failures,
  };
}
