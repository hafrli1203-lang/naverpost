/**
 * 리서치 표류(drift) 감지 — 순수 함수.
 *
 * 배경: Perplexity 조사 단계는 "실제 안경 물리현상만 조사" 가드 때문에
 * 가격·비교·가치처럼 물리현상이 아닌 키워드에서 엉뚱한 안경 주제(예: 렌즈 세척)로
 * 디폴트한다. 그 자료를 본문 프롬프트가 "조사자료 기반"으로 따라 쓰면 제목/키워드와
 * 무관한 글이 생성된다. 이 모듈은 조사 결과가 제목/키워드와 맞는지 판정해,
 * 라우트가 표류한 자료를 버리고 제목 논지 기반으로 작성하도록 돕는다.
 */

// 도메인 전반에 흔해 변별력이 없는 토큰(이게 겹쳐도 "주제가 맞다"고 볼 수 없음).
const GENERIC_TOKENS = new Set([
  "안경",
  "안경테",
  "렌즈",
  "안경렌즈",
  "콘택트",
  "콘택트렌즈",
  "눈",
  "시력",
  "제품",
  "관리",
]);

/**
 * 제목/키워드에서 변별력 있는 토큰만 추출한다(2자 이상, 도메인 일반어 제외).
 */
export function extractDistinctiveTokens(
  ...keywords: Array<string | undefined>
): string[] {
  const tokens = new Set<string>();
  for (const keyword of keywords) {
    if (!keyword) continue;
    for (const part of keyword.split(/\s+/)) {
      const token = part.trim();
      if (token.length >= 2 && !GENERIC_TOKENS.has(token)) {
        tokens.add(token);
      }
    }
  }
  return [...tokens];
}

/**
 * 조사 자료가 제목/키워드 주제와 맞는지 판정한다.
 * - 자료가 비었거나 너무 짧으면 판단 보류 → true(기존 동작 유지).
 * - 변별 토큰이 하나도 없으면(전부 일반어) 판단 불가 → true(과잉 폐기 방지).
 * - 변별 토큰 중 하나라도 자료에 등장하면 on-topic으로 본다(보수적: 오폐기 최소화).
 */
export function isResearchOnTopic(
  researchData: string | undefined,
  keywords: {
    title?: string;
    mainKeyword: string;
    subKeyword1?: string;
    subKeyword2?: string;
  }
): boolean {
  const data = (researchData ?? "").trim();
  if (data.length < 40) return true;

  const distinctive = extractDistinctiveTokens(
    keywords.title,
    keywords.mainKeyword,
    keywords.subKeyword1,
    keywords.subKeyword2
  );
  if (distinctive.length === 0) return true;

  return distinctive.some((token) => data.includes(token));
}

/**
 * 표류한 조사 자료를 대체할 안내문. 본문 작성기가 제목 논지에 충실하게,
 * 다만 구체 수치·연구는 지어내지 않도록 가드한다.
 */
export const OFF_TOPIC_RESEARCH_NOTE =
  "[조사 자료 없음 — 이 주제는 외부 조사가 주제와 맞지 않아 제외되었습니다]\n" +
  "제목과 논지에 충실하게 작성하세요. 일반적으로 알려진 사실 범위에서 쓰되, " +
  "구체적 수치·통계·연구 결과·기관명은 지어내지 마세요.";
