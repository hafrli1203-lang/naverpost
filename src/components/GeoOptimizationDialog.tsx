"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ArticleContent,
  GeoAnalysisResult,
  GeoOptimizationResult,
  GeoRecommendation,
} from "@/types";

interface GeoOptimizationDialogProps {
  article: ArticleContent;
  isBusy: boolean;
  onRefreshAnalysis?: () => Promise<GeoAnalysisResult | null>;
  onApply: (
    selectedRecommendationIds: GeoRecommendation["id"][]
  ) => Promise<GeoOptimizationResult | null>;
  onApplyAdvanced?: (
    selectedRecommendationIds: GeoRecommendation["id"][]
  ) => Promise<GeoOptimizationResult | null>;
}

function gradeText(grade: GeoAnalysisResult["grade"]): string {
  switch (grade) {
    case "excellent":
      return "매우 좋음";
    case "good":
      return "좋음";
    case "fair":
      return "보통";
    default:
      return "개선 필요";
  }
}

function impactBadgeClass(impact: GeoRecommendation["impact"]): string {
  switch (impact) {
    case "high":
      return "bg-red-100 text-red-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function impactLabel(impact: GeoRecommendation["impact"]): string {
  switch (impact) {
    case "high":
      return "영향 큼";
    case "medium":
      return "영향 중간";
    default:
      return "영향 낮음";
  }
}

function buildGeoResultMessage(result: GeoOptimizationResult): string {
  const before = result.analysisBefore.score;
  const after = result.analysisAfter.score;

  if (after > before) {
    return `GEO 점수가 ${before}점에서 ${after}점으로 올라갔습니다.`;
  }

  if (after < before) {
    return `GEO 점수가 ${before}점에서 ${after}점으로 내려갔습니다.`;
  }

  if (result.appliedRecommendationIds.length === 0) {
    return `GEO 점수는 ${before}점으로 유지됐고, 유의미한 변경은 보류했습니다.`;
  }

  return `GEO 점수는 ${before}점으로 유지됐습니다.`;
}

function buildScoreReasons(
  analysis: GeoAnalysisResult,
  selectedIds: GeoRecommendation["id"][]
): string[] {
  const selected = analysis.recommendations.filter((item) => selectedIds.includes(item.id));
  const lines: string[] = [];

  if (selected.some((item) => item.id === "remove-template-blocks")) {
    lines.push("기계적으로 붙은 FAQ, 핵심 답변, 확인 문구를 걷어내 본문 흐름을 자연스럽게 유지합니다.");
  }
  if (selected.some((item) => item.id === "comparison-table")) {
    lines.push("비교나 기준이 필요한 글은 표를 보강해 AI가 인용하기 쉬운 구조로 만듭니다.");
  }
  if (selected.some((item) => item.id === "soften-claims")) {
    lines.push("과장되거나 단정적인 표현을 완화해 신뢰도 신호를 보강합니다.");
  }
  if (selected.some((item) => item.id === "direct-answer-lead")) {
    lines.push("도입부에서 주제를 더 빨리 설명하도록 정리합니다.");
  }
  if (selected.some((item) => item.id === "question-heading")) {
    lines.push("소제목 구조를 정리해 주제별 구분을 더 선명하게 만듭니다.");
  }

  if (lines.length === 0) {
    lines.push("현재 선택으로는 큰 구조 변화 없이 본문을 유지합니다.");
  }

  return lines;
}

export function GeoOptimizationDialog({
  article,
  isBusy,
  onRefreshAnalysis,
  onApply,
  onApplyAdvanced,
}: GeoOptimizationDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<GeoRecommendation["id"][]>([]);
  const [lastResult, setLastResult] = useState<GeoOptimizationResult | null>(null);
  const analysis = article.geo;

  const recommendationIds = useMemo(
    () => analysis?.recommendations.map((item) => item.id) ?? [],
    [analysis]
  );

  const effectiveSelectedIds = selectedIds.length > 0 ? selectedIds : recommendationIds;
  const scoreReasons = useMemo(
    () => (analysis ? buildScoreReasons(analysis, effectiveSelectedIds) : []),
    [analysis, effectiveSelectedIds]
  );

  async function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const refreshed = onRefreshAnalysis ? await onRefreshAnalysis() : analysis;
      const sourceAnalysis = refreshed ?? analysis;

      if (sourceAnalysis) {
        setSelectedIds(
          sourceAnalysis.recommendations
            .filter((item) => item.selectedByDefault)
            .map((item) => item.id)
        );
      }
    }
    if (!nextOpen) {
      setLastResult(null);
    }
    setOpen(nextOpen);
  }

  function toggleRecommendation(id: GeoRecommendation["id"]) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleApply() {
    const result = await onApply(effectiveSelectedIds);
    if (result) {
      setLastResult(result);
      setOpen(false);
    }
  }

  async function handleApplyAdvanced() {
    if (!onApplyAdvanced) return;
    const result = await onApplyAdvanced(effectiveSelectedIds);
    if (result) {
      setLastResult(result);
      setOpen(false);
    }
  }

  if (!analysis) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => handleOpenChange(true)}
        disabled={isBusy}
        className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
      >
        <Sparkles className="h-4 w-4" />
        GEO 최적화
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          <div className="p-6">
            <DialogHeader className="mb-5">
              <DialogTitle>GEO 최적화</DialogTitle>
              <DialogDescription>{analysis.summary}</DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
              <div className="text-5xl font-semibold text-amber-600">{analysis.score}</div>
              <div className="mt-1 text-sm text-slate-600">
                / 100점, 현재 상태는 {gradeText(analysis.grade)}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {analysis.categories.map((item) => {
                const ratio = Math.round((item.score / item.maxScore) * 100);
                return (
                  <div key={item.key} className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="text-slate-500">
                        {item.score} / {item.maxScore}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-teal-500 transition-all"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">점수 반영 기준</h3>
                <span className="text-xs text-slate-500">
                  선택 항목 {effectiveSelectedIds.length}개
                </span>
              </div>
              <div className="space-y-2">
                {scoreReasons.map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-slate-600">
                    - {reason}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">노출 미리보기</h3>
                <span className="text-xs text-slate-500">
                  근거 표현 {analysis.citationDensityCount}회, {analysis.citationDensityLabel}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-green-600">미리보기 기준 blog.naver.com</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  {analysis.previewTitle}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {analysis.previewDescription}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  적용 가능 항목 ({analysis.recommendations.length}개)
                </h3>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-700"
                  onClick={() =>
                    setSelectedIds(
                      analysis.recommendations.map((recommendation) => recommendation.id)
                    )
                  }
                >
                  전체 선택
                </button>
              </div>

              <div className="space-y-3">
                {analysis.recommendations.map((recommendation) => {
                  const checked = effectiveSelectedIds.includes(recommendation.id);
                  return (
                    <button
                      key={recommendation.id}
                      type="button"
                      onClick={() => toggleRecommendation(recommendation.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        checked
                          ? "border-teal-400 bg-teal-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                                checked
                                  ? "border-teal-500 bg-teal-500 text-white"
                                  : "border-slate-300 bg-white text-slate-500"
                              }`}
                            >
                              {checked ? "✓" : ""}
                            </span>
                            <span className="font-medium text-slate-900">
                              {recommendation.title}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${impactBadgeClass(
                                recommendation.impact
                              )}`}
                            >
                              {impactLabel(recommendation.impact)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">{recommendation.description}</p>
                          <p className="text-xs text-slate-500">{recommendation.reason}</p>
                        </div>
                      </div>

                      {(recommendation.before || recommendation.after) && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="mb-1 text-xs text-slate-500">변경 전</div>
                            <div className="text-sm text-slate-700">
                              {recommendation.before ?? "없음"}
                            </div>
                          </div>
                          <div className="rounded-xl bg-cyan-50 p-3">
                            <div className="mb-1 text-xs text-teal-600">변경 후</div>
                            <div className="text-sm text-slate-700">
                              {recommendation.after ?? "없음"}
                            </div>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isBusy}>
              닫기
            </Button>
            {onApplyAdvanced && (
              <Button
                variant="outline"
                onClick={handleApplyAdvanced}
                disabled={isBusy || effectiveSelectedIds.length === 0}
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                고득점 GEO
              </Button>
            )}
            <Button
              onClick={handleApply}
              disabled={isBusy || effectiveSelectedIds.length === 0}
              className="gap-2 bg-teal-600 hover:bg-teal-700"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              선택 항목 적용 ({effectiveSelectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastResult && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {buildGeoResultMessage(lastResult)}
        </div>
      )}
    </>
  );
}
