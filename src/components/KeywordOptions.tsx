"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { KeywordOption } from "@/types";
import {
  CheckCheck,
  CheckCircle,
  Edit2,
  Loader2,
  RefreshCw,
  Save,
  X,
  XCircle,
} from "lucide-react";

interface KeywordOptionsProps {
  options: KeywordOption[];
  onSelect: (option: KeywordOption) => void;
  onRegenerate: () => void;
  isLoading: boolean;
  validations?: { isValid: boolean; failures: { rule: string; reason: string }[] }[];
}

function intentLabel(intent?: string): string {
  switch (intent) {
    case "price":
      return "가격 정보";
    case "review":
      return "후기 리뷰";
    case "guide":
      return "가이드";
    case "visit":
      return "매장 방문";
    case "info":
      return "정보성";
    default:
      return "일반";
  }
}

function trendLabel(trend?: string): string {
  switch (trend) {
    case "rising":
      return "상승 중";
    case "steady":
      return "꾸준함";
    case "falling":
      return "감소 중";
    default:
      return "확인 중";
  }
}

function formatMonthlySearches(value?: number | null, fallback?: string): string | null {
  if (typeof value === "number") {
    return `${value.toLocaleString("ko-KR")}회`;
  }
  if (fallback) {
    return `${fallback}회`;
  }
  return null;
}

function buildSearchVolumeLine(option: KeywordOption): string | null {
  const signals = option.analysis?.externalSignals?.searchVolume ?? [];
  const withMonthly = signals.find((signal) => signal.monthlyTotalSearches !== undefined);
  if (!withMonthly) return null;

  const total = formatMonthlySearches(withMonthly.monthlyTotalSearches);
  const pc = formatMonthlySearches(
    withMonthly.monthlyPcSearches,
    withMonthly.monthlyPcSearchesLabel
  );
  const mobile = formatMonthlySearches(
    withMonthly.monthlyMobileSearches,
    withMonthly.monthlyMobileSearchesLabel
  );
  const competition = withMonthly.competitionLabel
    ? `, 경쟁 ${withMonthly.competitionLabel}`
    : "";

  if (total) {
    return `${withMonthly.keyword} 월간 검색량 ${total}${competition}`;
  }
  if (pc || mobile) {
    return `${withMonthly.keyword} 월간 검색량 PC ${pc ?? "-"} / 모바일 ${mobile ?? "-"}${competition}`;
  }
  return null;
}

function buildOpportunityLine(option: KeywordOption): string | null {
  const signals = option.analysis?.externalSignals?.searchVolume ?? [];
  const signal = [...signals].sort(
    (a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)
  )[0];
  if (!signal) return null;

  const pieces: string[] = [];
  if (typeof signal.opportunityScore === "number") {
    pieces.push(`기회점수 ${signal.opportunityScore}`);
  }
  if (typeof signal.blogDocumentCount === "number") {
    pieces.push(`블로그 발행수 ${signal.blogDocumentCount.toLocaleString("ko-KR")}건`);
  }
  if (typeof signal.competitionRatio === "number") {
    pieces.push(`검색량 대비 문서비 ${signal.competitionRatio.toFixed(1)}`);
  }
  if (signal.seasonalReason) {
    pieces.push(signal.seasonalReason);
  }

  return pieces.length > 0 ? `${signal.keyword}: ${pieces.join(" / ")}` : null;
}

function getBestVolumeSignal(option: KeywordOption) {
  const signals = option.analysis?.externalSignals?.searchVolume ?? [];
  return [...signals].sort(
    (a, b) => (b.monthlyTotalSearches ?? 0) - (a.monthlyTotalSearches ?? 0)
  )[0];
}

