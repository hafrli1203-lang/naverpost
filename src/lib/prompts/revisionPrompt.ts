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

  if (validation.morphology?.missingTitleMorphemesInBody?.length) {
    problemLines.push(
      `- 제목 활성화 보강: 본문에서 빠진 제목 핵심 요소를 자연스럽게 설명에 녹여주세요. 누락 요소: ${validation.morphology.missingTitleMorphemesInBody.join(", ")}`
    );
  }

  if (validation.structure?.missingTitleKeywordCoverage?.length) {
    problemLines.push(
      `- 제목-본문 일치율 보강: 제목 또는 목표 키워드가 본문에서 실제 정보와 연결되도록 보완하세요. 누락 요소: ${validation.structure.missingTitleKeywordCoverage.join(", ")}`
    );
  }

  if (validation.languageRisk?.commercial?.length) {
    problemLines.push(
      `- 상업어 완화: 아래 상업어는 정보형 문체로 완화하세요. ${validation.languageRisk.commercial.join(", ")}`
    );
  }

  if (validation.languageRisk?.emphasis?.length) {
    problemLines.push(
      `- 강조어 완화: 아래 강조어는 단정적 뉘앙스가 약한 표현으로 바꾸세요. ${validation.languageRisk.emphasis.join(", ")}`
    );
  }

  if (validation.languageRisk?.strongAiCliches?.length) {
    problemLines.push(
      `- AI 상투어 제거(필수): 다음 표현은 AI가 쓴 글의 대표 신호입니다. 의미는 유지하되 사람이 말하는 표현으로 바꾸거나 빼세요. ${validation.languageRisk.strongAiCliches.join(", ")} (예: "이를 통해"→문장 연결을 어미로, "알아보겠습니다"→바로 본론으로)`
    );
  }

  if (validation.languageRisk?.formatViolations?.length) {
    problemLines.push(
      `- 형식 위반 수정(필수): ${validation.languageRisk.formatViolations.join(", ")} — 본문 쉼표는 문장을 나누거나 연결 어미로 풀어 모두 제거하세요(표 안과 천단위 숫자는 예외).`
    );
  }

  if (validation.languageRisk?.templateLeaks?.length) {
    problemLines.push(
      `- 지침 단어 노출 수정(필수): ${validation.languageRisk.templateLeaks.join(
        " / "
      )} — "신호" "넘겨짚을" "판별 축" "확인 순서" 같은 작성 지침용 단어를 소제목·표 머리글에서 빼고 실제 사람이 쓰는 말로 바꾸세요. 집과 안경원을 나눠 보여줄 때는 "집에서 보이는 모습 / 안경원에서 손보는 부분"처럼 자연스럽게 쓰세요. 표의 행 구분과 내용은 그대로 두고 머리글 문구만 자연어로 교체하세요.`
    );
  }

  if (validation.languageRisk?.mechanicalSignals?.length) {
    problemLines.push(
      `- 문장 리듬 다듬기: ${validation.languageRisk.mechanicalSignals.join(" / ")} — 어미와 문장 길이를 바꿔 균질한 리듬을 깨세요.`
    );
  }

  if (validation.duplicateRisk?.titlePatternOverlap?.length) {
    problemLines.push(
      `- 중복 회피: 같은 매장 또는 다른 블로그와 유사한 전개가 감지되었습니다. 도입부와 결론의 설명 방식, 정보 순서, 비교 포인트를 바꿔주세요. 참고 중복 패턴: ${validation.duplicateRisk.titlePatternOverlap.slice(0, 2).join(", ")}`
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
3. 글 길이는 ${charCount}자 내외로 맞추세요. 현재 글이 ${Math.ceil(charCount * 1.1)}자를 넘으면 핵심은 남기고 군더더기·중복 설명을 줄여 압축하세요.
4. 자연스러운 문장 흐름 유지
5. 숫자 나열(1. 2. 3.) 대신 문장으로 풀어서 작성
6. 쉼표(,) 사용 금지 — 접속사와 연결 어미로 이어지게 작성
7. 본문에 Markdown 표가 없으면 반드시 1개 추가하세요.
8. 제목의 핵심 요소가 본문에서 실제 정보와 연결되도록 보강하세요.
9. 상업어, 강조어, 광고성 문구는 정보형 블로그 문체로 완화하세요.
10. 기존 글과 비슷해 보이는 도입부/결론/정보 배열은 한 번만 다르게 정리하세요.
11. 원본의 소제목 구조를 그대로 유지하세요. 각 소제목은 줄 맨 앞에 "## "를 붙인 마크다운 헤더로 두고 소제목 개수와 순서를 바꾸지 마세요. 마커 없이 평범한 문장으로 풀어쓰면 소제목으로 표시되지 않습니다.

[원본 글]
${originalContent}

위 규칙에 맞게 전체 글을 자연스럽게 다시 작성해주세요.
제목 제외 본문만 출력하세요.`;
}

// G3: 자완 색인 보강. 검수를 통과한 본문을 새로 쓰지 않고, 본문에 빠진 조합형
// 자동완성 검색어만 맥락에 맞게 1회씩 자연스럽게 녹인다(블라이 "자완 색인" 대응).
export function buildAutocompleteAugmentPrompt(params: {
  originalContent: string;
  suggestions: string[];
  mainKeyword: string;
  subKeyword1?: string;
  subKeyword2?: string;
  charCount?: number;
}): string {
  const {
    originalContent,
    suggestions,
    mainKeyword,
    subKeyword1,
    subKeyword2,
    charCount = 2000,
  } = params;

  return `당신은 네이버 블로그 노출을 돕는 에디터입니다.
아래 글은 이미 검수를 통과했습니다. 내용을 새로 쓰지 말고, 자연스럽게 들어갈 수 있는 검색 키워드만 살짝 보강하세요.

[자완 색인 보강 — 자동완성에는 있으나 본문에 빠진 검색어]
${suggestions.map((s) => `  • ${s}`).join("\n")}
※ 위 키워드 중 글 맥락에 자연스럽게 맞는 것만 골라 본문에 1회씩 녹이세요. 억지로 다 넣지 말고 말이 되지 않으면 넣지 마세요.
※ 키워드 나열처럼 보이지 않게 문장 흐름과 기존 의미를 유지하세요.

[절대 규칙]
- 메인 키워드 "${mainKeyword}"${subKeyword1 ? `, 서브 "${subKeyword1}"` : ""}${subKeyword2 ? `, "${subKeyword2}"` : ""}는 원형 그대로 유지하세요.
- 쉼표(,) 사용 금지. 숫자 나열(1. 2. 3.) 금지.
- 글 길이는 ${charCount}자 내외를 유지하세요.
- 새 표나 새 섹션을 만들지 말고 기존 문장에 자연스럽게 스며들게 하세요.
- 원본의 "## " 소제목은 마커와 문구를 그대로 유지하세요.

[원본 글]
${originalContent}

제목 제외 본문만 출력하세요.`;
}
