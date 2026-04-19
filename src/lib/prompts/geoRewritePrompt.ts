import type { ArticleContent, GeoRecommendation } from "@/types";

type RecommendationId = GeoRecommendation["id"];

export interface BuildGeoRewritePromptOptions {
  article: ArticleContent;
  selectedIds?: RecommendationId[];
  targetScore?: number;
  retryFeedback?: string;
}

const TODAY = "2026-04-19";

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

  return items;
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
  const requirementBlock =
    requirements.length > 0
      ? requirements.join("\n\n")
      : "- 본문의 주제·키워드·매장 정보를 유지한 채, AI 인용 구조만 자연스럽게 정돈해 주세요.";

  const retryBlock = formatRetryFeedback(retryFeedback);

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

# 금지 사항
- 하단에 "## FAQ", "## 자주 묻는 질문", "## 확인 및 안내", "## 참고 및 확인 포인트" 같은 부속 블록을 덧붙이지 마세요. 원문에 있다면 오히려 제거합니다.
- "핵심 답변:" 리터럴 문장 시작을 절대 쓰지 마세요.
- 단정·과장 표현 금지: 100%, 무조건, 반드시, 완벽하게, 완벽히 대체.
- 본문을 통째로 새 글로 바꾸지 마세요. 구조만 정돈하고 살만 붙이는 수준입니다.

# 반영해야 할 변환 (요청된 항목만 수행)
${requirementBlock}

# 공통 요구사항
- "## " 소제목 4~5개 유지
- 본문 중 최소 2회는 다음 계열 표현을 자연스럽게 포함: 공식 가이드 / 공식 자료 / 제품 설명서 / 관리 가이드 / 전문가 점검 / 상담 / 검사
- 본문에 정확한 기준일을 자연스럽게 1회 포함하세요. 형식은 정확히 "${TODAY} 기준".
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