function buildDemandPhrase(option: KeywordOption): string {
  const signal = getBestVolumeSignal(option);
  if (!signal) {
    const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
    if (/안경점|안경원|장림|공주|장유|충남대|심곡|진해/.test(source)) {
      return "지역 방문 전환을 노린 롱테일 구조로 판단했습니다";
    }
    if (/가정의달|가정의 달|부모님|봄|여름|가을|겨울|자외선|김서림|환절기/.test(source)) {
      return "현재 시즌 수요와 맞는 정보형 롱테일 구조로 판단했습니다";
    }
    return "정보형 롱테일 검색 의도에 맞춘 후보로 판단했습니다";
  }

  const total = formatMonthlySearches(signal.monthlyTotalSearches);
  const competition = signal.competitionLabel ? `, 경쟁 ${signal.competitionLabel}` : "";
  const trend = trendLabel(signal.trend);

  if (total) {
    const opportunity =
      typeof signal.opportunityScore === "number" ? `, 기회점수 ${signal.opportunityScore}` : "";
    return `${signal.keyword} 월간 ${total}${competition}, 추세 ${trend}${opportunity}`;
  }

  return `${signal.keyword} 검색 신호 확인, 추세 ${trend}`;
}

function buildMaterialPhrase(option: KeywordOption): string {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;

  if (/멀티포컬렌즈|누진렌즈|다초점렌즈|중근용렌즈|실내용누진/.test(source)) {
    if (/시야|흐림|흐리|초점/.test(source)) {
      return "시야 변화와 초점 흐림을 바로 풀 수 있습니다";
    }
    if (/적응|적용|불편/.test(source)) {
      return "적응 중 생기는 불편을 원인별로 나누기 좋습니다";
    }
  }
  if (/하드렌즈|렌즈세척|렌즈보관|위생|교체/.test(source)) {
    return "세척, 보관, 교체 습관을 구체적으로 안내하기 좋습니다";
  }
  if (/소프트렌즈|장시간렌즈|렌즈건조|렌즈충혈|렌즈이물감/.test(source)) {
    return "착용 후 불편을 실제 상황 중심으로 설명할 수 있습니다";
  }
  if (/난시렌즈|렌즈검사|시력검사|안경검사/.test(source)) {
    return "검사 전 확인할 눈 상태와 착용 기준이 연결됩니다";
  }
  if (/안경점|안경원|충남대|장림|공주|장유|심곡|진해/.test(source)) {
    return "방문 전 확인 항목으로 자연스럽게 이어집니다";
  }
  if (/자외선|변색|김서림|부모님|가정의달|봄|여름|가을|겨울|환절기/.test(source)) {
    return "시즌 생활 상황과 제품 선택을 함께 묶기 좋습니다";
  }
  if (/선택|차이|비교|기준|고르는/.test(source)) {
    return "제품 차이와 선택 기준을 비교형으로 풀기 좋습니다";
  }

  return "본문 소주제를 나누기 쉬운 정보형 후보입니다";
}

function buildDuplicateConfidencePhrase(option: KeywordOption): string {
  const analysis = option.analysis;
  if (!analysis) return "기본 제목 규칙 위주로 검토했습니다";

  const hasRegisteredOverlap = (analysis.duplicateRisk?.issues ?? []).some(
    (issue) =>
      issue.code === "same-store-title-overlap" ||
      issue.code === "same-store-keyword-combination-overlap" ||
      issue.code === "cross-blog-title-overlap" ||
      issue.code === "cross-blog-keyword-combination-overlap"
  );
  if (hasRegisteredOverlap) {
    return "등록된 매장 글과 겹치는 신호가 있어 제외 대상입니다";
  }

  const hasCompetitorOverlap = (analysis.duplicateRisk?.issues ?? []).some(
    (issue) =>
      issue.code === "competitor-top-title-overlap" ||
      issue.code === "competitor-keyword-combination-overlap"
  );
  if (hasCompetitorOverlap) {
    return "상위 노출 제목 일부와 닮아 표현만 조금 바꾸면 더 안전합니다";
  }

  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;
  if (/지역|방문|안경점|안경원|장림|공주|장유|충남대|심곡|진해/.test(source)) {
    return "방문 전환 흐름이 분명합니다";
  }
  if (/운전|야간|업무|실내|사무|독서|컴퓨터/.test(source)) {
    return "상황어가 분명해 각도 차별화가 쉽습니다";
  }
  if (/울렁|어지러|적응|불편|흐림|초점|건조/.test(source)) {
    return "증상 원인형이라 차별화 여지가 큽니다";
  }
  if (/선택|차이|비교|고르는|기준/.test(source)) {
    return "표나 체크 흐름으로 차별화하기 좋습니다";
  }
  if (/검사|도수|시력/.test(source)) {
    return "검사 전 확인 흐름으로 구조가 선명합니다";
  }

  return "강한 중복 신호는 낮습니다";
}

