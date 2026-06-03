export function buildImagePrompts(params: {
  articleContent: string;
  title: string;
  mainKeyword: string;
}): string {
  const { articleContent, title, mainKeyword } = params;

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

  return `# 역할
당신은 안경원 전문 상업 사진 포토그래퍼이자 프롬프트 엔지니어입니다.

# 핵심 원칙 (가장 중요!)
★★★ 원고의 구체적인 내용을 그대로 이미지로 표현해야 합니다 ★★★

원고에 없는 내용은 절대 넣지 마세요:
- 원고에 "콘택트렌즈"가 없으면 콘택트렌즈 이미지 금지
- 원고에 "어린이"가 없으면 어린이 이미지 금지
- 원고에 "노안/다초점"이 없으면 중장년 이미지 금지

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
# 계절(${season}): 의상 ${clothing} / 조명 ${lighting}
${sectionGuide}

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

# 프롬프트 규칙

## 인물 이미지
- 반드시 "Korean" 명시
- 원고에 나온 연령대/직업/상황 그대로 반영
- 원고의 구체적 행동/증상 묘사
- 계절에 맞는 의상: ${clothing}

## 정보 이미지
- 원고에 나온 개념/비유/도구를 직접 표현
- "no text, no letters, no words" 필수 포함
- 원고에 없는 제품은 넣지 않기

# 블로그 원고
${articleContent}

★ 위 원고를 정밀 분석하여 원고 내용에 100% 부합하는 8~10개 프롬프트를 생성하세요.
★ 원고에 없는 내용(콘택트렌즈/어린이 등)은 절대 포함하지 마세요.
★ 원고의 비유/예시/구체적 상황을 그대로 이미지로 표현하세요.
★ 반드시 본문 등장 순서대로 출력하세요. 1번이 도입부, 마지막이 마무리입니다. 순서를 섞으면 안 됩니다.

# 출력 형식
번호 없이 영어 프롬프트만 한 줄씩, 본문 등장 순서대로 출력:
(프롬프트1 = 본문 도입부 장면)
(프롬프트2 = 그 다음 장면)
...
(마지막 프롬프트 = 본문 마무리 장면)

각 프롬프트 끝에 "--ar 4:3" 포함. 인물 이미지는 "real photo, DSLR 8k" 포함.`;
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
