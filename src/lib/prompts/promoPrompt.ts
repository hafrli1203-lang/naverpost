import type { Shop, Category, ArticleBrief } from "@/types";

/**
 * 홍보글 프롬프트
 *
 * 4가지 콘텐츠 유형:
 * - blog: 블로그형 (정보형 장문 홍보 글)
 * - event: 행사안내형 (이벤트/프로모션/오픈/시즌 행사 공지)
 * - season: 시즌제안형 (계절/시기별 추천 글)
 * - short: 짧은홍보형 (SNS/문자/배너/알림톡용)
 *
 * 참고 자료:
 * - 사용자 제공 홍보 프롬프트 v2.0
 * - 의료 블로그 PART 1~9 (신뢰 기반 원칙)
 * - 잘 쓴 의료 블로그 100선 (조건부 표현, 소프트 CTA)
 * - 팔리는 블로그 공략집 (권위→근거→행동)
 */

export type PromoSubtype = "blog" | "event" | "season" | "short";
export type PromoTone = "business" | "friendly" | "expert";

type CharCountType = 1000 | 1500 | 2000 | 2500;

function getPromoToneGuide(tone: PromoTone): string {
  switch (tone) {
    case "friendly":
      return `- 따뜻하고 친근한 이웃집 안경사 톤
- "~거든요" "~이에요" "~랍니다" "~죠" 등 다정한 구어체
- 고객의 생활 속 불편에 깊이 공감하는 말투
- 소제목도 부드럽고 친근하게 작성`;
    case "expert":
      return `- 전문적이고 명확한 설명체
- "~해요" "~합니다" "~하거든요" 등 신뢰감 있는 구어체
- 광학 지식과 현장 경험을 바탕으로 근거 있게 설명
- 소제목은 전문적이고 단정하게 작성`;
    case "business":
    default:
      return `- 신뢰형 실무 안내체 (기본값)
- "~해요" "~하거든요" "~할 수 있어요" 등 구어체
- 결론 → 이유 → 안내 순서로 작성
- 소제목은 본문보다 조금 더 단정하고 명확하게 작성`;
  }
}

function getCharGuideForSubtype(subtype: PromoSubtype, charCount?: CharCountType): string {
  switch (subtype) {
    case "event":
      return "공백 포함 약 700자~1200자 내외";
    case "season":
      return "공백 포함 약 1000자~1600자 내외";
    case "short":
      return "아래 4가지를 함께 작성 (짧은 문안)";
    case "blog":
    default:
      return `공백 포함 약 ${charCount ?? 2000}자 내외 (±10%)`;
  }
}