function buildAngleAdjustmentPhrase(option: KeywordOption): string {
  const source = `${option.title} ${option.mainKeyword} ${option.subKeyword1} ${option.subKeyword2}`;

  if (/운전|야간|시야/.test(source)) {
    return "조정안: 제목에 '야간 운전 전 확인'처럼 상황을 앞세우고, 서브 키워드는 시야/검사 축으로 분리하세요";
  }
  if (/부모님|노안|시력검사/.test(source)) {
    return "조정안: '부모님' 표현이 겹치면 시기, 생활 불편, 검사 전 체크 중 하나로 각도를 바꾸세요";
  }
  if (/안경점|안경원|지역|방문|장림|공주|장유|충남대|심곡|진해/.test(source)) {
    return "조정안: 지역명 뒤에 제품명만 붙이지 말고 방문 전 확인할 검사 항목이나 착용 상황을 넣으세요";
  }
  if (/선택|차이|비교|고르는|기준/.test(source)) {
    return "조정안: 단순 선택 기준 대신 착용 시간, 사용 장소, 불편 증상 중 하나를 제목에 추가하세요";
  }
  if (/관리|세척|보관|교체|위생/.test(source)) {
    return "조정안: 관리 방법만 쓰지 말고 흠집, 코팅 손상, 교체 시기처럼 결과를 함께 드러내세요";
  }
  if (/울렁|어지러|적응|불편|흐림|초점|건조/.test(source)) {
    return "조정안: 증상명 뒤에 원인, 발생 상황, 확인 순서 중 하나를 붙여 상위 제목과 구분하세요";
  }

  return "조정안: 같은 키워드는 유지하되 제목 끝을 원인, 상황, 검사 전 확인 중 하나로 바꾸세요";
}

function buildExposureSummary(option: KeywordOption): {
  tone: "positive" | "caution" | "warning";
  message: string;
} {
  const analysis = option.analysis;
  if (!analysis) {
    return {
      tone: "caution",
      message: "검색 신호가 충분하지 않아 기본 규칙 위주로만 판단한 후보입니다.",
    };
  }

  const registeredOverlap = (analysis.duplicateRisk?.issues ?? []).some(
    (issue) =>
      issue.code === "same-store-title-overlap" ||
      issue.code === "same-store-keyword-combination-overlap" ||
      issue.code === "cross-blog-title-overlap" ||
      issue.code === "cross-blog-keyword-combination-overlap"
  );
  const competitorOverlap = (analysis.duplicateRisk?.issues ?? []).some(
    (issue) =>
      issue.code === "competitor-top-title-overlap" ||
      issue.code === "competitor-keyword-combination-overlap"
  );
  const competitorSimilarity = analysis.competitorTitleSimilarity?.percent ?? 0;
  const expandable = analysis.bodyExpansionFit?.isLikelyExpandable;
  const demandPhrase = buildDemandPhrase(option);
  const materialPhrase = buildMaterialPhrase(option);
  const duplicatePhrase = buildDuplicateConfidencePhrase(option);
  const adjustmentPhrase = buildAngleAdjustmentPhrase(option);
  const prefix = demandPhrase.replace(/ 후보로 판단했습니다$/, "").replace(/ 구조로 판단했습니다$/, "");

  if (registeredOverlap) {
    return {
      tone: "warning",
      message: `등록 매장 중복 신호가 있습니다. ${adjustmentPhrase}.`,
    };
  }

  if (competitorOverlap || competitorSimilarity >= 42) {
    return {
      tone: "caution",
      message: `상위 제목 유사도 ${competitorSimilarity}%입니다. ${analysis.competitorTitleSimilarity?.reason ?? adjustmentPhrase}`,
    };
  }

  if (!expandable) {
    return {
      tone: "caution",
      message: `${prefix}. ${materialPhrase} 서브 키워드를 더 구체화하면 좋습니다.`,
    };
  }

  return {
    tone: "positive",
    message: `${prefix}. ${materialPhrase} ${duplicatePhrase}.`,
  };
}

