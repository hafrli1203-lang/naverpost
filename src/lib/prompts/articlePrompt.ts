import type { Shop, Category, ArticleBrief } from "@/types";

type ToneType = "standard" | "friendly" | "casual";
type CharCountType = 1000 | 1500 | 2000 | 2500;

function getToneGuide(tone: ToneType): string {
  switch (tone) {
    case "friendly":
      return [
        "- 본문은 친절하고 다정한 구어체로 작성하세요.",
        '- 예: "~거든요" "~이에요" "~랍니다" "~죠".',
        "- 독자에게 설명해 주는 안경사 톤을 유지하세요.",
      ].join("\n");
    case "casual":
      return [
        "- 본문은 편안하고 가벼운 대화체로 작성하세요.",
        '- 예: "~요" "~예요" "~잖아요" "~거예요".',
        "- 너무 가볍거나 장난스럽지 않게 유지하세요.",
      ].join("\n");
    case "standard":
    default:
      return [
        "- 본문은 전문적이지만 딱딱하지 않은 안경사 말투로 작성하세요.",
        '- 예: "~해요" "~하거든요" "~한답니다" "~까요".',
        "- 설명은 쉽게 풀되 과장하지 마세요.",
      ].join("\n");
  }
}

function getSectionCount(charCount: CharCountType): number {
  switch (charCount) {
    case 1000:
      return 2;
    case 1500:
      return 3;
    case 2000:
      return 4;
    case 2500:
      return 5;
    default:
      return 4;
  }
}

function buildSectionTemplate(count: number): string {
  const sections: string[] = [];

  for (let i = 1; i <= count; i += 1) {
    if (i === 1) {
      sections.push(`## 소주제 ${i}\n- 원리나 배경을 설명하세요.`);
    } else if (i === count) {
      sections.push(`## 소주제 ${i}\n- 관리 방법이나 현장 안내로 마무리하세요.`);
    } else {
      sections.push(`## 소주제 ${i}\n- 선택 기준이나 실제 체감 차이를 설명하세요.`);
    }
  }

  return sections.join("\n\n");
}

export function buildArticlePrompt(params: {
  title: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  shop: Shop;
  category: Category;
  topic: string;
  researchData: string;
  charCount?: CharCountType;
  tone?: ToneType;
  externalReference?: string;
  brief?: ArticleBrief;
}): string {
  const {
    title,
    mainKeyword,
    subKeyword1,
    subKeyword2,
    shop,
    category,
    topic,
    researchData,
    charCount = 2000,
    tone = "standard",
    externalReference,
    brief,
  } = params;

  const sectionCount = getSectionCount(charCount);
  const toneGuide = getToneGuide(tone);
  const sectionTemplate = buildSectionTemplate(sectionCount);

  const externalRefSection = externalReference
    ? `\n[외부 참고 자료]\n${externalReference}\n- 참고만 하고 문장을 그대로 복사하지 마세요.\n`
    : "";

  const internalBriefSection = brief
    ? `\n[내부 브리프]\n- 검색 의도: ${brief.title}\n- 조사 요약: ${brief.researchSummary}\n`
    : "";

  return `[역할]
당신은 네이버 블로그용 안경원 정보 글을 작성하는 전문 에디터입니다.
목표는 검색 노출과 읽기 편한 자연스러운 문장을 함께 만족하는 것입니다.

[입력 정보]
- 주제: ${topic}
- 제목: ${title}
- 매장명: ${shop.name}
- 업종: ${category.name}
- 메인 키워드: ${mainKeyword}
- 서브 키워드 1: ${subKeyword1}
- 서브 키워드 2: ${subKeyword2}

[조사 자료]
${researchData}
${externalRefSection}
${internalBriefSection}

[작성 규칙]
1. 글자 수는 공백 포함 약 ${charCount}자 내외로 작성하세요. ±10% 이내로 맞추세요.
2. 제목은 맨 첫 줄에 한 번만 쓰고, 그 아래부터 본문을 시작하세요.
3. 본문은 ${sectionCount}개의 소제목으로 나누세요.
4. 소제목은 질문형보다 설명형 서술을 우선하세요.
5. 도입부는 2~3문단으로 자연스럽게 시작하세요.
6. 쉼표 사용은 최소화하고 문장을 매끄럽게 이어가세요.
7. 본문 중간에 Markdown 표를 최소 1개 넣으세요.
8. 메인 키워드 "${mainKeyword}"는 원형 그대로 최소 2회 넣으세요.
9. 서브 키워드 "${subKeyword1}", "${subKeyword2}"는 각각 원형 그대로 최소 1회 넣으세요.
10. 매장명 "${shop.name}"은 자연스럽게 1~2회 언급하세요.
11. 개인차나 상황 차이를 최소 1회 언급하세요.
12. 과장 표현, 단정 표현, 비방 표현은 금지합니다.

[강한 금지 규칙]
- "핵심 답변:" 문장을 쓰지 마세요.
- "## FAQ" 또는 "## 자주 묻는 질문" 섹션을 만들지 마세요.
- "## 확인 및 안내" 섹션을 만들지 마세요.
- "...은 어떤 기준으로 보면 좋을까요?" 같은 질문형 서두를 만들지 마세요.
- 본문 끝에 메타 안내문, 작성 기준 메모, 공개 자료 기준 문장을 붙이지 마세요.
- 제목을 다시 소제목으로 반복하지 마세요.

[문체]
${toneGuide}

[구조 가이드]
${sectionTemplate}

[출력 형식]
- 제목 1줄
- 본문만 출력
- 코드블록, JSON, 해설문 금지

지금부터 최종 글을 작성하세요.`;
}