function buildOutputFormat(subtype: PromoSubtype, shopName: string, charCount?: CharCountType): string {
  switch (subtype) {
    case "event":
      return `[출력 형식 — 행사안내형]
분량: 공백 포함 약 700자~1200자 내외

제목

[행사 핵심 요약]
(행사의 핵심 혜택과 대상을 1문단으로 요약)

[혜택 소개]
(구체적인 혜택 내용 / 사실 정보 기반 / 없는 정보는 [확인 필요] 표시)

[대상 고객 또는 추천 상황]
(어떤 고객에게 왜 의미가 있는지 설명)

[기간 및 참여 안내]
(기간 / 참여 방법 / 유의사항 / 없는 정보는 임의로 만들지 않기)

[부드러운 CTA]
(부담 없는 상담 또는 방문 제안)

[매장 안내]
${shopName}
(방문 시 편안한 상담을 받으실 수 있다는 안내)
(지도 정보가 들어갈 자리)`;

    case "season":
      return `[출력 형식 — 시즌제안형]
분량: 공백 포함 약 1000자~1600자 내외

제목

[계절/시기별 불편 공감]
(이 시기에 고객이 겪는 눈 관련 불편에 공감)

[왜 이런 선택이 필요한지 설명]
(원리→풀이→혜택 3단계로 쉽게 설명)

[추천 포인트]
(상품 또는 상담 포인트 / 신뢰 요소 포함)

[관리 팁]
(계절/시기에 맞는 눈 건강 또는 안경 관리 팁)

[부드러운 CTA]
(부담 없는 상담 또는 방문 제안)

[매장 안내]
${shopName}
(방문 시 편안한 상담을 받으실 수 있다는 안내)
(지도 정보가 들어갈 자리)`;

    case "short":
      return `[출력 형식 — 짧은홍보형]

아래 4가지를 함께 작성하세요.

1. 한 줄 헤드라인 3개
(각각 다른 관점에서 핵심 메시지 전달 / 과장 금지)

2. 본문형 카피 1개
(3~5문장의 짧은 홍보 문안 / 정보 70% 홍보 30% / 구어체)

3. 짧은 CTA 3개
(부담 없는 행동 제안 / "지금 바로" "서두르세요" 같은 압박 금지)

4. 핵심 키워드 5개
(네이버 검색에 적합한 키워드 / 해시태그 형식)

※ 짧은 문안이라도 과장 광고처럼 쓰지 마세요.
※ 상호명은 1~2회 이내로만 사용하세요.`;

    case "blog":
    default: {
      const count = charCount ?? 2000;
      const sectionCount = count <= 1000 ? 2 : count <= 1500 ? 3 : count <= 2000 ? 4 : 5;
      return `[출력 형식 — 블로그형]
분량: 공백 포함 약 ${count}자 내외 (±10%)

[도입부] (반드시 3문단으로 작성)
1문단: 고객이 실제로 겪는 불편이나 상황 공감
2문단: 왜 그런 불편이 생기는지 문제 인식
3문단: 오늘 글에서 무엇을 설명할지 안내

[본문] (소제목 ${sectionCount}개)
- 고객 중심 전개: 불편→설명→확인방법→선택기준→사후관리
- 각 소제목 안에서 원리→풀이→혜택 3단계 적용
- 상품 홍보 시 착용 목적과 사용 환경 중심으로 풀어내기
- 필요할 때만 Markdown 표 1개 사용

[결론]
- 핵심 요약 + 한계 인정 또는 개인차 언급
- 부담 없는 CTA (강요 없이 자연스러운 상담 안내)

[매장 안내]
${shopName}
(방문 시 편안한 상담을 받으실 수 있다는 안내)
(지도 정보가 들어갈 자리)`;
    }
  }
}

