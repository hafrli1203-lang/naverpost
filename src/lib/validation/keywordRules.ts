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
 * Validates a keyword option against the rules from the spec.
 *
 * Rules:
 * 1. All keywords must be exactly 2-word combinations
 * 2. (삭제) 서브 키워드의 메인 기준어 반복 요구 — 본문 확장 소재라 다양성 우선
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

  // Rule 2 (삭제): 서브 키워드는 본문 확장 소재이므로 메인 기준어 반복을 요구하지 않는다.
  // 기존 "서브 중 최소 하나에 메인 기준어 포함" 규칙은 grounding으로 다양해진 전문 서브
  // (예: 메인 "아큐브렌즈 산소투과율" + 서브 "렌즈 Dk/t" / "각막 산소공급")를 전부 탈락시키고,
  // 단조로운 "메인+착용감" 반복만 통과시켜 키워드 품질을 떨어뜨렸다. 주제 응집성은 메인 키워드가
  // 제목에 원형 포함(rule3)되는 것으로 충분히 보장되므로 앵커 반복 요구를 제거한다.

  // Rule 3: Main keyword must appear verbatim in the title
  if (!title.includes(mainKeyword)) {
    failures.push({
      rule: "rule3",
      reason: `제목에 메인 키워드 "${mainKeyword}"가 원형 그대로 포함되어야 합니다`,
    });
  }

  // Rule 4 (완화/삭제): 서브 키워드는 본문 확장 소재이며 제목에 억지로 넣지 않는다.
  // 제목에 서브 코어 노출을 강제하면 "메인 + 서브 욱여넣기"식 기계적 제목이 되어
  // 자연스러움을 해친다. 서브 키워드는 본문 단계에서 소제목/단락으로 확장한다.

  // Rule 5 (완화): 지역명은 사용자가 최종 단계에서 직접 붙이므로 생성 제목은 다소
  // 짧을 수 있고, 자연문 제목은 30자를 넘길 수 있다. 검색 노출에서 의미 있는
  // 범위(12~42자)로 완화한다.
  const titleLength = title.length;
  if (titleLength < 12 || titleLength > 42) {
    failures.push({
      rule: "rule5",
      reason: `제목 길이는 12~42자이어야 합니다 (현재 ${titleLength}자): "${title}"`,
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
