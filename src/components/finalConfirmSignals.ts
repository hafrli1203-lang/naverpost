import type { PostingAuditResult } from "@/lib/analysis/postingAudit.types";

export interface SeoSignalRow {
  status: "pass" | "check";
  label: string;
  detail: string;
}

/**
 * FinalConfirm의 export 직전 SEO 검수 신호 조립 로직(순수 함수).
 *
 * fail-open 데이터 계약: posting-audit 호출이 실패하거나 결과가 없으면 audit이
 * null로 전달되며, 이때 반드시 빈 배열을 반환한다(신호 없음 → 카드 숨김 →
 * export/copy/download 흐름에 영향 없음). 런타임 동작은 기존 useMemo와 동일하다.
 */
export function buildSeoSignals(audit: PostingAuditResult | null): SeoSignalRow[] {
  if (!audit) return [];
  const rows: SeoSignalRow[] = [];
  const intro = audit.queryIntentFocus.mainKeywordInIntro;
  if (intro !== undefined) {
    rows.push({
      status: intro ? "pass" : "check",
      label: "본문 초반 메인키워드",
      detail: intro
        ? "본문 초반에 메인키워드가 자연스럽게 포함되어 있어요."
        : "첫 문단에서 메인키워드를 자연스럽게 한 번 언급할 수 있는지 확인해보세요.",
    });
  }
  const sub = audit.queryIntentFocus.mainKeywordInSubheading;
  if (sub !== undefined) {
    rows.push({
      status: sub ? "pass" : "check",
      label: "소제목 메인키워드",
      detail: sub
        ? "소제목에 메인키워드가 반영되어 있어요."
        : "소제목 중 한 곳에 메인키워드를 자연스럽게 반영할 수 있는지 확인해보세요.",
    });
  }
  const coverage = audit.subKeywordCoverage;
  if (coverage && coverage.length > 0) {
    const present = coverage.filter((item) => item.present).length;
    rows.push({
      status: present === coverage.length ? "pass" : "check",
      label: "보조 키워드 반영",
      detail: `보조 키워드 ${coverage.length}개 중 ${present}개가 본문에 반영되어 있어요.`,
    });
  }
  return rows;
}