export function buildPromoPrompt(params: {
  title: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  shop: Shop;
  category: Category;
  topic: string;
  researchData: string;
  charCount?: CharCountType;
  tone?: PromoTone;
  contentSubtype?: PromoSubtype;
  eventName?: string;
  eventPeriod?: string;
  benefitContent?: string;
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
    tone = "business",
    contentSubtype = "blog",
    eventName,
    eventPeriod,
    benefitContent,
    externalReference,
    brief,
  } = params;

  const toneGuide = getPromoToneGuide(tone);
  const charGuide = getCharGuideForSubtype(contentSubtype, charCount);
  const outputFormat = buildOutputFormat(contentSubtype, shop.name, charCount);

  // 행사/프로모션 정보 블록
  const eventInfoBlock = (eventName || eventPeriod || benefitContent)
    ? `
[행사/프로모션 정보]
${eventName ? `행사명: ${eventName}` : "행사명: [확인 필요]"}
${eventPeriod ? `행사 기간: ${eventPeriod}` : "행사 기간: [확인 필요]"}
${benefitContent ? `혜택 내용: ${benefitContent}` : "혜택 내용: [확인 필요]"}
※ 위 정보에 없는 가격/할인율/수량/재고/사은품은 임의로 만들지 마세요.
`
    : "";

  const externalRefSection = externalReference
    ? `
[외부 참고 자료]
${externalReference}
※ 위 자료의 내용을 참고하되 그대로 복사하지 말고 안경원 홍보 관점에서 재해석하여 활용하세요.
※ 자료에 없는 가격/할인율/기간/사은품 등 사실 정보는 임의로 추가하지 마세요.
`
    : "";

  const competitorBlock =
    brief?.competitorMorphology?.status === "available" &&
    (brief.competitorMorphology.commonNouns.length > 0 ||
      brief.competitorMorphology.titleNouns.length > 0)
      ? `- 상위 노출 블로그 공통 명사 (${brief.competitorMorphology.sampleSize}건): ${brief.competitorMorphology.commonNouns.slice(0, 15).join(", ")}
- 상위 노출 블로그 제목 명사: ${brief.competitorMorphology.titleNouns.slice(0, 10).join(", ")}
- 위 명사 중 주제에 맞는 항목만 골라 본문에 자연스럽게 녹이되 문장을 그대로 베끼지 않는다.
`
      : "";

  const internalBriefSection = brief
    ? `
[내부 작성 브리프]
- 제목 활성화 규칙:
${brief.titleMorphologyGuide.map((item) => `  - ${item}`).join("\n")}
- 중복 회피 규칙:
${brief.duplicateAvoidanceRules.map((item) => `  - ${item}`).join("\n")}
- 조사 자료 요약:
${brief.researchSummary}
${competitorBlock}`
    : "";

  // 신뢰 요소 목록 (콘텐츠 유형에 따라 최소 포함 수 다름)
  const trustMinCount = contentSubtype === "event" || contentSubtype === "short" ? 2 : 4;

  return `[역할 설정]
당신은 지역 고객의 시생활과 착용 습관을 이해하고 안경원 상품과 행사와 프로모션을 신뢰감 있게 설명하는 안경원 홍보 콘텐츠 카피라이터입니다.

당신은 단순히 상품을 밀어붙이는 판매자가 아니라 고객이 자신의 사용 목적과 생활 환경에 맞는 선택을 이해하도록 돕는 실무형 안경사 관점으로 말합니다.

안경원은 의료기관이 아니므로 질환 진단이나 치료나 시력 개선을 단정하는 표현을 사용하지 않습니다.
눈 통증이나 갑작스러운 시력 변화처럼 의학적 확인이 필요한 내용은 "안과 검진이 도움이 될 수 있어요" 수준으로만 안내합니다.

[입력 정보]
콘텐츠 유형: ${contentSubtype === "blog" ? "블로그형" : contentSubtype === "event" ? "행사안내형" : contentSubtype === "season" ? "시즌제안형" : "짧은홍보형"}
글의 주제: ${topic}
글의 제목: ${title}
상호명: ${shop.name}
카테고리: ${category.name}
메인 키워드: ${mainKeyword}
서브 키워드1: ${subKeyword1}
서브 키워드2: ${subKeyword2}
${eventInfoBlock}
[조사 자료]
${researchData}
${externalRefSection}
${internalBriefSection}
────────────────────────────────────
[핵심 목표]
────────────────────────────────────
최우선 목표: 고객이 "이곳은 내 사용 환경을 이해하고 설명해주는 안경원"이라고 느끼게 만드는 홍보 콘텐츠를 작성합니다.

성공 기준:
1. 정보 70% 홍보 30%의 균형을 유지한다.
2. 고객 상황과 불편과 선택 기준과 상담 안내가 자연스럽게 연결된다.
3. 상품이나 행사나 프로모션의 핵심 혜택과 조건이 명확하게 전달된다.
4. 광고 압박 없이 신뢰감 있게 읽힌다.
5. CTA는 강요가 아니라 부담 없는 상담 제안으로 마무리된다.

────────────────────────────────────
[작성 지침]
────────────────────────────────────

1. 분량
${charGuide}

2. 톤앤매너
${toneGuide}

쉼표(,) 사용 최소화: 꼭 필요할 때만 최소한으로 사용하세요.
이모지와 과한 느낌표는 사용하지 마세요.
어려운 광학 용어는 반드시 쉬운 말로 풀어쓰세요.
매장 자랑보다 고객이 왜 이 선택이 필요한지부터 설명하세요.

3. 고객 중심 전개 (기본 뼈대)

아래 흐름을 기본으로 사용하되 콘텐츠 유형에 맞게 조절하세요.
- 고객이 겪는 불편이나 상황
- 왜 그런 차이가 생기는지 쉬운 설명
- 매장에서 어떤 방식으로 확인하고 맞추는지
- 렌즈나 테 또는 서비스 선택 기준
- 피팅이나 재조정이나 사후관리의 의미
- 부담 없는 CTA

4. 3단계 설명 방식 (각 소제목 안에서 적용)
1단계 (원리): 왜 불편한지 또는 왜 이 선택이 필요한지 설명
2단계 (풀이): 일상적인 비유나 쉬운 말로 번역
3단계 (혜택): 그래서 어떤 점이 더 편안하게 느껴질 수 있는지 구체적으로 설명

5. 홍보 정보 적용 원칙

- 상품 홍보: 착용 목적과 사용 환경과 렌즈 선택과 피팅과 사후관리 중심으로 풀어내세요.
- 행사 안내: 행사명과 기간과 대상과 혜택과 참여 방법과 유의사항을 우선 정리하세요.
- 시즌 이벤트: 계절이나 시기별 불편과 추천 고객과 선택 포인트와 관리 팁을 중심으로 쓰세요.
- 프로모션: 혜택만 반복하지 말고 어떤 고객에게 왜 의미가 있는지까지 설명하세요.

6. 신뢰 요소 (아래 중 최소 ${trustMinCount}개 이상 자연스럽게 포함)
- 검안 / 도수 확인 / 렌즈 선택 / 테 선택 / 피팅
- 착용 목적 / 사용 환경 / 사후관리 / 재조정
- 고객 유형별 추천 포인트

7. 키워드 사용
- 메인 키워드(${mainKeyword})와 서브 키워드(${subKeyword1} / ${subKeyword2})를 합쳐서 총 5회 이하로 자연스럽게 사용하세요.
- 상호명(${shop.name})은 블로그형에서 2~3회 이내로 자연스럽게 사용하세요.
- 짧은홍보형에서는 상호명 1~2회 이내로만 사용하세요.

8. 사실성과 안전성

- 입력 정보에 없는 자격이나 경력이나 가격이나 할인율이나 사은품이나 기간이나 수량이나 재고를 임의로 추가하지 마세요.
- 사실 정보가 비어 있으면 [확인 필요]라고 표시하거나 자연스럽게 일반 표현으로 처리하세요.
- 실제 후기처럼 꾸민 허구 체험담을 쓰지 마세요.

9. 금지 표현

[절대 금지 단어]
"최고" "최상" "유일" "완벽" "100%" "무조건" "즉시" "압도적" "끝판왕"
"다른 안경원보다 낫다" "타 매장보다 저렴하다"
"시력이 좋아진다" "난시가 해결된다" "블루라이트를 완벽 차단한다"
"눈 질환을 치료한다" "누구에게나 잘 맞는다"
"지금 안 하면 늦는다" 식의 압박 문구

[안전한 대체 표현]
- "해결됩니다" → "도움이 될 수 있어요"
- "편해집니다" → "더 편안하게 느껴질 수 있어요"
- "시력이 좋아집니다" → "사용 환경에 맞는 보정에 도움을 줄 수 있어요"
- "완벽 차단" → "사용 목적에 맞게 선택할 수 있어요"
- "무조건 추천" → "이런 경우에 고려해볼 수 있어요"

10. 위싱(Washing) 원칙

- 한 문장 한 메시지: 한 문장에 두 가지 이야기를 담지 마세요.
- 군더더기 삭제: "사실은" "정말로" "확실히" 같은 무의미한 강조어를 쓰지 마세요.
- 리듬감: 짧은 문장과 긴 문장을 섞어 호흡을 조절하세요.
- 반복 구조 금지: 동일 어미 3회 연속 금지.
- 문단은 2~4줄 이내로 유지하세요.

────────────────────────────────────
${outputFormat}
────────────────────────────────────

────────────────────────────────────
[출력 전 자가 점검 — ALL YES 필수]
────────────────────────────────────
1. 의료적 단정 표현이 없는가?
2. 행사 기간과 혜택과 조건이 사실 기반으로 적혔는가? (없는 정보를 만들지 않았는가?)
3. 상호명 반복이 과하지 않은가?
4. 광고 문구만 밀어붙이지 않았는가? (정보 70% 홍보 30%)
5. 타깃 고객과 사용 상황이 보이는가?
6. CTA가 부담스럽지 않은가?
7. 키워드가 총 5회 이하로 자연스럽게 분산되었는가?
8. 신뢰 요소가 최소 ${trustMinCount}개 이상 포함되었는가?

하나라도 NO면 수정 후 출력하세요.

제목을 포함하지 말고 본문만 작성해 주세요.`;
}
