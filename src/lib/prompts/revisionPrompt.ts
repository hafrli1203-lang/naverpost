import type { ValidationResult } from "@/types";

export function buildRevisionPrompt(params: {
  originalContent: string;
  validation: ValidationResult;
}): string {
  const { originalContent, validation } = params;

  const problemLines: string[] = [];

  if (validation.prohibitedWords.length > 0) {
    problemLines.push(
      `- 금지어 제거 필요: ${validation.prohibitedWords.join(", ")} — 이 단어들을 완전히 삭제하거나 아래 대체어 변환표를 참고하여 교체하세요.`
    );
  }

  if (validation.cautionPhrases.length > 0) {
    problemLines.push(
      `- 주의 표현 수정 필요: ${validation.cautionPhrases.join(", ")} — 이 표현들을 더 중립적인 표현으로 바꾸세요.`
    );
  }

  if (validation.overusedWords.length > 0) {
    const overusedStr = validation.overusedWords
      .map((w) => `"${w.word}"(${w.count}회)`)
      .join(", ");
    problemLines.push(
      `- 과다 반복 단어 줄이기: ${overusedStr} — 각각 15회 미만으로 줄이고 동의어로 교체하세요.`
    );
  }

  return `당신은 광고법을 준수하는 블로그 에디터입니다.
아래 글에서 발견된 문제를 수정해주세요.

[발견된 문제]
${problemLines.join("\n")}

[금지어 → 대체어 변환표]

의료/과장 표현:
- 가장/최고/최상/제일 → 돋보이는 / 우수한 / 뛰어난 / 인기 있는
- 최초/유일 → 차별화된 / 특별한
- 완벽/확실/정확 → 꼼꼼한 / 세심한 / 정밀한 / 만족스러운
- 보장/약속 → 기대할 수 있는 / 도움이 될 수 있는
- 100%/0% → 많은 분들이 / 대부분
- 전문가 → 경험 많은 안경사 / 숙련된 안경사 / 베테랑 안경사
- 추천 → 안내 / 소개 / 제안
- 상담 → 문의 / 방문 / 확인 / 이야기
- 효과/효능 → 도움 / 변화 / 장점
- 치료/시술 → 관리 / 케어 / 서비스
- 안전한 → 편안한 / 부담 없는
- 즉시/바로 → 빠르게 / 신속하게

마케팅 표현:
- 무료/공짜 → 추가 비용 없이 / 서비스로 제공
- 최저가 → 합리적인 가격 / 부담 없는 가격
- 할인 → 혜택 / 특별 가격
- 이벤트 → 기회 / 프로모션
- 강추/대박 → 만족도 높은 / 호평받는

의료 표현:
- 해결됩니다 → 도움을 줄 수 있어요
- 없어집니다 → 개선될 수 있답니다

[수정 규칙]
1. 위 변환표를 참고해서 금지어를 자연스럽게 대체
2. 20회 이상 반복된 단어는 동의어로 분산 (예: 안경 → 아이웨어 / 렌즈 / 착용)
3. 글 길이 2000자 내외 유지
4. 자연스러운 문장 흐름 유지
5. 숫자 나열(1. 2. 3.) 대신 문장으로 풀어서 작성
6. 쉼표(,) 사용 금지 — 접속사와 연결 어미로 이어지게 작성

[원본 글]
${originalContent}

위 규칙에 맞게 전체 글을 자연스럽게 다시 작성해주세요.
제목 제외 본문만 출력하세요.`;
}