function buildAnalysisLines(option: KeywordOption): string[] {
  const analysis = option.analysis;
  if (!analysis) return [];

  const lines: string[] = [];
  lines.push(buildMaterialPhrase(option));

  if (analysis.externalSignals) {
    lines.push("네이버 검색량·블로그 발행수·월별 추세를 후보 점수에 반영했습니다.");
  } else {
    lines.push("검색량 실측 신호가 없어 조회수 목적 후보로는 신중하게 봐야 합니다.");
  }

  const opportunityLine = buildOpportunityLine(option);
  if (opportunityLine) {
    lines.push(`검색 기회: ${opportunityLine}`);
  }

  if (analysis.competitorTitleSimilarity) {
    const { percent, matchedTitle, sharedTokens, structureOverlap, endingOverlap } =
      analysis.competitorTitleSimilarity;
    lines.push(
      matchedTitle
        ? `상위 제목 유사도 ${percent}%: ${matchedTitle}`
        : `상위 제목 유사도 ${percent}%`
    );
    if (sharedTokens?.length) {
      lines.push(`겹친 핵심어: ${sharedTokens.slice(0, 5).join(", ")}`);
    }
    if (structureOverlap || endingOverlap) {
      lines.push(
        `겹친 요소: ${[
          structureOverlap ? "제목 구조" : "",
          endingOverlap ? "제목 어미" : "",
        ]
          .filter(Boolean)
          .join(", ")}`
      );
    }
  }

  const registeredOverlap = (analysis.duplicateRisk?.issues ?? []).some(
    (issue) =>
      issue.code === "same-store-title-overlap" ||
      issue.code === "same-store-keyword-combination-overlap" ||
      issue.code === "cross-blog-title-overlap" ||
      issue.code === "cross-blog-keyword-combination-overlap"
  );
  if (registeredOverlap) {
    lines.push("등록된 매장 글과 겹치는 조합이라 후보에서 제외해야 합니다.");
  }

  return lines;
}

function buildValidationNote(
  validation?: { isValid: boolean; failures: { rule: string; reason: string }[] }
): string | null {
  if (!validation) return null;
  if (validation.isValid) return "제목·키워드 기본 규칙 통과";
  return validation.failures[0]?.reason ?? "추가 검토 필요";
}

function toneStyles(tone: "positive" | "caution" | "warning"): {
  border: string;
  bg: string;
  label: string;
  labelColor: string;
} {
  switch (tone) {
    case "positive":
      return {
        border: "border-emerald-200",
        bg: "bg-emerald-50",
        label: "추천",
        labelColor: "text-emerald-700",
      };
    case "warning":
      return {
        border: "border-rose-200",
        bg: "bg-rose-50",
        label: "중복 위험",
        labelColor: "text-rose-700",
      };
    case "caution":
    default:
      return {
        border: "border-amber-200",
        bg: "bg-amber-50",
        label: "주의",
        labelColor: "text-amber-700",
      };
  }
}

