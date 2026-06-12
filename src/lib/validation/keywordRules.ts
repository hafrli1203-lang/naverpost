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

// 두 단어 사이에 허용하는 조사. 긴 조사를 앞에 둬야 정규식 alternation이 올바르게 매칭된다.
const TITLE_KEYWORD_JOSA =
  "(?:에서|으로|보다|처럼|까지|부터|은|는|이|가|을|를|과|와|의|도|만|에|로)?";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 제목이 메인 키워드를 "살리고" 있는지 검사한다.
 * 원형 통째 포함뿐 아니라, 두 단어가 순서대로 인접하되 첫 단어 뒤에
 * 자연스러운 조사가 붙은 형태("안경렌즈에 얼룩이 …")도 허용한다.
 * (기존 원형-통째 강제는 키워드 덩어리를 문두에 박은 비문 제목만 통과시키는 원인이었다.)
 */
export function titleContainsMainKeyword(title: string, mainKeyword: string): boolean {
  const trimmed = mainKeyword.trim();
  if (!trimmed) return false;
  if (title.includes(trimmed)) return true;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;

  const pattern = new RegExp(
    words.map(escapeRegExp).join(`${TITLE_KEYWORD_JOSA}\\s*`)
  );
  return pattern.test(title);
}

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

  // Rule 3: Main keyword must appear in the title — verbatim, or with a natural
  // particle between the two words ("안경렌즈에 얼룩이 …"). Both words must stay
  // adjacent and in order so Naver search exposure is preserved.
  if (!titleContainsMainKeyword(title, mainKeyword)) {
    failures.push({
      rule: "rule3",
      reason: `제목에 메인 키워드 "${mainKeyword}"가 순서대로 포함되어야 합니다 (두 단어 사이 조사만 허용)`,
    });
  }

  // Rule 4 (완화/삭제): 서브 키워드는 본문 확장 소재이며 제목에 억지로 넣지 않는다.
  // 제목에 서브 코어 노출을 강제하면 "메인 + 서브 욱여넣기"식 기계적 제목이 되어
  // 자연스러움을 해친다. 서브 키워드는 본문 단계에서 소제목/단락으로 확장한다.

  // Rule 5: 원기준(10~25자 정보 예고) 복원. 지역명은 사용자가 나중에 앞에 붙이므로
  // (+6~8자) 생성 제목이 32자를 넘으면 모바일 노출(~35자)에서 잘린다.
  const titleLength = title.length;
  if (titleLength < 12 || titleLength > 32) {
    failures.push({
      rule: "rule5",
      reason: `제목 길이는 12~32자이어야 합니다 (현재 ${titleLength}자): "${title}"`,
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
