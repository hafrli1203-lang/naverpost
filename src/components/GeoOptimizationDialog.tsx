"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, Loader2, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
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
  onLoadPlan?: () => Promise<unknown | null>;
  onApply: (
    selectedRecommendationIds: GeoRecommendation["id"][]
  ) => Promise<GeoOptimizationResult | null>;
  onApplyAdvanced?: (
    selectedRecommendationIds: GeoRecommendation["id"][]
  ) => Promise<GeoOptimizationResult | null>;
  onRevert?: () => void;
}

type GeoPlanStep = {
  pass: number;
  recommendation: GeoRecommendation;
  projectedScore: number;
};

type GeoPlanData = {
  analysis: GeoAnalysisResult;
  projectedScore: number;
  steps: GeoPlanStep[];
};

function impactDelta(impact: GeoRecommendation["impact"]): number {
  switch (impact) {
    case "high":
      return 8;
    case "medium":
      return 5;
    default:
      return 3;
  }
}

function impactLabel(impact: GeoRecommendation["impact"]): string {
  switch (impact) {
    case "high":
      return "높음";
    case "medium":
      return "중간";
    default:
      return "낮음";
  }
}

function impactBadgeClass(impact: GeoRecommendation["impact"]): string {
  switch (impact) {
    case "high":
      return "bg-rose-100 text-rose-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function gradeText(grade: GeoAnalysisResult["grade"]): string {
  switch (grade) {
    case "excellent":
      return "우수";
    case "good":
      return "양호";
    case "fair":
      return "보통";
    default:
      return "개선 필요";
  }
}

function buildGeoResultMessage(result: GeoOptimizationResult): string {
  const before = result.analysisBefore.score;
  const after = result.analysisAfter.score;

  if (after > before) return `GEO 점수 ${before} → ${after}`;
  if (after < before) return `GEO 점수 ${before} → ${after} 하락`;
  if (result.appliedRecommendationIds.length === 0) {
    return `이미 GEO 기준을 대체로 충족하는 글입니다. 추가 상승은 출처 인용(한국 기관·협회 자료) 확보가 필요합니다.`;
  }
  return `GEO 점수 ${before} 유지`;
}

function buildEstimatedScore(
  analysis: GeoAnalysisResult,
  recommendations: GeoRecommendation[],
  selectedIds: GeoRecommendation["id"][]
): number {
  const selected = recommendations.filter((item) => selectedIds.includes(item.id));
  const increase = selected.reduce((sum, item) => sum + impactDelta(item.impact), 0);
  return Math.min(100, Math.max(analysis.score, analysis.score + increase));
}

function buildAfterPreview(recommendation: GeoRecommendation): string {
  if (recommendation.after?.trim()) return recommendation.after.trim();

  switch (recommendation.id) {
    case "remove-template-blocks":
      return "FAQ, 핵심 답변, 확인 및 안내 같은 템플릿 블록 제거";
    case "soften-claims":
      return "단정적인 표현을 완화하고 근거 중심 문장으로 정리";
    case "comparison-table":
      return "비교 기준을 한눈에 볼 수 있는 표 추가";
    default:
      return "선택 시 반영";
  }
}

export function GeoOptimizationDialog({
  article,
  isBusy,
  onRefreshAnalysis,
  onLoadPlan,
  onApply,
  onApplyAdvanced,
  onRevert,
}: GeoOptimizationDialogProps) {
  const canRevert = Boolean(article.preGeoContent && onRevert);
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<GeoRecommendation["id"][]>([]);
  const [lastResult, setLastResult] = useState<GeoOptimizationResult | null>(null);
  const [plan, setPlan] = useState<GeoPlanData | null>(null);
  const analysis = article.geo;

  const displayAnalysis = plan?.analysis ?? analysis;
  const recommendations = useMemo(
    () => (plan ? plan.steps.map((item) => item.recommendation) : analysis?.recommendations ?? []),
    [analysis?.recommendations, plan]
  );
  const effectiveSelectedIds = selectedIds.length > 0 ? selectedIds : recommendations.map((item) => item.id);
  const estimatedScore = useMemo(
    () =>
      plan?.projectedScore ??
      (displayAnalysis ? buildEstimatedScore(displayAnalysis, recommendations, effectiveSelectedIds) : 0),
    [displayAnalysis, plan?.projectedScore, recommendations, effectiveSelectedIds]
  );

  async function handleOpen() {
    const refreshed = onRefreshAnalysis ? await onRefreshAnalysis() : analysis;
    const sourceAnalysis = refreshed ?? analysis;
    const loadedPlan = onLoadPlan ? ((await onLoadPlan()) as GeoPlanData | null) : null;
    setPlan(loadedPlan);

    if (loadedPlan) {
      setSelectedIds(loadedPlan.steps.map((item) => item.recommendation.id));
    } else if (sourceAnalysis) {
      setSelectedIds(
        sourceAnalysis.recommendations
          .filter((item) => item.selectedByDefault)
          .map((item) => item.id)
      );
    }

    setLastResult(null);
    setOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setLastResult(null);
      setPlan(null);
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

  if (!displayAnalysis) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpen}
        disabled={isBusy}
        className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
      >
        <Sparkles className="h-4 w-4" />
        GEO 최적화
      </Button>

      {canRevert && (
        <Button
          variant="outline"
          onClick={onRevert}
          disabled={isBusy}
          className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-800"
        >
          <RotateCcw className="h-4 w-4" />
          GEO 이전으로 복원
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
          <div className="p-6">
            <DialogHeader className="mb-6">
              <DialogTitle>GEO 최적화</DialogTitle>
              <DialogDescription>
                변경 사항을 확인한 뒤 적용하세요. 현재 글 흐름은 유지하고 필요한 부분만 다듬습니다.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-6">
              <div className="flex flex-col items-center justify-center gap-3 text-center md:flex-row md:gap-8">
                <div>
                  <div className="text-4xl font-semibold text-slate-900">{displayAnalysis.score}</div>
                  <div className="mt-1 text-xs text-slate-500">현재</div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
                <div>
                  <div className="text-4xl font-semibold text-teal-600">{estimatedScore}</div>
                  <div className="mt-1 text-xs text-slate-500">예상</div>
                </div>
                <div className="rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-700">
                  {estimatedScore >= displayAnalysis.score ? `+${estimatedScore - displayAnalysis.score}점` : `${estimatedScore - displayAnalysis.score}점`}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {displayAnalysis.categories.map((item) => {
                const ratio = Math.round((item.score / item.maxScore) * 100);
                return (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="text-slate-500">
                        {item.score}/{item.maxScore}
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

            <div className="mt-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  변경 사항 ({recommendations.length}건)
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  1차 제거 후 다시 재분석한 항목까지 포함해, 90점에 가까워질 때까지 필요한 변경을 묶어서 보여줍니다.
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-teal-700 hover:text-teal-800"
                onClick={() => setSelectedIds(recommendations.map((item) => item.id))}
              >
                전체 선택
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {recommendations.map((recommendation, index) => {
                const checked = effectiveSelectedIds.includes(recommendation.id);
                const step = plan?.steps[index];
                return (
                  <button
                    key={recommendation.id}
                    type="button"
                    onClick={() => toggleRecommendation(recommendation.id)}
                    className={`w-full rounded-2xl border p-5 text-left transition ${
                      checked
                        ? "border-teal-300 bg-teal-50/40"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {checked ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-teal-600" />
                        ) : (
                          <Circle className="mt-0.5 h-5 w-5 text-slate-400" />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-slate-900">
                              {recommendation.title}
                            </span>
                            {step && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {step.pass}차
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${impactBadgeClass(
                                recommendation.impact
                              )}`}
                            >
                              {impactLabel(recommendation.impact)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{recommendation.description}</p>
                          {step && (
                            <p className="mt-1 text-xs text-teal-700">
                              이 단계 반영 시 예상 점수 {step.projectedScore}점
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="mb-2 text-xs font-medium text-slate-500">현재</div>
                        <div className="min-h-20 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {recommendation.before?.trim() || "현재 본문에는 해당 구조가 없거나 약합니다."}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-cyan-50 p-4">
                        <div className="mb-2 text-xs font-medium text-teal-600">최적화</div>
                        <div className="min-h-20 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {buildAfterPreview(recommendation)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">검색 미리보기</div>
                  <div className="mt-1 text-xs text-slate-500">
                  점수만이 아니라 실제 노출 문장도 함께 확인합니다.
                </div>
              </div>
              <div className="text-xs text-slate-500">
                  인용 밀도 {displayAnalysis.citationDensityCount}건 · {gradeText(displayAnalysis.grade)}
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-emerald-600">블로그 · blog.naver.com</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{displayAnalysis.previewTitle}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{displayAnalysis.previewDescription}</div>
            </div>
          </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isBusy}>
              이전
            </Button>
            <Button
              onClick={onApplyAdvanced ? handleApplyAdvanced : handleApply}
              disabled={isBusy || effectiveSelectedIds.length === 0}
              className="gap-2 bg-teal-600 hover:bg-teal-700"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              GEO 최적화 적용 ({effectiveSelectedIds.length}/{recommendations.length})
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