export function KeywordOptions({
  options,
  onSelect,
  onRegenerate,
  isLoading,
  validations,
}: KeywordOptionsProps) {
  const [selectedIndex, setSelectedIndex] = useState<string>("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedOptions, setEditedOptions] = useState<Record<number, KeywordOption>>({});
  const [editDraft, setEditDraft] = useState<KeywordOption | null>(null);
  const [recalculatingIndex, setRecalculatingIndex] = useState<number | null>(null);
  const [draftSimilarity, setDraftSimilarity] =
    useState<NonNullable<KeywordOption["analysis"]>["competitorTitleSimilarity"] | null>(null);
  const [isDraftSimilarityLoading, setIsDraftSimilarityLoading] = useState(false);

  const getDisplayOption = useCallback(
    (idx: number) => editedOptions[idx] ?? options[idx],
    [editedOptions, options]
  );

  const cards = useMemo(
    () =>
      options.map((_, idx) => {
        const option = getDisplayOption(idx);
        return {
          option,
          lines: buildAnalysisLines(option),
          exposureSummary: buildExposureSummary(option),
        };
      }),
    [getDisplayOption, options]
  );

  function handleStartEdit(idx: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setEditDraft({ ...getDisplayOption(idx) });
    setDraftSimilarity(getDisplayOption(idx).analysis?.competitorTitleSimilarity ?? null);
    setEditingIndex(idx);
  }

  useEffect(() => {
    if (editingIndex === null || !editDraft || editDraft.title.trim().length < 8) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsDraftSimilarityLoading(true);
      try {
        const response = await fetch("/api/title-similarity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editDraft.title,
            keyword: editDraft.mainKeyword,
          }),
          signal: controller.signal,
        });
        const json = (await response.json()) as {
          success?: boolean;
          data?: {
            similarity?: NonNullable<KeywordOption["analysis"]>["competitorTitleSimilarity"];
          };
        };
        if (response.ok && json.success && json.data?.similarity) {
          setDraftSimilarity(json.data.similarity);
        }
      } catch {
        if (!controller.signal.aborted) {
          setDraftSimilarity(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsDraftSimilarityLoading(false);
        }
      }
    }, 900);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [editDraft, editingIndex]);

  async function handleSaveEdit(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (editingIndex === null || !editDraft) return;

    const savedIndex = editingIndex;
    let nextOption: KeywordOption = { ...editDraft };
    setRecalculatingIndex(savedIndex);

    if (draftSimilarity) {
      nextOption = {
        ...nextOption,
        analysis: {
          ...(nextOption.analysis ?? { issues: [] }),
          competitorTitleSimilarity: draftSimilarity,
        },
      };
    } else {
      try {
      const response = await fetch("/api/title-similarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextOption.title,
          keyword: nextOption.mainKeyword,
        }),
      });
      const json = (await response.json()) as {
        success?: boolean;
        data?: {
          similarity?: NonNullable<KeywordOption["analysis"]>["competitorTitleSimilarity"];
        };
      };

      if (response.ok && json.success && json.data?.similarity) {
        nextOption = {
          ...nextOption,
          analysis: {
            ...(nextOption.analysis ?? { issues: [] }),
            competitorTitleSimilarity: json.data.similarity,
          },
        };
      }
      } catch {
        // 수동 수정 저장은 유지하고, 유사도 재계산 실패 시 기존 분석값을 그대로 둔다.
      }
    }

    setEditedOptions((prev) => ({
      ...prev,
      [savedIndex]: nextOption,
    }));
    setEditingIndex(null);
    setEditDraft(null);
    setDraftSimilarity(null);
    setRecalculatingIndex(null);
  }

  function handleCancelEdit(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setEditingIndex(null);
    setEditDraft(null);
    setDraftSimilarity(null);
    setIsDraftSimilarityLoading(false);
  }

  function handleConfirm() {
    const idx = parseInt(selectedIndex, 10);
    if (!Number.isNaN(idx) && options[idx]) {
      onSelect(getDisplayOption(idx));
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-24">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">제목과 키워드 후보</h2>
        <p className="text-sm text-muted-foreground">
          검색량, 제목 중복 신호, 본문 확장 가능성을 함께 보고 후보를 고릅니다.
        </p>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          본문 생성과 기본 검수를 진행 중입니다. 워싱은 본문 확인 화면에서 직접 실행할 수 있습니다.
        </div>
      )}

      <RadioGroup
        value={selectedIndex}
        onValueChange={setSelectedIndex}
        disabled={isLoading}
        className="space-y-4"
      >
        {cards.map(({ lines, exposureSummary }, idx) => {
          const validation = validations?.[idx];
          const isSelected = selectedIndex === String(idx);
          const isEditing = editingIndex === idx;
          const isRecalculating = recalculatingIndex === idx;
          const displayOption = getDisplayOption(idx);
          const externalTrend = displayOption.analysis?.externalSignals?.searchVolume?.[0]?.trend;

          return (
            <Label key={idx} htmlFor={`keyword-${idx}`} className="block w-full cursor-pointer">
              <Card
                className={`w-full min-h-[204px] transition-all duration-200 ${
                  isSelected
                    ? "border-blue-500 shadow-md shadow-blue-100 ring-1 ring-blue-500"
                    : "border-border hover:border-blue-300"
                }`}
              >
                <CardHeader className="flex flex-row items-start gap-3 pb-2">
                  <RadioGroupItem
                    value={String(idx)}
                    id={`keyword-${idx}`}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    {isEditing && editDraft ? (
                      <div className="space-y-1.5">
                        <Input
                          value={editDraft.title}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, title: event.target.value } : prev
                            )
                          }
                          className="h-10 text-base font-semibold"
                          placeholder="제목을 수정하세요"
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          {isDraftSimilarityLoading ? (
                            <span className="inline-flex items-center gap-1 text-blue-700">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              상위 유사도 계산 중
                            </span>
                          ) : draftSimilarity ? (
                            <>
                              <Badge
                                variant="secondary"
                                className={
                                  draftSimilarity.percent >= 42
                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                }
                              >
                                수정 제목 상위 유사도 {draftSimilarity.percent}%
                              </Badge>
                              {draftSimilarity.sharedTokens?.length ? (
                                <span>겹친 핵심어: {draftSimilarity.sharedTokens.slice(0, 4).join(", ")}</span>
                              ) : null}
                            </>
                          ) : (
                            <span>제목을 수정하면 상위 유사도를 다시 계산합니다.</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <CardTitle className="text-base font-semibold leading-snug">
                        {displayOption.title}
                        {editedOptions[idx] && (
                          <span className="ml-2 text-xs font-normal text-orange-500">
                            수정됨
                          </span>
                        )}
                      </CardTitle>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {validation &&
                      (validation.isValid ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      ))}
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={handleSaveEdit}
                          title="저장"
                          disabled={isRecalculating}
                        >
                          {isRecalculating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          ) : (
                            <Save className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={handleCancelEdit}
                          title="취소"
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(event) => handleStartEdit(idx, event)}
                        title="직접 수정"
                      >
                        <Edit2 className="h-4 w-4 text-gray-400 hover:text-gray-700" />
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="min-h-[140px] pl-10 pt-0">
                  {isEditing && editDraft ? (
                    <div className="w-full max-w-none space-y-3">
                      <div className="grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                        <span className="shrink-0 text-xs font-medium text-blue-700">
                          메인
                        </span>
                        <Input
                          value={editDraft.mainKeyword}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, mainKeyword: event.target.value } : prev
                            )
                          }
                          className="h-9 w-full text-sm"
                          placeholder="메인 키워드"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                      <div className="grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                        <span className="shrink-0 text-xs font-medium text-green-700">
                          서브 1
                        </span>
                        <Input
                          value={editDraft.subKeyword1}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, subKeyword1: event.target.value } : prev
                            )
                          }
                          className="h-9 w-full text-sm"
                          placeholder="서브 키워드 1"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                      <div className="grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                        <span className="shrink-0 text-xs font-medium text-green-700">
                          서브 2
                        </span>
                        <Input
                          value={editDraft.subKeyword2}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, subKeyword2: event.target.value } : prev
                            )
                          }
                          className="h-9 w-full text-sm"
                          placeholder="서브 키워드 2"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                          메인: {displayOption.mainKeyword}
                        </Badge>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          서브 1: {displayOption.subKeyword1}
                        </Badge>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          서브 2: {displayOption.subKeyword2}
                        </Badge>
                      </div>

                      {displayOption.analysis && (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-slate-700 hover:bg-slate-100"
                            >
                              {intentLabel(displayOption.analysis.searchIntentAxis)} 검색 의도
                            </Badge>
                            {displayOption.analysis.externalSignals && (
                              <Badge
                                variant="secondary"
                                className="bg-violet-100 text-violet-700 hover:bg-violet-100"
                              >
                                검색기회 확인
                              </Badge>
                            )}
                            {isRecalculating && (
                              <Badge
                                variant="secondary"
                                className="bg-blue-100 text-blue-700 hover:bg-blue-100"
                              >
                                유사도 재계산 중
                              </Badge>
                            )}
                            {displayOption.analysis.competitorTitleSimilarity && (
                              <Badge
                                variant="secondary"
                                className={
                                  displayOption.analysis.competitorTitleSimilarity.percent >= 42
                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                }
                              >
                                상위 유사도 {displayOption.analysis.competitorTitleSimilarity.percent}%
                              </Badge>
                            )}
                            {(displayOption.analysis.duplicateRisk?.issues ?? []).some(
                              (issue) =>
                                issue.code === "same-store-title-overlap" ||
                                issue.code === "same-store-keyword-combination-overlap" ||
                                issue.code === "cross-blog-title-overlap" ||
                                issue.code === "cross-blog-keyword-combination-overlap"
                            ) && (
                              <Badge
                                variant="secondary"
                                className="bg-rose-100 text-rose-700 hover:bg-rose-100"
                              >
                                등록 매장 중복
                              </Badge>
                            )}
                          </div>

                          {(() => {
                            const styles = toneStyles(exposureSummary.tone);
                            return (
                              <div
                                className={`rounded-lg border ${styles.border} ${styles.bg} px-3 py-2`}
                              >
                                <p
                                  className={`text-xs font-semibold ${styles.labelColor}`}
                                >
                                  {styles.label}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-800">
                                  {exposureSummary.message}
                                </p>
                              </div>
                            );
                          })()}

                          {lines.length > 0 && (
                            <ul className="space-y-1 text-xs leading-5 text-slate-600">
                              {lines.map((line) => (
                                <li key={line}>· {line}</li>
                              ))}
                            </ul>
                          )}

                          {displayOption.analysis.externalSignals?.searchVolume?.length ? (
                            <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                              {buildSearchVolumeLine(displayOption) && (
                                <p>네이버 월간 검색량: {buildSearchVolumeLine(displayOption)}</p>
                              )}
                              {buildOpportunityLine(displayOption) && (
                                <p>검색량 대비 발행수: {buildOpportunityLine(displayOption)}</p>
                              )}
                              <p>
                                네이버 검색 추세:{" "}
                                {displayOption.analysis.externalSignals.searchVolume
                                  .slice(0, 3)
                                  .map((item) => `${item.keyword} ${trendLabel(item.trend)}`)
                                  .join(" / ")}
                                {externalTrend ? `, 전체 흐름은 ${trendLabel(externalTrend)}이에요.` : ""}
                              </p>
                            </div>
                          ) : null}
                        </>
                      )}

                      {buildValidationNote(validation) && (
                        <p
                          className={`text-xs leading-5 ${
                            validation?.isValid ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {buildValidationNote(validation)}
                        </p>
                      )}
                    </div>
                  )}

                  {validation && !validation.isValid && !isEditing && (
                    <div className="mt-2 space-y-1">
                      {validation.failures.map((failure, failureIndex) => (
                        <p key={failureIndex} className="text-xs text-red-500">
                          - {failure.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Label>
          );
        })}
      </RadioGroup>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:mx-0 sm:rounded-t-lg sm:border sm:shadow-lg">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-end gap-3">
          <p className="w-full text-[11px] leading-4 text-amber-700 dark:text-amber-300 sm:mr-auto sm:w-auto">
            <span className="font-medium">AI 호출 · 비용 발생 가능</span> — 생성·수정 시 구독 AI를 호출합니다.
          </p>
          <Button variant="outline" onClick={onRegenerate} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            다시 생성
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIndex === "" || isLoading || editingIndex !== null}
            className="gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            이 후보로 진행
          </Button>
        </div>
      </div>
    </div>
  );
}
