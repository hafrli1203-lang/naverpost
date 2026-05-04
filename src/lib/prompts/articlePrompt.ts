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
        "[선택 어체: 친근함/따뜻한 안내체]",
        "- 가까운 안경사가 차분히 설명하는 톤입니다. 독자를 몰아붙이지 말고 부드럽게 안내하세요.",
        "- 공감은 한두 문장으로만 짧게 쓰고, 과한 감정 표현이나 호들갑은 피하세요.",
        '- 사용할 수 있는 어미: "~해요" "~될 수 있어요" "~확인해보면 좋아요" "~느낄 수 있습니다".',
        '- 제한할 어미: "~거든요" "~죠"는 문단마다 반복하지 말고, "~잖아요" "~답니다" "~해볼게요"는 쓰지 마세요.',
        '- 예시 톤: "오후가 되면서 렌즈가 뻑뻑해지는 분들이 있습니다. 이럴 때는 착용 시간만 볼 게 아니라 실내 환경과 눈물 상태도 함께 봐야 해요."',
      ].join("\n");
    case "casual":
      return [
        "[선택 어체: 캐주얼/대화체]",
        "- 실제로 옆에서 설명하듯 짧고 자연스럽게 쓰세요. 단, 장난스럽거나 가벼운 홍보 말투는 피하세요.",
        "- 한 문단 안에 짧은 문장 1개와 설명 문장 1~2개를 섞어 리듬을 만드세요.",
        '- 사용할 수 있는 어미: "~해요" "~예요" "~볼 수 있어요" "~확인하면 좋아요".',
        '- 제한할 어미: "~잖아요" "~거예요" "~더라고요"는 반복하지 말고, "솔직히" "진짜" 같은 표현은 쓰지 마세요.',
        '- 예시 톤: "렌즈가 오후마다 달라붙는 느낌이 있다면 착용 시간부터 확인해보세요. 여기에 에어컨 바람이나 모니터 시간이 겹치면 건조감이 더 빨리 올라올 수 있어요."',
      ].join("\n");
    case "standard":
    default:
      return [
        "[선택 어체: 표준/준전문적 설명체]",
        "- 본문은 담백한 설명체로 작성하세요. 전문적인 느낌은 주되 병원 문서처럼 딱딱하게 쓰지 마세요.",
        "- 감정 공감보다 관찰 가능한 증상, 원인, 확인 기준을 중심으로 설명하세요.",
        '- 사용할 수 있는 어미: "~합니다" "~할 수 있습니다" "~확인하는 것이 좋습니다" "~차이가 있습니다".',
        '- 제한할 어미: "~거든요" "~이에요" "~잖아요" "~답니다" "~해볼게요"는 쓰지 마세요.',
        '- 예시 톤: "렌즈 착용 후 반복적으로 충혈이 생긴다면 착용 시간, 렌즈 표면 상태, 실내 건조 환경을 함께 확인해야 합니다."',
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
        `## 소주제 ${i} (명사형 또는 담백 서술형 제목)\n- 배경·원인을 설명하되 원리→비유→정리 패턴을 기계적으로 반복하지 마세요. 실제 증상이나 관찰 포인트를 먼저 둘 수 있습니다.`
      );
    } else if (i === count) {
      sections.push(
        `## 소주제 ${i} (명사형 또는 담백 서술형 제목)\n- 방문 전 확인하면 좋은 생활 상황·현재 사용 상태·착용 환경을 자연스럽게 정리하세요. "방문 전 점검" 같은 템플릿 소제목은 피하세요.`
      );
    } else {
      sections.push(
        `## 소주제 ${i} (명사형 또는 담백 서술형 제목)\n- 비교·선택 기준이나 체감 차이를 설명하세요. 앞 소제목과 같은 문장 구조로 시작하지 마세요.`
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

function formatList(items?: string[]): string {
  return items?.filter(Boolean).join(" / ") || "(등록 없음)";
}

function buildShopFactSection(shop: Shop): string {
  const lines = [
    `- 매장명: ${shop.name}`,
    `- 네이버 블로그 ID: ${shop.blogId}`,
    `- 주소: ${shop.address || "(등록 없음)"}`,
    `- 네이버 플레이스 링크: ${shop.naverPlaceUrl || "(등록 없음)"}`,
    `- 홈페이지 링크: ${shop.homepageUrl || "(등록 없음)"}`,
    `- 하단 안내 문구: ${shop.brandBannerText || "(등록 없음)"}`,
    `- 운영시간: ${shop.businessHours || "(등록 없음)"}`,
    `- 주차/방문 정보: ${shop.parkingInfo || "(등록 없음)"}`,
    `- 주력 품목/서비스: ${formatList(shop.mainProducts)}`,
    `- 현장 확인/관리 항목: ${formatList(shop.serviceStrengths)}`,
    `- 방문 전 확인 포인트: ${formatList(shop.visitChecklist)}`,
    `- 매장별 사용 금지 표현: ${formatList(shop.avoidClaims)}`,
  ];

  return lines.join("\n");
}

function buildPlaceFooterInstruction(shop: Shop): string {
  if (shop.address || shop.naverPlaceUrl || shop.homepageUrl || shop.parkingInfo) {
    return [
      "- 최하단 매장 안내에는 아래 등록된 사실만 사용하세요.",
      shop.brandBannerText ? `  - 하단 안내 문구: ${shop.brandBannerText}` : "",
      shop.homepageUrl ? `  - 홈페이지 링크: ${shop.homepageUrl}` : "",
      shop.naverPlaceUrl ? `  - 네이버 플레이스: ${shop.naverPlaceUrl}` : "",
      shop.address ? `  - 주소: ${shop.address}` : "",
      shop.parkingInfo ? `  - 주차/방문 정보: ${shop.parkingInfo}` : "",
      shop.businessHours ? `  - 운영시간: ${shop.businessHours}` : "",
      "- 등록되지 않은 주소, 링크, 운영시간, 주차 정보는 임의로 만들지 마세요.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "- 최하단 매장 안내에는 실제 주소나 플레이스 링크를 임의로 만들지 말고, 다음 두 줄을 그대로 남기세요.",
    "  - [네이버 플레이스 정보 삽입 위치]",
    "  - [매장 주소/지도 정보 삽입 위치]",
  ].join("\n");
}

function buildShopContextUsageRule(category: Category): string {
  const categoryName = category.name;

  if (categoryName.includes("눈정보")) {
    return [
      "- 이 카테고리는 눈 건강·생활 불편 정보가 중심입니다.",
      "- 본문 중간에 주력 품목, 특정 상품명, 브랜드명을 끼워 넣지 마세요.",
      "- 매장 정보는 현재 안경 상태나 생활 불편을 확인하는 일반적인 과정으로만 짧게 연결하세요.",
      "- 매장명은 필요할 때 1회 이하로만 쓰고, 실제 주소·플레이스 정보는 최하단 안내에만 둡니다.",
    ].join("\n");
  }

  if (categoryName.includes("안경이야기")) {
    return [
      "- 이 카테고리는 안경 관리·수리·사용 팁이 중심입니다.",
      "- 주력 품목/서비스는 글 주제와 직접 관련될 때만 1회 이하로 언급하세요.",
      "- 세척, 김서림, 수리처럼 생활 관리 주제에서는 브랜드명을 넣지 마세요.",
    ].join("\n");
  }

  if (categoryName.includes("안경테")) {
    return [
      "- 안경테 소재, 착용감, 피팅, 무게, 얼굴형처럼 안경테 선택과 직접 관련될 때만 주력 품목/서비스를 언급할 수 있습니다.",
      "- 브랜드명과 특정 상품명은 사용하지 마세요.",
    ].join("\n");
  }

  if (categoryName.includes("안경렌즈") || categoryName.includes("누진")) {
    return [
      "- 렌즈 종류, 교체, 누진다초점, 변색, 블루라이트처럼 렌즈 선택과 직접 관련될 때만 주력 품목/서비스를 언급할 수 있습니다.",
      "- 브랜드명과 특정 상품명은 사용하지 말고, 생활 불편과 선택 기준 중심으로 설명하세요.",
    ].join("\n");
  }

  if (categoryName.includes("콘택트")) {
    return [
      "- 콘택트렌즈 착용, 건조감, 관리, 원데이렌즈처럼 주제와 직접 관련될 때만 주력 품목/서비스를 언급할 수 있습니다.",
      "- 안경테·안경렌즈 브랜드나 다른 품목 정보는 넣지 마세요.",
    ].join("\n");
  }

  return [
    "- 등록된 주력 품목/서비스는 글 주제와 직접 맞을 때만 사용하세요.",
    "- 주제와 연결되지 않으면 등록 정보가 있어도 본문에 넣지 마세요.",
  ].join("\n");
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
  const shopFactSection = buildShopFactSection(shop);
  const placeFooterInstruction = buildPlaceFooterInstruction(shop);
  const shopContextUsageRule = buildShopContextUsageRule(category);

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

[매장 등록 정보 — 사실 기반 작성에만 사용]
${shopFactSection}

[매장 정보 사용 규칙]
- 위 등록 정보에 없는 주소, 링크, 운영시간, 주차, 브랜드, 서비스는 절대 만들지 마세요.
- 브랜드명과 특정 상품명은 본문에 사용하지 마세요.
- 주력 품목/서비스는 등록된 경우에만 언급하세요.
- 등록된 정보라도 글 주제와 직접 맞지 않으면 본문에 쓰지 마세요.
- 특히 주력 품목/서비스는 "넣기 위해 넣는 문장"이 되면 생략하세요.
- 어떤 브랜드나 특정 상품이 "가볍다", "편하다", "불편을 줄인다", "적응을 돕는다" 같은 기능·효과를 낸다고 쓰지 마세요.
- 매장별 사용 금지 표현은 본문 어디에도 쓰지 마세요.
- 매장 정보는 본문 중간에 과하게 반복하지 말고, 방문 전 확인 포인트와 최하단 매장 안내에서만 자연스럽게 사용하세요.

[카테고리별 매장 정보 반영 기준]
${shopContextUsageRule}

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
5. 도입부는 반드시 3문단으로 작성하세요.
   - 1문단: 고객이 실제로 겪는 불편이나 궁금증을 구체적인 생활 장면으로 공감.
   - 2문단: 그 불편이 생기는 이유를 단정하지 않고 문제 인식 수준으로 연결.
   - 3문단: 오늘 글에서 확인할 기준을 안내하며 메인 키워드와 서브 키워드를 자연스럽게 포함.

[사람이 쓴 글처럼 보이게 하는 규칙]
- 모든 소제목을 같은 구조로 쓰지 마세요. 원인 설명, 생활 관찰, 기준 정리, 주의할 상황을 섞으세요.
- 각 소제목마다 "원리 설명 → 비유 → 그래서" 구조를 반복하지 마세요.
- 비유는 본문 전체에서 1회만 사용하세요. "마치", "~와 비슷해요", "~라고 생각하면" 같은 문장을 반복하지 마세요.
- "경험 있으시죠", "막막하잖아요", "살펴볼게요", "정리해봤어요", "도움이 돼요", "보탬이 될 거예요" 같은 AI형 친근 문구는 쓰지 마세요.
- 문단 시작을 "그래서", "여기에", "오늘은", "같은"으로 반복하지 마세요.
- 너무 완벽하게 정돈된 3문장 문단만 만들지 말고, 짧은 문장과 설명 문장을 섞으세요.
- 실제 현장에서 들을 법한 표현을 쓰되 과장된 공감이나 감탄은 피하세요.

[본문 작성 기준]
- 원인: 왜 이런 현상·차이·필요가 생기는지 광학적·해부학적 배경을 설명.
- 풀이: 독자가 바로 확인할 수 있는 생활 장면과 연결.
- 기준: 어떤 경우에 사용 습관·제품 상태·착용 환경을 점검해야 하는지 정리.
- 소제목마다 세 요소를 모두 같은 순서로 넣지 말고, 글 흐름에 맞게 골라 쓰세요.

[방문 전환형 정보 설계]
- 글의 목적은 판매가 아니라 독자가 "내 상황을 확인해봐야겠다"라고 느끼도록 돕는 것입니다.
- 본문 후반에는 반드시 "방문 전 확인 포인트" 성격의 내용을 자연스럽게 넣으세요.
- 포함 가능한 확인 포인트: 현재 쓰는 안경 착용 기간, 불편한 거리, 운전·독서·컴퓨터 등 사용 환경, 안경 흘러내림 여부, 기존 안경 지참 여부.
- 매장 등록 정보의 "방문 전 확인 포인트"가 있으면 그 내용을 우선 반영하세요.
- 매장 등록 정보의 "현장 확인/관리 항목"이 있으면 방문 시 어떤 부분을 확인하는지 사실 기반으로 설명하세요.
- "상담" "문의" "예약" "지금 방문" 같은 직접 전환 문구는 쓰지 마세요.
- 대신 "현재 쓰는 안경을 함께 가져오면 확인이 수월합니다", "불편한 상황을 메모해두면 선택 기준을 좁히기 좋습니다"처럼 정보형으로 안내하세요.
- 매장 자랑이나 가격 유도 없이, 방문했을 때 무엇을 확인하는지 프로세스를 짧게 설명해 불확실성을 줄이세요.

[소제목 규칙]
- 명사형 또는 담백한 서술형만 사용 (예: "울템 소재의 내열 원리", "여름철 관리 포인트").
- 질문형 금지: "~하나요?" "~인가요?" "~무엇인가요?" "~어떻게 다른가요?" 같은 어미 사용 금지.
- 소제목에 같은 키워드를 반복하지 마세요. 전체 소제목을 합쳐 메인 또는 서브 키워드는 한두 개 정도만 등장시킵니다.
- 제목을 그대로 소제목에 복사하지 마세요.
- "방문 전 점검하면 좋은 생활 정보", "원인과 해결 방법", "꼭 알아야 할 기준" 같은 템플릿형 소제목을 쓰지 마세요.
- 소제목은 글 주제에 붙은 구체적인 표현으로 쓰세요. 예: "오후마다 빨개지는 눈", "보관 용기에서 시작되는 자극", "렌즈가 달라붙는 시간대".

[문체]
${toneGuide}
- 어려운 용어는 반드시 쉬운 비유로 번역.
- 매장 자랑보다 왜 이 선택이 필요한지부터 설명.

[시각 요소]
- 본문 중간에 Markdown 표를 최소 1개 삽입. 표는 3~4행 정도로 짧게 쓰고, 표 앞뒤 문장에서 표 내용을 다시 반복 설명하지 마세요.
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
- 마무리에는 "안경사의 한마디" 형식의 짧은 신뢰 문단을 넣으세요.
- "전문가의 한마디" "전문의 한마디"는 쓰지 말고 반드시 "안경사의 한마디"로 표현하세요.
- 안경사의 한마디는 개인차 인정 → 글의 기준 요약 → 현재 안경/불편 상황 확인 제안 순서로 작성하세요.

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
- "전문가" "전문의" "치료" "진단" "시술" 같은 병원식 표현 금지.

[구조 가이드]
${sectionTemplate}

[출력 형식]
- 제목 1줄 → 빈 줄 → 도입부 3문단 → 본문(소제목 ${sectionCount}개) → 안경사의 한마디 → 매장 안내 순서.
${placeFooterInstruction}
- 본문 markdown만 출력. 코드블록, JSON, 해설문 금지.
- 볼드는 **텍스트** 형식 그대로 유지.

지금부터 최종 글을 작성하세요.`;
}
