import type { ValidationResult } from "@/types";
import { WORD_REPLACEMENTS } from "@/lib/validation/prohibitedWords";

export function buildRevisionPrompt(params: {
  originalContent: string;
  validation: ValidationResult;
  mainKeyword?: string;
  subKeyword1?: string;
  subKeyword2?: string;
  charCount?: number;
}): string {
  const { originalContent, validation, mainKeyword, subKeyword1, subKeyword2, charCount = 2000 } = params;

  const problemLines: string[] = [];

  // Build explicit per-word replacement instructions for prohibited words
  const prohibitedReplacementLines: string[] = [];
  if (validation.prohibitedWords.length > 0) {
    for (const word of validation.prohibitedWords) {
      const replacements = WORD_REPLACEMENTS.get(word);
      if (replacements && replacements.length > 0) {
        prohibitedReplacementLines.push(
          `  • 금지어 '${word}' → 다음 중 하나로 교체: '${replacements.join("', '")}'`
        );
      } else {
        prohibitedReplacementLines.push(
          `  • 금지어 '${word}' → 삭제하거나 중립적인 표현으로 교체`
        );
      }
    }
    problemLines.push(
      `- 아래 금지어를 반드시 대체어로 교체하세요. 교체하지 않으면 불합격입니다.\n${prohibitedReplacementLines.join("\n")}`
    );
  }

  // Build explicit per-phrase replacement instructions for caution phrases
  const cautionReplacementLines: string[] = [];
  if (validation.cautionPhrases.length > 0) {
    for (const phrase of validation.cautionPhrases) {
      const replacements = WORD_REPLACEMENTS.get(phrase);
      if (replacements && replacements.length > 0) {
        cautionReplacementLines.push(
          `  • 주의 표현 '${phrase}' → 다음 중 하나로 교체: '${replacements.join("', '")}'`
        );
      } else {
        cautionReplacementLines.push(
          `  • 주의 표현 '${phrase}' → 더 중립적인 표현으로 교체`
        );
      }
    }
    problemLines.push(
      `- 아래 주의 표현을 반드시 수정하세요.\n${cautionReplacementLines.join("\n")}`
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

[발견된 문제 — 반드시 모두 수정해야 합니다]
${problemLines.join("\n\n")}

[키워드 보존 — 절대 규칙]
${mainKeyword ? `메인 키워드: "${mainKeyword}" — 반드시 원형 그대로 유지` : ""}
${subKeyword1 ? `서브 키워드1: "${subKeyword1}" — 반드시 원형 그대로 유지` : ""}
${subKeyword2 ? `서브 키워드2: "${subKeyword2}" — 반드시 원형 그대로 유지` : ""}
※ 키워드를 유사어로 바꾸는 것은 절대 금지 (예: "안경렌즈"를 "아이웨어"나 "광학렌즈"로 바꾸지 마세요)
※ 금지어를 교체할 때도 키워드 단어는 건드리지 마세요.

[수정 규칙]
1. 위에 명시된 금지어와 주의 표현을 지정된 대체어로 반드시 교체 (누락 시 불합격)
2. 키워드에 포함된 단어(예: 안경렌즈)는 절대 변경하지 마세요. 반복이 많더라도 키워드는 원형 유지.
3. 글 길이 ${charCount}자 내외 유지
4. 자연스러운 문장 흐름 유지
5. 숫자 나열(1. 2. 3.) 대신 문장으로 풀어서 작성
6. 쉼표(,) 사용 금지 — 접속사와 연결 어미로 이어지게 작성
7. 본문에 Markdown 표가 없으면 반드시 1개 추가하세요.

[원본 글]
${originalContent}

위 규칙에 맞게 전체 글을 자연스럽게 다시 작성해주세요.
제목 제외 본문만 출력하세요.`;
}
