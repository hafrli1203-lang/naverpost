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
10. 원문에 "안경사의 한마디"와 최하단 매장 안내가 있으면 반드시 유지하세요.
11. 원문에 없더라도 글 흐름을 해치지 않는 범위에서 마무리에 "안경사의 한마디"를 짧게 추가하세요.
12. 최하단에는 [네이버 플레이스 정보 삽입 위치]와 [매장 주소/지도 정보 삽입 위치]가 빠지지 않게 하세요.
13. "경험 있으시죠", "막막하잖아요", "살펴볼게요", "정리해봤어요", "도움이 돼요", "보탬이 될 거예요" 같은 AI형 친근 문구는 줄이거나 바꾸세요.
14. 원리 설명 → 비유 → 정리 구조가 소제목마다 반복되면 문단 순서를 바꿔 자연스럽게 만드세요.
15. 비유는 본문 전체에서 1회 정도만 남기고 나머지는 실제 생활 장면이나 확인 기준으로 바꾸세요.

[소제목 규칙]
- 명사형 또는 담백 서술형만 사용.
- 질문형 금지: "~하나요?" "~인가요?" "~어떻게 다른가요?" 어미 금지.
- 같은 키워드가 여러 소제목에 중복되지 않도록 하세요.
- "방문 전 점검하면 좋은 생활 정보", "원인과 해결 방법", "꼭 알아야 할 기준" 같은 템플릿형 소제목은 더 구체적으로 바꾸세요.

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
- 문단마다 같은 말투로 끝나지 않게 하세요. "~해요"만 반복되면 일부 문장은 담백한 서술형으로 바꾸세요.

[강한 금지 규칙]
- "핵심 답변:" 문장을 쓰지 마세요.
- "## FAQ" "## 자주 묻는 질문" "## 확인 및 안내" "## 참고 및 확인 포인트" 섹션 금지.
- 본문 끝에 메타 안내문, 기준일 메모, "YYYY-MM-DD 기준" 형식 리터럴 금지.
- 비교·비방 표현 금지.
- "전문가의 한마디" "전문의 한마디"는 쓰지 말고 "안경사의 한마디"로만 표현하세요.
- "상담" "문의" "예약" 같은 직접 전환 문구를 새로 추가하지 마세요. 필요하면 "확인" "방문 전 확인"으로 순화하세요.
- 주력 품목/서비스, 매장 장점은 글 주제와 직접 관련 없으면 새로 추가하지 마세요.
- 눈정보·생활정보 글에서는 브랜드명이나 상품명이 어색하게 들어간 문장을 삭제하거나 일반적인 확인 기준으로 바꾸세요.
- 브랜드명과 특정 상품명은 새로 추가하지 마세요.
- 브랜드나 특정 상품을 근거로 "가볍다" "편하다" "불편을 줄인다" "적응을 돕는다" 같은 기능·효과를 말하지 마세요.
- 브랜드명과 불편 해결을 연결한 문장은 삭제하세요.
- 최하단 매장 안내에 들어갈 주소·플레이스·운영시간·주차 정보는 본문 중간에 반복하지 마세요.

[어체 보정 기준]
- 표준/준전문적 글은 "~합니다" "~할 수 있습니다" 중심으로 정리하되 딱딱한 행정 문체는 피하세요.
- 친근함/따뜻한 글은 "~해요"를 사용할 수 있지만 "경험 있으시죠" "막막하잖아요"처럼 과한 공감 문구는 쓰지 마세요.
- 캐주얼/대화체 글은 짧은 문장을 섞되 "진짜" "솔직히" "~거예요" 같은 가벼운 표현을 반복하지 마세요.
- 어떤 어체든 한 문단 안에서 같은 어미가 3번 이상 반복되면 일부 문장을 다른 구조로 바꾸세요.

[원문]
${originalContent}

수정된 본문만 출력하세요. 코드블록·JSON·해설문 금지.`;
}

export function buildWashingPrompt(params: {
  originalContent: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  charCount: number;
  tone: string;
}): string {
  const { originalContent, mainKeyword, subKeyword1, subKeyword2, charCount, tone } = params;

  return `당신은 네이버 블로그 원고를 최종 워싱하는 에디터입니다.
