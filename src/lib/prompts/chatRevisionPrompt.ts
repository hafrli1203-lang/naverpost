import type { ChatMessage } from "@/types";
import { getToneGuide } from "./articlePrompt";

/**
 * Builds an instruction-driven revision prompt from a multi-turn chat thread.
 * The user points out what is wrong (e.g. "멀티포컬은 콘택트렌즈인데 다초점 안경으로
 * 썼다") and the model rewrites the body accordingly while preserving hard rules.
 */
export function buildChatRevisionPrompt(params: {
  currentContent: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  categoryName: string;
  glossaryHint?: string;
  messages: ChatMessage[];
  charCount?: number;
  tone?: string;
}): string {
  const {
    currentContent,
    mainKeyword,
    subKeyword1,
    subKeyword2,
    categoryName,
    glossaryHint,
    messages,
    charCount = 2000,
    tone,
  } = params;

  const toneGuide = getToneGuide(tone);

  const conversation = messages
    .map((message) => {
      const speaker = message.role === "user" ? "사용자 지시" : "이전 수정 메모";
      return `[${speaker}]\n${message.content}`;
    })
    .join("\n\n");

  const glossarySection = glossaryHint
    ? `\n[키워드 정확한 의미 — 반드시 준수]\n${glossaryHint}\n※ 위 정의를 벗어난 설명은 모두 고쳐야 합니다.\n`
    : "";

  return `당신은 안경원 블로그 본문을 다듬는 한국어 에디터입니다.
아래 대화의 지시를 정확히 반영해 본문을 다시 작성하세요.
사용자는 글이 키워드의 실제 의미와 어긋난 점을 지적하고 있을 수 있습니다.

[글 정보]
카테고리: ${categoryName}
메인 키워드: ${mainKeyword}
서브 키워드1: ${subKeyword1}
서브 키워드2: ${subKeyword2}
${glossarySection}
[어투 — 원문 어투를 처음부터 끝까지 그대로 유지]
${toneGuide}

[대화 내역 — 마지막 사용자 지시를 최우선으로 반영]
${conversation}

[수정 원칙]
1. 사용자가 지적한 의미 오류는 반드시 바로잡으세요. 키워드가 가리키는 실제 대상과 맞지 않는 설명은 모두 교체합니다.
2. 키워드 단어는 원형 그대로 유지하세요. 유사어로 바꾸지 마세요.
3. 이모지·번호목록("1. 2. 3.")을 쓰지 마세요. 쉼표(,)는 호흡에 필요한 곳만 제한적으로(한 문장 1~2개 이내, 남발 금지). 문장은 연결 어미로 자연스럽게 이으세요.
4. 본문 끝의 매장 안내(매장명·주소·운영시간·주차·플레이스)는 그대로 보존하세요.
5. 글 길이는 약 ${charCount}자 내외를 유지하세요.
6. 효과를 단정하는 표현이나 광고성 과장 표현을 쓰지 마세요.
7. 지시와 무관한 부분은 원문의 흐름과 문체를 최대한 유지하세요.
8. 위 [어투] 지침의 말투를 본문 전체에 일관되게 유지하세요. 사용자가 어투 변경을 명시적으로 지시하지 않는 한 원문 어투를 바꾸지 마세요.
9. 없는 인용·통계·수치·기관명을 새로 지어내지 마세요. 사용자 지시에 없는 사실은 추가하지 않습니다.

[현재 본문]
${currentContent}

위 지시를 반영해 전체 본문을 자연스럽게 다시 작성하세요.
제목은 제외하고 본문만 출력하세요. 설명이나 머리말 없이 본문 텍스트만 출력합니다.`;
}
