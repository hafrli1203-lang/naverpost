/**
 * AI 상투어 결정론적 치환 (워싱 보강)
 *
 * contentSignalAnalyzer가 "약한 AI 상투어"(AI_CLICHE_PATTERNS)로 검출하지만 강제
 * 재작성은 하지 않는 표현 중, 문법·톤을 깨지 않고 1:1로 안전하게 사람 말투로 바꿀 수
 * 있는 것만 결정론적으로 치환한다.
 *
 * 설계 원칙(무회귀):
 *  - 문장 끝을 깨거나 의미가 달라질 위험이 있는 구조형 패턴("기준이 됩니다",
 *    "유효한 정보입니다", "논의로 이어집니다" 등)은 손대지 않고 LLM 워싱에 맡긴다.
 *  - 어미 레지스터(해요체/합니다체)를 바꾸지 않도록 같은 레지스터 또는 명사/부사형으로만
 *    치환한다.
 *  - 매장 안내 블록의 사실 정보(주소·시간 등)에는 이 표현들이 나타나지 않으므로 전체
 *    본문에 적용해도 안전하다.
 */

type ClicheReplacement = {
  pattern: RegExp;
  replacement: string;
};

// 안전한 1:1 치환만 등록한다. (위험한 구조형 상투어는 의도적으로 제외)
const AI_CLICHE_REPLACEMENTS: ClicheReplacement[] = [
  // 부사·명사형 (톤 중립 — 가장 안전)
  { pattern: /차근차근/g, replacement: "하나씩" },
  { pattern: /꼭 알아야 할/g, replacement: "알아두면 좋은" },
  { pattern: /이번 글에서는/g, replacement: "오늘은" },
  { pattern: /원인 후보/g, replacement: "원인" },
  { pattern: /확인 순서/g, replacement: "확인 방법" },
  { pattern: /판별 축/g, replacement: "판단 기준" },

  // 해요체 유지
  { pattern: /살펴볼게요/g, replacement: "짚어볼게요" },
  { pattern: /정리해봤어요/g, replacement: "정리했어요" },
  { pattern: /도움이 돼요/g, replacement: "도움이 될 수 있어요" },
  { pattern: /보탬이 될 거예요/g, replacement: "도움이 될 수 있어요" },

  // 합니다체 유지 (AI 티 나는 '~겠습니다'만 제거)
  { pattern: /풀어드리겠습니다/g, replacement: "풀어드립니다" },
];

export type ClicheSanitizeReport = {
  content: string;
  totalReplacements: number;
  examples: Array<{ from: string; to: string }>;
};

/**
 * 본문에서 안전하게 치환 가능한 약한 AI 상투어를 사람 말투로 결정론적 교체한다.
 */
export function sanitizeAiCliches(content: string): ClicheSanitizeReport {
  let next = content;
  let total = 0;
  const examples: Array<{ from: string; to: string }> = [];

  for (const rule of AI_CLICHE_REPLACEMENTS) {
    let firstMatch: { from: string; to: string } | undefined;
    next = next.replace(rule.pattern, (matched) => {
      total += 1;
      if (!firstMatch) firstMatch = { from: matched, to: rule.replacement };
      return rule.replacement;
    });
    if (firstMatch && examples.length < 8) {
      examples.push(firstMatch);
    }
  }

  return { content: next, totalReplacements: total, examples };
}
