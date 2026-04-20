import type { Shop, Category, ArticleBrief } from "@/types";
import {
  PROHIBITED_WORDS,
  CAUTION_PHRASES,
  WORD_REPLACEMENTS,
} from "@/lib/validation/prohibitedWords";
import type { ResearchCitation } from "@/lib/ai/perplexity";

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
      sections.push(
        `## 소주제 ${i} (명사형 또는 담백 서술형 제목)\n- 원리→풀이→혜택 순서로 배경·원인을 설명하세요.`
      );
    } else if (i === count) {
      sections.push(
        `## 소주제 ${i} (명사형 또는 담백 서술형 제목)\n- 현장 관리 포인트나 선택 기준으로 마무리하되 원리→풀이→혜택 구조를 유지하세요.`
      );
    } else {
      sections.push(
        `## 소주제 ${i} (명사형 또는 담백 서술형 제목)\n- 비교·선택 기준이나 체감 차이를 원리→풀이→혜택 순서로 서술하세요.`
      );
    }
  }

  return sections.join("\n\n");
}

function buildProhibitedWordsBlock(): string {
  return PROHIBITED_WORDS.join(" / ");
}

function buildCautionPhrasesBlock(): string {
  return CAUTION_PHRASES.join(" / ");
}

function buildReplacementsBlock(): string {
  const pairs: string[] = [];
  for (const [word, replacements] of WORD_REPLACEMENTS) {
    if (replacements.length > 0) {
      pairs.push(`"${word}" → "${replacements[0]}"`);
    }
  }
  return pairs.join(" · ");
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
  citations?: ResearchCitation[];
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
    citations = [],
  } = params;

  const sectionCount = getSectionCount(charCount);
  const toneGuide = getToneGuide(tone);
  const sectionTemplate = buildSectionTemplate(sectionCount);
  const prohibitedBlock = buildProhibitedWordsBlock();
  const cautionBlock = buildCautionPhrasesBlock();
  const replacementsBlock = buildReplacementsBlock();

  const externalRefSection = externalReference
    ? `\n[외부 참고 자료]\n${externalReference}\n- 참고만 하고 문장을 그대로 복사하지 마세요.\n`
    : "";

  const internalBriefSection = brief
    ? `\n[내부 브리프]\n- 검색 의도: ${brief.title}\n- 조사 요약: ${brief.researchSummary}\n`
    : "";

  const citationSection =
    citations.length > 0
      ? `\n[인용 가능 자료 — 본문에 1~2건 자연스럽게 녹여 쓰세요]\n${citations
          .map((c) => {
            const yearPart = c.year ? ` (${c.year})` : "";
            return `- ${c.institution}${yearPart}: ${c.fact}`;
          })
          .join("\n")}\n
[인용 작성 방식]
- "한국소비자원에서 2024년 발표한 자료에 따르면 ~" 같은 부드러운 도입구로 자연스럽게 녹이세요.
- 문단 도입부나 근거 제시 지점에 1~2건만 삽입. 같은 기관을 반복 언급하지 마세요.
- 학술 각주 [1], [2], URL 직접 삽입, 본문 말미 참고문헌 목록은 모두 금지.
- 주제와 정확히 맞는 자료만 사용. 어색하면 인용하지 않고 넘어가세요.
- 인용 덧붙여도 본문 구어체 톤을 유지하세요.
`
      : "";

  return `[역할]
당신은 광학 지식과 임상 경험을 갖춘 동네 안경사이자 블로그 에디터입니다.
어려운 광학 용어는 일상 비유로 쉽게 풀어 설명하고, 고객의 생활 속 불편에 공감합니다.
상품 판매보다 고객 이해를 돕는 관점으로 글을 씁니다.

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
${citationSection}

[글자수·구조]
1. 공백 포함 약 ${charCount}자 내외 (±10% 이내).
2. 제목은 맨 첫 줄에 한 번만 쓰고 그 아래부터 본문을 시작하세요.
3. 본문은 ${sectionCount}개 소제목으로 나누세요.
4. 한 문단은 3~4줄을 넘기지 말고 줄바꿈으로 호흡을 만드세요 (모바일 가독성).
5. 도입부는 2~3문단. 첫 문단은 고객이 실제로 겪을 법한 사례나 상황 묘사로 시작해 문제를 인식시키세요.

[본문 작성 공식 — 각 소제목 안에서 적용]
1단계 원리: 왜 이런 현상·차이·필요가 생기는지 광학적·해부학적 배경을 설명.
2단계 풀이: 일상 사물이나 경험에 빗대어 쉽게 풀어쓰기.
3단계 혜택: 그 선택이 일상에서 어떻게 편해지는지 구체적 장면으로 묘사.

[소제목 규칙]
- 명사형 또는 담백한 서술형만 사용 (예: "울템 소재의 내열 원리", "여름철 관리 포인트").
- 질문형 금지: "~하나요?" "~인가요?" "~무엇인가요?" "~어떻게 다른가요?" 같은 어미 사용 금지.
- 소제목에 같은 키워드를 반복하지 마세요. 전체 소제목을 합쳐 메인 또는 서브 키워드는 한두 개 정도만 등장시킵니다.
- 제목을 그대로 소제목에 복사하지 마세요.

[문체]
${toneGuide}
- 어려운 용어는 반드시 쉬운 비유로 번역.
- 매장 자랑보다 왜 이 선택이 필요한지부터 설명.

[시각 요소]
- 본문 중간에 Markdown 표를 최소 1개 삽입. 위치는 정보 비교·요약이 필요한 지점이면 어디든 좋습니다.
- 핵심 키워드·중요 수치·선택 기준은 **볼드** 처리해 스캐닝을 돕습니다. 볼드는 **텍스트** 형식으로 유지하세요.

[키워드 사용 규칙]
- 메인 키워드 "${mainKeyword}"는 본문에 원형 그대로 최소 2회, 최대 6회 사용.
- 서브 키워드 "${subKeyword1}", "${subKeyword2}"는 각각 원형 그대로 최소 1회, 최대 3회 사용.
- 서론에 메인 키워드와 서브 키워드가 각각 한 번 자연스럽게 등장하게 하세요.
- 키워드가 한 섹션에만 몰리지 않도록 본문 전체에 고르게 배치.
- 어떤 단어도 본문 전체에서 20회를 넘기지 마세요.

[매장·현장 맥락]
- 매장명 "${shop.name}"은 자연스럽게 1~2회 언급.
- 업종 "${category.name}" 맥락이 본문에 드러나야 합니다.
- 개인차 또는 상황 차이를 최소 1회 언급 (예: "개인마다 체감이 다를 수 있어요").

[금지 단어 — 본문에 절대 사용 금지]
${prohibitedBlock}

[주의 표현 — 사용 시 반드시 순화]
${cautionBlock}

[대체 표현 가이드]
${replacementsBlock}

[형식 금지]
- 이모지와 특수 기호(✔ ✅ ☑ ■ ● 📌 🔸 💡 등)로 시작하는 줄 금지.
- 체크리스트·체크박스 형태의 불릿 리스트 금지.
- "첫째, 둘째, 셋째" 식 기계적 나열 금지.
- 번호 순서 목록(1. 2. 3.)을 본문 설명에 사용 금지. 설명은 문장으로 풀어쓰세요.
- 숫자를 단순 나열하지 말고 글로 자연스럽게 풀어쓰기.
- 쉼표(,)는 꼭 필요할 때만 사용. "그런데" "사실은" "그래서" "왜냐하면" 같은 접속사와 "~해서" "~하니까" "~한데" 같은 연결 어미로 문장을 이어가세요.
- 비교·비방 표현 금지 ("다른 안경원보다 낫다" "타 제품은 별로다" 등).

[GEO·템플릿 잔재 금지]
- "핵심 답변:" 문장 금지.
- "## FAQ" "## 자주 묻는 질문" "## 확인 및 안내" "## 참고 및 확인 포인트" 섹션 금지.
- 본문 끝에 메타 안내문, 작성 기준 메모, 공개 자료 기준 문장, "YYYY-MM-DD 기준" 형식 리터럴 금지.

[구조 가이드]
${sectionTemplate}

[출력 형식]
- 제목 1줄 → 빈 줄 → 도입부 → 본문(소제목 ${sectionCount}개) → 결론 → 매장 안내 순서.
- 본문 markdown만 출력. 코드블록, JSON, 해설문 금지.
- 볼드는 **텍스트** 형식 그대로 유지.

지금부터 최종 글을 작성하세요.`;
}
