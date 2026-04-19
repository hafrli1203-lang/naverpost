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
  const {
    originalContent,
    validation,
    mainKeyword,
    subKeyword1,
    subKeyword2,
    charCount = 2000,
  } = params;

  const problemLines: string[] = [];

  if (validation.prohibitedWords.length > 0) {
    for (const word of validation.prohibitedWords) {
      const replacements = WORD_REPLACEMENTS.get(word);
      if (replacements?.length) {
        problemLines.push(
          `- 금지어 "${word}"를 다음 중 하나로 바꾸세요: ${replacements.join(", ")}`
        );
      } else {
        problemLines.push(`- 금지어 "${word}"를 중립적인 표현으로 바꾸세요.`);
      }
    }
  }

  if (validation.cautionPhrases.length > 0) {
    for (const phrase of validation.cautionPhrases) {
      const replacements = WORD_REPLACEMENTS.get(phrase);
      if (replacements?.length) {
        problemLines.push(
          `- 주의 표현 "${phrase}"를 다음 중 하나로 바꾸세요: ${replacements.join(", ")}`
        );
      } else {
        problemLines.push(`- 주의 표현 "${phrase}"를 더 조심스러운 표현으로 바꾸세요.`);
      }
    }
  }

  if (validation.overusedWords.length > 0) {
    problemLines.push(
      `- 반복어를 줄이세요: ${validation.overusedWords
        .map((item) => `${item.word}(${item.count}회)`)
        .join(", ")}`
    );
  }

  if (validation.missingKeywords.length > 0) {
    problemLines.push(`- 빠진 키워드를 자연스럽게 넣으세요: ${validation.missingKeywords.join(", ")}`);
  }

  if (!validation.hasTable) {
    problemLines.push("- 본문 중간에 Markdown 표를 1개 추가하세요.");
  }

  if (validation.structure?.missingTitleKeywordCoverage?.length) {
    problemLines.push(
      `- 제목 핵심어가 본문에서 충분히 설명되도록 보완하세요: ${validation.structure.missingTitleKeywordCoverage.join(", ")}`
    );
  }

  return `당신은 네이버 블로그용 안경원 글을 자연스럽게 교정하는 에디터입니다.
아래 원문을 수정하되, 뜻을 바꾸지 말고 더 어색하게 만들지 마세요.

[수정할 문제]
${problemLines.join("\n")}

[반드시 지킬 규칙]
1. 원래 주제와 의미를 바꾸지 마세요.
2. 문체는 자연스럽고 부드러운 한국어로 유지하세요.
3. 글자 수는 약 ${charCount}자 내외를 유지하세요.
4. 메인 키워드와 서브 키워드는 원형 그대로 유지하세요.
${mainKeyword ? `5. 메인 키워드 "${mainKeyword}"는 반드시 남겨 두세요.` : ""}
${subKeyword1 ? `6. 서브 키워드 "${subKeyword1}"는 반드시 남겨 두세요.` : ""}
${subKeyword2 ? `7. 서브 키워드 "${subKeyword2}"는 반드시 남겨 두세요.` : ""}

[강한 금지 규칙]
- "핵심 답변:" 문장을 쓰지 마세요.
- "## FAQ" 또는 "## 자주 묻는 질문" 섹션을 만들지 마세요.
- "## 확인 및 안내" 섹션을 만들지 마세요.
- "...은 어떤 기준으로 보면 좋을까요?" 같은 질문형 서두를 만들지 마세요.
- 본문 끝에 메타 안내문, 기준일 메모, 공개 자료 기준 문장을 붙이지 마세요.

[원문]
${originalContent}

수정된 본문만 출력하세요.`;
}
