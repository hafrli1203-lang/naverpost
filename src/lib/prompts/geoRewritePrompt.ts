import type { ArticleContent, GeoRecommendation, ResearchCitationEntry } from "@/types";
import {
  PROHIBITED_WORDS,
  CAUTION_PHRASES,
  WORD_REPLACEMENTS,
} from "@/lib/validation/prohibitedWords";

type RecommendationId = GeoRecommendation["id"];

export interface BuildGeoRewritePromptOptions {
  article: ArticleContent;
  selectedIds?: RecommendationId[];
  targetScore?: number;
  retryFeedback?: string;
}

function formatCitationEntries(citations: ResearchCitationEntry[]): string {
  return citations
    .map((c) => {
      const yearPart = c.year ? ` (${c.year})` : "";
      return `- ${c.institution}${yearPart}: ${c.fact}`;
    })
    .join("\n");
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

function buildTransformRequirements(selectedIds: Set<RecommendationId>): string[] {
  const items: string[] = [];

  if (selectedIds.has("question-heading")) {
    items.push(
      [
        "1) 소제목 질문형 변환 (필수)",
        "   - 본문 소제목(`## `)을 4~5개 유지하되, **반드시 3개 이상을 질문형**으로 다시 쓰세요.",
        "   - 질문형 어미: `~인가요?`, `~하나요?`, `~무엇인가요?`, `~어떻게 다른가요?`, `~얼마나 유지되나요?` 등",
        '   - 예: "## 수술이 접근하는 층, 시술이 닿는 층" → "## HIFU와 안면거상술은 어떤 층을 치료하나요?"',
        "   - 소제목만 질문형으로 바꾸는 것이며 **그 밑 본문 문단은 그대로 유지**합니다.",
        "   - 소제목의 핵심 주제는 원문 소제목이 가리키던 주제와 동일해야 합니다. 주제를 바꾸지 마세요.",
      ].join("\n")
    );
  }

  if (selectedIds.has("direct-answer-lead")) {
    items.push(
      [
        "2) 섹션별 핵심 답변 삽입",
        "   - 각 소제목 바로 다음 줄에 40~80자 범위의 핵심 답변 한 문장을 삽입하세요.",
        "   - 이 문장은 **해당 섹션 본문이 이미 말하고 있는 내용을 한 문장으로 요약**한 것이어야 합니다. 새 정보·새 주장 추가 금지.",
        '   - 절대 "핵심 답변:" 리터럴로 시작하지 마세요. 자연스러운 평서문 한 문장.',
        "   - 직답 문장 삽입 후에도 기존 본문 문단은 그대로 유지합니다. 직답을 본문 위에 얹는 방식입니다.",
        "   - 이미 섹션 첫 문장이 40~80자 요약을 만족하면 재작성하지 않습니다.",
      ].join("\n")
    );
  }

  if (selectedIds.has("comparison-table")) {
    items.push(
      [
        "3) 비교 테이블 삽입",
        "   - 본문 중간(도입 이후, 마지막 섹션 이전)에 markdown 비교표 1개를 추가하세요.",
        "   - 3~4열, 헤더 포함 4~6행. **표의 내용은 본문에서 이미 비교·대조하고 있는 수치·기준만 정리**하세요. 본문에 없는 숫자를 새로 만들거나 기준을 추가하지 마세요.",
        "   - 이미 본문에 표가 있으면 추가하지 않습니다.",
        "   - 표 앞에는 짧은 도입 문장 한 줄을 둡니다.",
      ].join("\n")
    );
  }

  if (selectedIds.has("soften-claims")) {
    items.push(
      [
        "4) 단정 표현 완화",
        "   - 100%, 무조건, 반드시, 완벽하게, 완벽히 대체 같은 확정 표현만 정확히 교체하세요.",
        "   - 교체 외에 문장의 의미나 근거를 바꾸지 마세요.",
      ].join("\n")
    );
  }

  if (selectedIds.has("remove-template-blocks")) {
    items.push(
      [
        "5) 레거시 GEO 블록 제거",
        '   - "## FAQ", "## 자주 묻는 질문", "## 확인 및 안내", "## 참고 및 확인 포인트"로 시작하는 하단 부속 섹션은 본문에서 완전히 삭제합니다.',
        '   - "핵심 답변:" 으로 시작하는 모든 줄을 삭제합니다.',
        "   - 제거한 섹션의 정보는 이미 위쪽 본문에 있으므로, 억지로 병합하지 마세요.",
      ].join("\n")
    );
  }

  if (selectedIds.has("remove-cliches")) {
    items.push(
      [
        "7) 상투적 표현 정돈",
        "   - 다음 상투어가 있으면 자연스러운 다른 표현으로 바꿔 주세요: \"많은 분들이\", \"요즘 들어\", \"바쁜 일상\", \"누구나 한 번쯤\", \"고민이 많으신\", \"정보를 정리해 드릴게요\".",
        "   - 상투어가 포함된 문장 **전체를 자연스럽게 재구성**하세요. 단순 삭제로 어색한 문장을 남기지 마세요.",
        "   - 문장의 뜻·정보·수치는 그대로 유지. 표현만 덜 진부하게 바꾸기.",
        "   - 원문의 톤·구어체·어미는 유지하세요.",
      ].join("\n")
    );
  }

  if (selectedIds.has("add-expert-quote")) {
    items.push(
      [
        "8) 전문가 따옴표 인용 1건 추가",
        "   - 본문 1~2 곳에 대한안경사협회·대한안과학회·식약처·한국소비자원 같은 **권위 기관의 권고/기준**을 직접 인용 따옴표로 삽입합니다.",
        "   - 형식 예: '대한안경사협회는 \"6개월에 한 번 피팅 점검을 권장한다\"고 안내하고 있어요.'",
        "   - 따옴표 안 문장은 사용 가능한 자료에 명시된 사실만 사용. **지어내지 마세요.**",
        "   - 1건이면 충분합니다. 여러 번 반복하지 마세요.",
        "   - 문단 흐름을 끊지 않는 자연스러운 위치에 삽입하세요.",
      ].join("\n")
    );
  }

  return items;
}

function buildCitationRequirement(citations: ResearchCitationEntry[]): string {
  if (citations.length === 0) {
    return [
      "6) 출처 인용 추가",
      "   - 인용할 구체 자료가 전달되지 않았습니다. **없는 자료를 지어내지 말고** 이 항목은 건너뜁니다.",
      "   - 기관명·연도·수치를 허구로 만들지 마세요.",
    ].join("\n");
  }

  return [
    "6) 출처 인용 추가",
    "   - 아래 자료 중 본문 주제에 맞는 1~2건만 선택해 본문 문단에 자연스럽게 녹이세요.",
    "   - 인용 형식 예: \"한국소비자원에서 2024년 발표한 자료에 따르면 ~\" 같은 자연스러운 도입구를 사용합니다.",
    "   - 학술 각주([1], URL 직접 삽입, 본문 말미 참고 목록)는 모두 금지. 본문 문장 속에만 녹입니다.",
    "   - 같은 기관을 여러 번 반복 인용하지 마세요.",
    "   - 자료가 본문 주제와 어색하게 맞으면 인용하지 않습니다. 억지로 끼워넣지 마세요.",
    "   - 인용 삽입 후에도 본문 구어체·설명체 톤이 그대로 유지되어야 합니다.",
    "",
    "   [사용 가능한 자료]",
    formatCitationEntries(citations)
      .split("\n")
      .map((line) => `   ${line}`)
      .join("\n"),
  ].join("\n");
}

function formatRetryFeedback(feedback: string | undefined): string {
  if (!feedback?.trim()) return "";
  return [
    "# 이전 시도 피드백 (반드시 반영)",
    feedback.trim(),
    "",
    "위 지적을 이번 시도에서 확실히 해소해 주세요. 다른 요구사항은 동일합니다.",
    "",
    "",
  ].join("\n");
}

export function buildGeoRewritePrompt(options: BuildGeoRewritePromptOptions): string {
  const { article, selectedIds = [], targetScore = 90, retryFeedback } = options;
  const selectedSet = new Set<RecommendationId>(selectedIds);
  const requirements = buildTransformRequirements(selectedSet);
  if (selectedSet.has("add-source-citation")) {
    requirements.push(buildCitationRequirement(article.citations ?? []));
  }
  const requirementBlock =
    requirements.length > 0
      ? requirements.join("\n\n")
      : "- 본문의 주제·키워드·매장 정보를 유지한 채, AI 인용 구조만 자연스럽게 정돈해 주세요.";

  const retryBlock = formatRetryFeedback(retryFeedback);
  const prohibitedBlock = PROHIBITED_WORDS.join(" / ");
  const cautionBlock = CAUTION_PHRASES.join(" / ");
  const replacementsBlock = buildReplacementsBlock();

  return `당신은 네이버 블로그 본문을 AI 검색(Generative Engine) 인용에 유리하게 재작성하는 전문 편집자입니다.

${retryBlock}# 목표
원문의 **주제·뜻·내용·논리·사실 관계**를 그대로 유지하면서, AI가 이 글을 질문에 대한 답으로 뽑아 쓰기 쉬운 구조로 본문을 자연스럽게 재작성합니다. GEO 점수 ${targetScore}점 이상을 목표로 합니다.

# 본문 내용 보존 (최우선 원칙)
- **원문의 의미를 왜곡하지 마세요.** 주장·근거·수치·예시·비교 결과를 바꾸면 안 됩니다.
- **본문 문단의 설명 내용은 최대한 그대로 유지**합니다. 문장을 다듬거나 합치는 정도만 허용.
- 소제목과 섹션 첫 줄(직답)은 새로 쓸 수 있지만, **그 밑의 기존 설명 문단은 그대로 두고** 그 위에 얹는 방식으로 씁니다.
- 원문에 없던 정보·사례·숫자·주장을 새로 만들어 넣지 마세요.
- 원문이 가진 톤·설명체·구어체를 유지합니다.
- 제목은 바꾸지 마세요.
- 매장명·업종·메인 키워드·서브 키워드는 모두 자연스럽게 유지합니다.

# 글자수 유지 (중요)
- **결과물 글자수는 원문 대비 ±15% 이내로 유지하세요.** 문장을 덧붙여 본문을 부풀리지 마세요.
- 직답·인용을 추가할 때는 기존 도입부의 일부를 줄이거나 중복되는 설명을 정돈해 균형을 맞추세요.
- 한 섹션에 직답 + 기존 도입부 + 인용이 모두 들어가서 중복이 생기면 기존 도입 문장을 간결하게 줄입니다.

# 자연스러움 (매우 중요)
- 결과물은 사람이 쓴 글처럼 매끄럽고 읽기 편해야 합니다. 기계적 반복·딱딱한 기술 문서 투 금지.
- 질문형 소제목을 만들 때도 한국어로 자연스러운 어미 ("~인가요?", "~하나요?", "~어떻게 다른가요?")를 사용하고 어색한 직역체 금지.
- 직답 문장은 해당 섹션 본문 첫 문단과 자연스럽게 이어져야 합니다. 갑자기 결론만 던지는 딱딱한 문장 금지.
- 문장 호흡을 유지하세요. 짧은 요약문과 긴 설명을 교차 배치하면 더 자연스럽습니다.

# 금지 사항
- 하단에 "## FAQ", "## 자주 묻는 질문", "## 확인 및 안내", "## 참고 및 확인 포인트" 같은 부속 블록을 덧붙이지 마세요. 원문에 있다면 오히려 제거합니다.
- "핵심 답변:" 리터럴 문장 시작을 절대 쓰지 마세요.
- 본문 끝에 "YYYY-MM-DD 기준" 같은 기준일 메타 문장을 삽입하지 마세요.
- 본문을 통째로 새 글로 바꾸지 마세요. 구조만 정돈하고 살만 붙이는 수준입니다.

# 금지 단어 (본문에 절대 사용 금지)
${prohibitedBlock}

# 주의 표현 (사용 시 반드시 순화)
${cautionBlock}

# 대체 표현 가이드
${replacementsBlock}

# 형식 금지
- 이모지와 특수 기호(✔ ✅ ☑ ■ ● 📌 🔸 💡 등)로 시작하는 줄 금지.
- 체크리스트·체크박스 형태의 불릿 리스트 금지.
- "첫째, 둘째, 셋째" 기계적 나열 금지.
- 번호 순서 목록(1. 2. 3.)을 본문 설명에 사용 금지. 설명은 문장으로 풀어쓰세요.
- 숫자 단순 나열 금지. 글로 자연스럽게 풀어쓰기.
- 쉼표(,)는 최소화. 접속사와 연결 어미로 문장을 이어가세요.

# 반영해야 할 변환 (요청된 항목만 수행)
${requirementBlock}

# 공통 요구사항
- "## " 소제목 4~5개 유지
- 본문에 "공식 가이드", "제품 설명서", "관리 가이드" 같은 중립적 레퍼런스 표현이 자연스럽게 드러나도록 하세요. 단 "전문가 점검", "상담" 등 위 금지어에 해당하는 표현은 쓰지 마세요.
- 매장명과 업종이 본문에 자연스럽게 드러나야 합니다.
- 마지막 문단은 매장 안내가 자연스럽게 이어지도록 정리합니다.

# 출력 형식
- 완성된 본문만 출력하세요.
- 제목은 출력에 포함하지 마세요 (본문만).
- 코드블록, JSON, 설명문, 주석 없이 본문 markdown 그대로 출력하세요.

[제목 (수정 금지)]
${article.title}

[메인 키워드]
${article.mainKeyword}

[서브 키워드]
${article.subKeyword1}
${article.subKeyword2}

[매장명]
${article.shopName}

[업종]
${article.category}

[원문]
${article.content}`;
}
