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
  onApply: (
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
      return "보완 필요";
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

export function GeoOptimizationDialog({
  article,
  isBusy,
  onApply,
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

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && analysis) {
      setSelectedIds(
        analysis.recommendations
          .filter((item) => item.selectedByDefault)
          .map((item) => item.id)
      );
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
              <div className="mt-1 text-sm text-slate-600">/ 100 · {gradeText(analysis.grade)}</div>
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
                <h3 className="text-sm font-semibold text-slate-900">네이버 검색 프리뷰</h3>
                <span className="text-xs text-slate-500">
                  인용 밀도 {analysis.citationDensityCount}건 · {analysis.citationDensityLabel}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-green-600">● 블로그 · blog.naver.com</div>
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
                  변경 항목 ({analysis.recommendations.length}건)
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
                              {recommendation.impact === "high"
                                ? "높음"
                                : recommendation.impact === "medium"
                                  ? "보통"
                                  : "낮음"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">{recommendation.description}</p>
                          <p className="text-xs text-slate-500">{recommendation.reason}</p>
                        </div>
                      </div>

                      {(recommendation.before || recommendation.after) && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="mb-1 text-xs text-slate-500">현재</div>
                            <div className="text-sm text-slate-700">
                              {recommendation.before ?? "없음"}
                            </div>
                          </div>
                          <div className="rounded-xl bg-cyan-50 p-3">
                            <div className="mb-1 text-xs text-teal-600">최적화</div>
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
              선택 적용 ({effectiveSelectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastResult && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          GEO 점수가 {lastResult.analysisBefore.score}점에서 {lastResult.analysisAfter.score}점으로
          변경되었습니다.
        </div>
      )}
    </>
  );
}
