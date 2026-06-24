import type { SceneTag } from "@/lib/data/shopRefs";

export type ImagePromptShop = {
  name: string;
  interiorDescription?: string;
};

/** 프롬프트 줄 앞 장면 태그 매칭. 구버전 [STORE] 도 interior 로 흡수(하위호환). */
const SCENE_MARKER = /^\s*\[(?:SCENE:(exterior|interior|exam|fitting|detail)|(STORE))\]\s*/i;

/**
 * 프롬프트 한 줄에서 장면 태그를 떼어내 { prompt, scene } 로 분리.
 * 태그 없으면 scene=null (매장 밖/개념 이미지 → 참조사진 미첨부).
 */
export function parseScenePrompt(line: string): { prompt: string; scene: SceneTag | null } {
  const match = line.match(SCENE_MARKER);
  if (!match) return { prompt: line.trim(), scene: null };
  const prompt = line.replace(SCENE_MARKER, "").trim();
  const scene: SceneTag = match[1] ? (match[1].toLowerCase() as SceneTag) : "interior";
  return { prompt, scene };
}

export function buildImagePrompts(params: {
  articleContent: string;
  title: string;
  mainKeyword: string;
  shop?: ImagePromptShop;
}): string {
  const { articleContent, title, mainKeyword, shop } = params;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  let season: string;
  let seasonKr: string;
  let clothing: string;
  let lighting: string;

  if (month >= 3 && month <= 5) {
    season = "Spring"; seasonKr = "봄";
    clothing = "light trench coat, pastel cardigan, cotton blouse";
    lighting = "bright spring daylight";
  } else if (month >= 6 && month <= 8) {
    season = "Summer"; seasonKr = "여름";
    clothing = "short sleeves, linen shirt, light summer dress";
    lighting = "bright natural summer light";
  } else if (month >= 9 && month <= 11) {
    season = "Autumn"; seasonKr = "가을";
    clothing = "knit sweater, light wool coat, earth-tone layers";
    lighting = "warm golden hour light";
  } else {
    season = "Winter"; seasonKr = "겨울";
    clothing = "thick wool coat, warm knitwear, turtleneck, scarf";
    lighting = "warm indoor lighting, soft cozy glow";
  }

  // 소제목 추출
  const sections = extractSections(articleContent);
  const sectionGuide = sections.length > 0
    ? `\n\n## 원고의 주요 소제목:\n${sections.map(s => `- "${s}"`).join("\n")}`
    : "";

  const defaultInterior =
    "modern, bright, clean Korean eyewear store interior; wall-mounted backlit display shelves with neat orderly rows of frames (no text labels); warm white LED lighting; polished floor; tidy fitting counter with a mirror; premium but approachable atmosphere";
  const interior = shop?.interiorDescription?.trim() || defaultInterior;
  const shopGuide = shop
    ? `\n\n# 실제 매장 반영 (매우 중요 — "읽어서 반영", 합성 아님)
- 매장 이름: ${shop.name}
- 이 안경원의 실제 분위기/인테리어(실제 사진을 읽어 정리한 묘사): ${interior}
- 매장 내부가 보이는 장면은 위 묘사를 반영해 "이 매장의 현재 모습"으로 그리세요. 가상의 허름한 안경원이 아닙니다.
- 단, 위 묘사를 그대로 베껴 붙이는 게 아니라 "이런 느낌의 매장"으로 한 장의 자연스러운 사진을 새로 만드세요. 콜라주·합성·사진 짜깁기 느낌이 나면 안 됩니다(single cohesive photograph, not a composite/collage).
- 위 묘사의 "고유 특징"(예: 콘택트렌즈 벽장, 카운터 형태, 천장·조명 방식, 백라이트 진열장, 색 포인트)은 살려서 그 매장답게 그리세요. 단 간판·로고·안내문의 "글자"는 형태와 색으로만 표현하고 읽히는 문자·브랜드명은 절대 넣지 마세요(색·형태 OK, 글자 NO).`
    : "";

  return `# 역할
당신은 안경원 전문 상업 사진 포토그래퍼이자 프롬프트 엔지니어입니다.

# 핵심 원칙 (가장 중요!)
★★★ 원고의 구체적인 내용을 그대로 이미지로 표현해야 합니다 ★★★

원고에 없는 내용은 절대 넣지 마세요:
- 원고에 "콘택트렌즈"가 없으면 콘택트렌즈 이미지 금지
- 원고에 "어린이"가 없으면 어린이 이미지 금지
- 원고에 "노안/다초점"이 없으면 중장년 이미지 금지

# 시대·환경 고정 (전역 — 절대 규칙)
★★★ 모든 이미지는 "현재의 대한민국, 2020년대"입니다 ★★★
- 모든 장면에 "present-day South Korea, modern contemporary 2020s, clean and well-maintained" 의미를 담으세요.
- 다음은 절대 금지: vintage, retro, 1990s, old-fashioned, faded film look, sepia, run-down, shabby, dusty, developing-country look, poor lighting.
- 안경원·거리·실내 모두 현대적이고 깔끔한 한국의 현재 모습이어야 합니다.

# 인종 — 절대 규칙 (어김 금지)
★★★ 모든 인물은 예외 없이 한국인(동아시아 한국인)입니다 ★★★
- 사람이 등장하는 모든 프롬프트에 "Korean person, East Asian Korean ethnicity"를 반드시 넣으세요.
- 서양인/백인/외국인 얼굴은 절대 금지. "absolutely not Western, not Caucasian, not foreign" 를 인물 프롬프트에 포함하세요.
- 한 명이든 여러 명이든, 배경에 스쳐 지나가는 사람이든 전부 한국인이어야 합니다.

# 동작 사실성 — 절대 규칙 (어김 금지)
★★★ 사람의 동작은 실제 안경원에서 하는 방식과 100% 일치해야 합니다 ★★★
- 안경 피팅/조정: 안경사가 안경테를 "손에 들고 얼굴에서 떨어뜨려" 조정합니다. 공구(피팅 플라이어)는 안경테에만 사용합니다.
  → 절대 금지: 손님 얼굴에 쓴 안경에 공구를 들이대는 장면, 얼굴 가까이에서 공구를 쓰는 장면.
  → 올바른 표현: "optician holding the eyeglass frame in both hands, away from anyone's face, gently adjusting the temple arms with fingers or small frame-fitting pliers applied only to the frame itself"
- 안경 착용 체험: 손님이 거울 앞에서 직접 안경을 써보는 장면은 자연스럽습니다(이때는 공구 없음).
- 검안/시력검사 ([SCENE:exam]): 손님이 검안의자에 앉은 장면이면, 검안기(포롭터/자동굴절검사기)가 반드시 손님 얼굴 정면 정위치에 와 있어야 합니다.
  → 절대 금지: 손님은 앉아 있는데 검안기/테이블이 옆으로 빠져 있거나 손님 정면이 텅 비어 있는 장면.
  → 올바른 표현: "the refractor/phoropter is pulled directly in front of the seated customer's face, customer resting chin and forehead on the instrument looking into it, optician seated on the round stool beside operating it"
  → (실제 검안기는 평소 옆 암(arm)에 접어두지만, 검사 중에는 손님 정면으로 끌어와 사용합니다. 사람이 앉은 장면 = 반드시 사용 중 정위치.)
- 피팅/상담 ([SCENE:fitting]): 손님과 안경사가 피팅 카운터/상담 테이블에 마주 앉아 진행합니다. 안경사는 안경테를 손에 들고 조정.
  → 피팅 테이블이 사진/묘사에 없으면 매장 톤에 맞는 깔끔한 현대식 피팅 카운터(거울 포함)를 자연스럽게 그려도 됩니다.
- 그 외 모든 행동도 물리적으로 말이 되어야 하며, 실제 시술/상담 장면과 어긋나면 안 됩니다.

# 안경 형태 정확도 — 절대 규칙 (왜곡 금지, 매우 중요)
★★★ 안경은 AI가 가장 망치기 쉬운 물체입니다. 일그러진 안경테·코받침은 즉시 가짜 티가 나서 글 전체 신뢰를 깎습니다 ★★★
- 안경테와 렌즈는 항상 "좌우 대칭, 두 렌즈 크기·모양 동일, 매끈한 직선/곡선". 찌그러지거나 녹아내린 듯한 형태, 비대칭 렌즈, 휜 다리 금지.
- ★★★ 안경 "부품의 초접사(extreme macro close-up)"는 절대 만들지 마세요 ★★★
  → 코받침(노즈패드)·힌지(경첩)·나사·브릿지 등 작은 부품만 화면 가득 채우는 매크로 컷은 AI가 기괴하게 뭉갭니다(가장 큰 실패 — 실제로 코받침이 녹은 링처럼 나옴).
  → 코받침 자국·눌림·부품 등 "작은 부위"를 다뤄야 하면 매크로 대신 아래로 대체하세요:
     (a) 사람이 콧등(코 옆)을 손가락으로 만지거나 살피는 장면,
     (b) 완성된 안경을 정면에서 평범한 거리로 책상·선반에 둔 컷(부품이 아니라 안경 전체가 보이게),
     (c) 거울 앞에서 안경을 써보거나 벗는 착용 장면.
- 손에 든 안경은 "정면을 향해 평평하게" 잡아 테 전체가 자연스럽게 보이게 하세요. 비스듬한 극단 각도로 들면 테가 비틀려 왜곡됩니다.
- 안경이 등장하는 모든 프롬프트에 다음 의미를 넣으세요:
  "eyewear rendered with correct symmetric undistorted geometry, both lenses equal size and properly shaped, clean even frame lines, realistic intact nose pads, no warped/melted/asymmetric frame, no malformed nose pads or hinges; show the glasses at a normal viewing distance, not an extreme macro of small parts"

# 원고 분석 방법

## 1단계: 핵심 키워드 추출
원고에서 다음을 찾으세요:
- 주인공 (나이/직업/상황)
- 문제/증상 (어지럼증/두통/피로 등)
- 원인 (축 오차/도수 문제 등)
- 해결책 (검사 방법/교정 등)
- 비유/예시 (원고에 나온 비유 그대로 사용)

## 2단계: 원고 내용 → 이미지 변환
원고의 각 단락/문장을 이미지로 변환하세요:
- "컴퓨터 화면 볼 때 어지럽다" → 컴퓨터 앞에서 어지러워하는 장면
- "축이 15도 어긋남" → 검안 장면/축 측정 장면
- "럭비공처럼 찌그러진" → 럭비공 모양 비유 이미지
- "수동 검영법" → 수동 검영 검사 장면

# 오늘 날짜: ${year}년 ${month}월 (${seasonKr})
# 계절(${season}): 의상 ${clothing} / 조명 ${lighting}${shopGuide}${sectionGuide}

# 블로그 제목: ${title}
# 메인 키워드: ${mainKeyword}

# 이미지 순서 (가장 중요!)
★★★ 원고를 처음부터 끝까지 "읽는 순서 그대로" 따라가며 이미지를 만드세요 ★★★
- 1번 프롬프트 = 원고에서 가장 먼저 나오는 장면(보통 도입부)
- 그 다음부터는 소제목/문단이 등장하는 순서대로 한 구간에 1~2개씩 배치
- 마지막 프롬프트 = 원고의 마지막 장면(마무리)
- 절대 순서를 섞지 마세요. 위 "원고의 주요 소제목" 순서와 동일한 본문 흐름으로 나열합니다.
- N번째 이미지는 본문에서 N번째로 등장하는 내용을 그려야 합니다(삽입 위치가 맞아야 함).

# 이미지 구성
- 총 8~10개. 각 구간마다 인물 이미지와 정보 이미지를 본문 내용에 맞게 섞되, "본문 등장 순서"를 항상 우선합니다.
- 인물 이미지: 원고 주인공/상황에 맞는 한국인
- 정보 이미지: 원고에 나온 개념/도구/비유

# 현실성 원칙 (실사 톤 — 매우 중요)
★★★ "현대 한국 안경원에서 좋은 조명으로 스마트폰/미러리스로 깔끔하게 찍은 실제 사진"처럼 보여야 합니다 ★★★
- 목표 질감: clean, sharp, bright, true-to-life natural color, well-lit. 네이버 플레이스나 인스타에 올라오는 실제 매장 사진 느낌.
- 두 극단을 모두 피하세요:
  (1) 과한 보정 스톡사진 — glossy plastic skin, airbrushed, flawless, perfect symmetry, glamour, 8k hyperdetailed (금지)
  (2) 낡은 필름룩 — 35mm film, grain, faded, sepia, vintage filter, low light (금지)
- 자연스러운 실사: 적당한 피부 질감(모공이 살짝 보이되 깨끗), 자연스러운 표정, 평범하고 호감가는 보통 사람.

# 글자 금지 (전역 — 매우 중요, AI 티 1순위)
★★★ 이미지 안에 "글자"가 보이면 안 됩니다 ★★★
- AI는 간판·진열대·라벨·포스터·가격표에 "깨진 가짜 한글/영어"를 멋대로 박는 버릇이 있습니다. 이게 가장 큰 AI 티입니다.
- 모든 프롬프트에 "no readable text, no letters, no words, no fake signage lettering, no price labels, blank clean shelves and walls" 의미를 넣으세요(읽히는 가짜 글자가 1순위 AI 티).
- 단, 매장 고유의 "브랜드 심볼/마크"는 읽히는 글자가 아니라 도형·형태로 표현되는 경우 허용합니다(읽히는 문자·브랜드명 철자는 여전히 금지). 간판 브랜드명을 정확히 보여야 하는 컷은 AI 생성 대신 실제 매장 사진을 쓰세요.
- 진열대/벽/간판/카드/모니터 화면은 글자 없이 깔끔하게. 안경테만 진열되고 글자 라벨은 없게.

# 프롬프트 규칙

## 인물 이미지 (현대 실사)
- 반드시 "Korean person, East Asian Korean ethnicity, absolutely not Western/Caucasian/foreign" 명시. 광고 모델이 아니라 동네에서 볼 법한 평범하고 자연스러운 한국 사람.
- 원고에 나온 연령대/직업/상황/행동/증상 그대로 반영. 동작은 위 "동작 사실성" 규칙을 반드시 지킬 것.
- 계절에 맞는 의상: ${clothing}
- 아래 영어 표현을 인물 프롬프트에 반드시 포함해 "현대적이고 깔끔한 실제 사진" 질감을 주세요:
  "realistic candid photo of an ordinary relatable Korean person (not a model), bright clean modern lighting, natural true-to-life color, realistic skin texture with subtle natural imperfections, natural relaxed expression, present-day 2020s South Korea, sharp and clear, looks like a real photo taken on a modern phone or mirrorless camera, NOT film, NOT vintage, NOT faded"

## 정보 이미지
- 원고에 나온 개념/비유/도구를 직접 표현
- "no text, no letters, no words" 필수 포함
- 원고에 없는 제품은 넣지 않기
- 정보 이미지도 현대 실사 질감으로: "clean realistic modern photo, bright daylight, true-to-life color, sharp, NOT film, NOT vintage, no glossy CGI look"

## 매장 장면 태그 [SCENE:xxx] (매우 중요)
"매장 안에서 벌어지는 장면" 프롬프트는 줄 맨 앞에 아래 장면 태그 중 하나를 붙이세요. 이 태그로 그 매장의 "실제 사진"을 골라 참조에 첨부합니다(태그가 정확해야 검안 장면에 검안실 사진이 붙습니다).
- "[SCENE:exterior] " : 매장 외관/간판/출입구(밖에서 본 모습)
- "[SCENE:interior] " : 매장 내부 전경/진열장 와이드(진열대·매장 공간이 주인공)
- "[SCENE:exam] " : 검안실/시력검사 장면(포롭터·검안기·검안의자)
- "[SCENE:fitting] " : 피팅·상담·조제 카운터 장면(안경 조정, 상담, 콘택트렌즈)
- "[SCENE:detail] " : 매장 안 안경테/선글라스 진열을 "적당한 거리"에서 본 컷(여러 개가 가지런히 보이게). 단일 부품(코받침·힌지)만 화면 가득 채우는 초접사는 금지(왜곡).
규칙:
- 매장 장면에는 위 "실제 매장 반영"의 인테리어 묘사를 반영하세요(밝고 현대적이고 깔끔한 안경원, 벽면 백라이트 진열장, 오픈장·먼지·낡음 금지).
- 매장 장면도 진열대·간판·벽에 "글자 없이" 깔끔하게(no text/labels/signage on shelves). 한 장의 자연스러운 사진(콜라주·합성 금지).
- ★ 매장 "밖" 장면(집·사무실·야외 등 라이프스타일)이나 개념/비유 이미지에는 장면 태그를 절대 붙이지 마세요(매장 사진이 잘못 붙습니다).
- ★ 매장 전경 와이드샷([SCENE:interior]/[SCENE:exterior])은 "원고가 실제로 매장 안내·위치·방문 권유를 다룰 때만" 마무리에 1장 넣으세요. 원고가 매장 방문/안내를 다루지 않으면 빈 매장 와이드는 아예 넣지 마세요(끝에 매장 사진을 의무적으로 끼워넣지 말 것). 매장 안 장면이 필요하면 [SCENE:fitting](상담·조정)처럼 사람이 있는 장면을 쓰고, 도입부·본문 중간은 라이프스타일·착용·개념 컷으로 채우세요.
- ★★★ [SCENE:exam](검안/시력검사)는 원고가 "시력검사·검안·굴절검사·검영" 같은 검사 '과정 자체'를 실제로 설명할 때만 쓰세요. 단순한 "확인 / 상담 / 도수를 잡아요 / 방문해 보세요" 같은 마무리 권유(CTA)는 검안 장면이 아닙니다 — 이런 경우 [SCENE:exam]를 절대 쓰지 말고 [SCENE:fitting](상담·조정) 또는 [SCENE:interior]/[SCENE:detail]를 쓰세요. 원고에 없는 검사 장면을 지어내면 안 됩니다.
- 인물이 착용/취급하는 "안경"의 종류도 원고 맥락에 맞춰 스스로 판단하세요(케이스를 외우지 말고 글을 읽고 결정): 시력검사·검안 맥락이면 검안용 시험테(trial lens fitting frame), 안경테 선택·완성·일상 맥락이면 완성된 일반 안경(finished prescription eyeglasses). 원고가 다루지 않는 상황은 만들지 마세요.

# 블로그 원고
${articleContent}

★ 위 원고를 정밀 분석하여 원고 내용에 100% 부합하는 8~10개 프롬프트를 생성하세요.
★ 원고에 없는 내용(콘택트렌즈/어린이 등)은 절대 포함하지 마세요.
★ 원고의 비유/예시/구체적 상황을 그대로 이미지로 표현하세요.
★ 반드시 본문 등장 순서대로 출력하세요. 1번이 도입부, 마지막이 마무리입니다. 순서를 섞으면 안 됩니다.
★ 모든 이미지는 현대(2020년대) 한국의 깔끔한 모습. 90년대·필름톤·낡고 허름한 분위기 절대 금지.
★ 사람 동작은 실제 안경원 방식과 일치(피팅은 테를 손에 들고 얼굴에서 떨어뜨려 조정. 검안은 검안기가 앉은 손님 정면 정위치).
★ 이미지 안에 "읽히는 글자/간판텍스트/가격라벨" 금지(no readable text/letters/fake signage) — 깨진 가짜 한글이 AI 티 1순위. (글자 없는 브랜드 심볼 형태는 허용)
★ 안경은 좌우 대칭·비왜곡(찌그러진 테·녹은 코받침·짝짝이 렌즈 금지). 코받침·힌지·나사 같은 작은 부품의 초접사 매크로는 만들지 말고, 사람이 콧등을 만지는 컷·안경을 정면 평면으로 둔 컷·거울 앞 착용 컷으로 대체하세요.
★ 빈 매장 전경 와이드샷은 원고가 매장 안내·방문을 다룰 때만 마무리에 1장. 그렇지 않으면 넣지 마세요(의무 아님).

# 출력 형식
번호 없이 영어 프롬프트만 한 줄씩, 본문 등장 순서대로 출력:
(매장 안 장면이면 줄 앞에 "[SCENE:exterior|interior|exam|fitting|detail] " 중 하나를 붙임. 매장 밖/개념 이미지는 태그 없음)
(프롬프트1 = 본문 도입부 장면)
(프롬프트2 = 그 다음 장면)
...
(마지막 프롬프트 = 본문 마무리 장면)

비율·크기는 시스템이 정사각(1:1)으로 처리하니 프롬프트에 비율 표기(--ar 4:3 등 미드저니 문법)를 절대 넣지 마세요.
인물 이미지에는 위 현대 실사 표현(realistic candid photo, bright clean modern lighting, true-to-life color, present-day 2020s, NOT film/vintage)을 넣어 진짜 찍은 사진처럼 만드세요. 과하게 선명하고 매끈한 스톡사진 표현, 그리고 낡은 필름룩 모두 쓰지 마세요.`;
}

function extractSections(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // # 또는 ## 으로 시작하는 제목
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      const t = headingMatch[1].trim();
      if (t.length > 0 && t.length < 50) sections.push(t);
      continue;
    }
    // 숫자. 으로 시작하는 소제목
    const numMatch = line.match(/^\d+[.)]\s*(.+)/);
    if (numMatch) {
      const t = numMatch[1].trim();
      if (t.length > 2 && t.length < 50) sections.push(t);
      continue;
    }
    // **굵은 글씨** 소제목
    const boldMatch = line.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      const t = boldMatch[1].trim();
      if (t.length > 2 && t.length < 50) sections.push(t);
    }
  }

  return sections.slice(0, 10);
}