아래 원문은 정보 구조와 SEO 키워드는 이미 잡혀 있습니다.
목표는 내용을 새로 쓰는 것이 아니라, AI가 쓴 티를 줄이고 실제 사람이 다듬은 글처럼 문장 결을 정리하는 것입니다.

[워싱 목표]
- 구조, 제목, 키워드, 표, 안경사의 한마디, 최하단 매장 안내는 유지하세요.
- 사실 관계와 설명 방향은 바꾸지 마세요.
- 과하게 반듯한 문단, 반복되는 어미, 템플릿형 문장을 자연스럽게 풀어주세요.
- 병원식 표현, 과장 표현, 직접 전환 문구는 추가하지 마세요.

[키워드 보존]
- 메인 키워드 "${mainKeyword}"는 원형 그대로 유지하고 본문에 최소 2회 남기세요.
- 서브 키워드 "${subKeyword1}", "${subKeyword2}"는 원형 그대로 각각 최소 1회 남기세요.
- 키워드를 억지로 늘리지 말고 원문의 검색 의도를 유지하세요.

[분량]
- 공백 포함 약 ${charCount}자 내외를 유지하세요. 현재 분량에서 크게 늘리거나 줄이지 마세요.

[선택된 어체]
- 현재 선택 어체: ${tone}
- standard면 담백한 준전문 설명체로 정리하세요.
- friendly면 따뜻하지만 과한 공감 없는 안내체로 정리하세요. "~합니다" 중심의 딱딱한 문장으로 바꾸지 말고 "~해요" 계열을 자연스럽게 유지하세요.
- casual이면 짧은 문장을 섞은 대화체로 정리하되 가볍게 떠드는 말투는 피하세요. 문장 끝이 전부 "~합니다"로 바뀌면 안 됩니다.

[AI 티 제거 규칙]
- "경험 있으시죠", "막막하잖아요", "살펴볼게요", "정리해봤어요", "도움이 돼요", "보탬이 될 거예요"는 다른 표현으로 바꾸세요.
- 같은 문단 안에서 "~해요" "~있어요" "~됩니다" 같은 어미가 반복되면 일부 문장을 다른 구조로 바꾸세요.
- friendly/casual 원고에서 "이야기합니다", "확인해야 합니다", "필요합니다" 같은 준전문 문장이 연속되면 일부를 "확인해보면 좋아요", "함께 봐야 해요"처럼 부드럽게 바꾸세요.
- 소제목마다 원리 설명 → 비유 → 정리 순서가 반복되면 문단 순서를 바꾸거나 비유를 삭제하세요.
- 비유는 본문 전체에서 1회 이하로 남기세요.
- "방문 전 점검하면 좋은 생활 정보", "꼭 알아야 할 기준", "원인과 해결 방법"처럼 템플릿 같은 소제목은 주제에 맞는 구체적인 소제목으로 바꾸세요.
- 표 앞뒤에서 표 내용을 그대로 다시 설명하지 마세요.
- 너무 완벽하게 정돈된 3문장 문단만 반복하지 말고, 짧은 문장과 설명 문장을 섞으세요.

[유지해야 할 것]
- 제목 첫 줄 유지.
- Markdown 표 유지.
- **볼드** 형식 유지.
- "안경사의 한마디" 유지.
- [네이버 플레이스 정보 삽입 위치], [매장 주소/지도 정보 삽입 위치]가 있으면 그대로 유지.
- 주소, 운영시간, 링크 등 등록 정보가 있으면 임의로 바꾸지 마세요.

[금지]
- 브랜드명이나 특정 상품명을 새로 추가하지 마세요.
- "상담", "문의", "예약", "지금 방문" 같은 직접 전환 문구를 새로 추가하지 마세요.
- "전문가", "전문의", "치료", "진단", "시술" 같은 표현을 쓰지 마세요.
- 코드블록, JSON, 해설문을 출력하지 마세요.

[원문]
${originalContent}

워싱된 본문만 출력하세요.`;
}
