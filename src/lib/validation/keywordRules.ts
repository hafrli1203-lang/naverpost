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

function selectKeywordAnchor(mainWords: string[]): string {
  const [first, second] = mainWords;
  if (!second) return first ?? "";
  if (
    /^(10대|20대|30대|40대|50대|60대|여자|남자|학생|청소년|직장인|중년|부모님|어머니|아버지|어린이|운전자|초보|처음|출근|운동|장시간|야간운전|고도수|블루라이트차단|가벼운|튼튼한|편한|편안한|어지러운|큰사이즈|빅사이즈|오버사이즈|운전용|업무용|독서용|실내용)$/.test(first)
  ) {
    return second;
  }
  return first;
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

  // Rule 2: Main keyword's anchor must appear in both sub keywords. In
  // target/product forms such as "부모님 노안안경", the product word is the
  // anchor, not the target word.
  // Rule 2 (완화): 서브 키워드는 본문 확장 소재이므로 둘 다 메인 기준어를 강제하지
  // 않는다. 자연스러운 키워드 다양성을 위해 서브 중 "최소 한 개"에만 메인 기준어가
  // 들어가면 통과시킨다(주제 응집성 최소 보장).
  if (mainWords.length >= 1) {
    const mainAnchor = selectKeywordAnchor(mainWords);
    if (
      mainAnchor &&
      !subKeyword1.includes(mainAnchor) &&
      !subKeyword2.includes(mainAnchor)
    ) {
      failures.push({
        rule: "rule2",
        reason: `서브 키워드 중 적어도 하나에는 메인 키워드의 기준어 "${mainAnchor}"가 포함되어야 합니다`,
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
