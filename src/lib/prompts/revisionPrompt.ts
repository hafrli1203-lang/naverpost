import type { ValidationResult } from "@/types";
import {
  PROHIBITED_WORDS,
  CAUTION_PHRASES,
  WORD_REPLACEMENTS,
} from "@/lib/validation/prohibitedWords";

function buildReplacementsBlock(): string {
  const pairs: string[] = [];
  for (const [word, replacements] of WORD_REPLACEMENTS) {
    if (replacements.length > 0) {
      pairs.push(`"${word}" → "${replacements[0]}"`);
    }
  }
  return pairs.join(" · ");
}

export function buildRevisionPrompt(params: {
  originalContent: string;
  validation: ValidationResult;
  mainKeyword?: string;
  subKeyword1?: string;
  subKeyword2?: string;
  charCount?: number;
  extraProblems?: string[];
}): string {
  const {
    originalContent,
    validation,
    mainKeyword,
    subKeyword1,
    subKeyword2,
    charCount = 2000,
    extraProblems = [],
  } = params;

  const problemLines: string[] = [...extraProblems];

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
      `- 반복어를 줄이세요 (어떤 단어도 20회 넘기지 않게): ${validation.overusedWords
        .map((item) => `${item.word}(${item.count}회)`)
        .join(", ")}`
    );
  }

  if (validation.missingKeywords.length > 0) {
    problemLines.push(
      `- 빠진 키워드를 자연스럽게 넣으세요 (원형 그대로): ${validation.missingKeywords.join(", ")}`
    );
  }

  if (!validation.hasTable) {
    problemLines.push("- 본문 중간에 Markdown 표를 1개 추가하세요.");
  }

  if (validation.structure?.missingTitleKeywordCoverage?.length) {
    problemLines.push(
      `- 제목 핵심어가 본문에서 충분히 설명되도록 보완하세요: ${validation.structure.missingTitleKeywordCoverage.join(", ")}`
    );
  }

  const prohibitedBlock = PROHIBITED_WORDS.join(" / ");
  const cautionBlock = CAUTION_PHRASES.join(" / ");
  const replacementsBlock = buildReplacementsBlock();

  return `당신은 네이버 블로그용 안경원 글을 자연스럽게 교정하는 에디터입니다.
아래 원문을 수정하되, 뜻을 바꾸지 말고 더 어색하게 만들지 마세요.

[수정할 문제]
${problemLines.join("\n")}

[반드시 지킬 규칙]
1. 원래 주제와 의미를 바꾸지 마세요.
2. 문체는 자연스럽고 부드러운 한국어로 유지하세요.
3. 글자 수는 약 ${charCount}자 내외 (±10%)를 유지하세요.
4. 메인 키워드와 서브 키워드는 원형 그대로 유지하세요.
${mainKeyword ? `5. 메인 키워드 "${mainKeyword}"는 반드시 남겨 두세요.` : ""}
${subKeyword1 ? `6. 서브 키워드 "${subKeyword1}"는 반드시 남겨 두세요.` : ""}
${subKeyword2 ? `7. 서브 키워드 "${subKeyword2}"는 반드시 남겨 두세요.` : ""}
8. 한 문단은 3~4줄을 넘기지 말고 줄바꿈을 활용하세요.
9. 핵심 키워드·중요 수치는 **볼드** 형식을 유지하거나 보강하세요.

[소제목 규칙]
- 명사형 또는 담백 서술형만 사용.
- 질문형 금지: "~하나요?" "~인가요?" "~어떻게 다른가요?" 어미 금지.
- 같은 키워드가 여러 소제목에 중복되지 않도록 하세요.

[금지 단어 — 본문에 절대 사용 금지]
${prohibitedBlock}

[주의 표현 — 반드시 순화]
${cautionBlock}

[대체 표현 가이드]
${replacementsBlock}

[형식 금지]
- 이모지와 특수 기호(✔ ✅ ☑ ■ ● 📌 🔸 💡 등)로 시작하는 줄 금지.
- 체크리스트·체크박스 형태의 불릿 리스트 금지.
- "첫째, 둘째, 셋째" 기계적 나열 금지.
- 번호 순서 목록(1. 2. 3.)을 본문 설명에 사용 금지. 설명은 문장으로 풀어쓰세요.
- 숫자 단순 나열 금지. 글로 자연스럽게 풀어쓰기.
- 쉼표(,)는 최소화. 접속사와 연결 어미로 문장을 이어가세요.

[강한 금지 규칙]
- "핵심 답변:" 문장을 쓰지 마세요.
- "## FAQ" "## 자주 묻는 질문" "## 확인 및 안내" "## 참고 및 확인 포인트" 섹션 금지.
- 본문 끝에 메타 안내문, 기준일 메모, "YYYY-MM-DD 기준" 형식 리터럴 금지.
- 비교·비방 표현 금지.

[원문]
${originalContent}

수정된 본문만 출력하세요. 코드블록·JSON·해설문 금지.`;
}
