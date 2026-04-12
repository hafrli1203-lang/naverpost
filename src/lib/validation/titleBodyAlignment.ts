import type { AnalysisIssue, StructureActivationAnalysis } from "@/types";

const TABLE_REGEX = /\|[\s]*:?---|\|.*\|.*\|/;
const QUOTE_REGEX = /(^|\n)\s*>\s+.+/;
const IMAGE_CAPTION_REGEX =
  /!\[[^\]]+\]\([^)]+\)|<figcaption[^>]*>[\s\S]*?<\/figcaption>|\[캡션[:\]]/i;
const ATTACHMENT_REGEX =
  /[A-Za-z0-9가-힣_-]+\.(pdf|docx|xlsx|zip|png|jpg|jpeg|webp|pptx)/i;

function extractKeywordCoverage(
  text: string,
  candidates: string[]
): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (text.includes(candidate)) {
      covered.push(candidate);
    } else {
      missing.push(candidate);
    }
  }

  return { covered, missing };
}

export function analyzeTitleBodyAlignment(params: {
  title: string;
  content: string;
  keywords?: string[];
}): StructureActivationAnalysis {
  const combinedCandidates = [params.title, ...(params.keywords ?? [])].filter(Boolean);
  const { covered, missing } = extractKeywordCoverage(
    params.content,
    combinedCandidates
  );

  const hasTableText = TABLE_REGEX.test(params.content);
  const hasQuoteText = QUOTE_REGEX.test(params.content);
  const hasCaptionText = IMAGE_CAPTION_REGEX.test(params.content);
  const hasAttachmentText = ATTACHMENT_REGEX.test(params.content);

  const alignmentNotes: string[] = [];
  const issues: AnalysisIssue[] = [];

  if (covered.length > 0) {
    alignmentNotes.push(`본문에서 활성화된 제목/키워드 요소: ${covered.join(", ")}`);
  }

  if (missing.length > 0) {
    issues.push({
      code: "missing-title-body-activation",
      label: "제목-본문 활성화 부족",
      reason: `본문에서 확인되지 않는 제목/키워드 요소: ${missing.join(", ")}`,
      severity: "high",
      source: "local-content",
    });
  }

  if (!hasTableText) {
    issues.push({
      code: "missing-table-text",
      label: "표 텍스트 없음",
      reason:
        "문서 기준상 표 안 텍스트는 실제 반영 요소입니다. 현재 원고에는 표 텍스트가 없습니다.",
      severity: "low",
      source: "document-rule",
    });
  }

  return {
    titleKeywordCoverage: covered,
    missingTitleKeywordCoverage: missing,
    hasTableText,
    hasQuoteText,
    hasCaptionText,
    hasAttachmentText,
    alignmentNotes,
    issues,
  };
}
