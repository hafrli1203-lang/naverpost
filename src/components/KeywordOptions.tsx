"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
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

function buildExposureSummary(option: KeywordOption): {
  tone: "positive" | "caution" | "warning";
  message: string;
} {
  const analysis = option.analysis;
  if (!analysis) {
    return {
      tone: "caution",
      message: "아직 분석이 부족한 후보예요. 일단 기본 규칙은 통과했어요.",
    };
  }

  const overlap = analysis.duplicateRisk?.titlePatternOverlap.length ?? 0;
  const expandable = analysis.bodyExpansionFit?.isLikelyExpandable;

  if (overlap > 0) {
    return {
      tone: "warning",
      message:
        "네이버 상위에 비슷한 제목이 이미 있어요. 그대로 쓰면 노출 경쟁에서 밀릴 수 있으니 각도를 바꿔 보세요.",
    };
  }

  if (!expandable) {
    return {
      tone: "caution",
      message:
        "본문을 길게 쓰면 설명이 반복될 수 있어요. 소주제를 다양하게 잡으면 좋아요.",
    };
  }

  return {
    tone: "positive",
    message:
      "본문을 편하게 길게 풀 수 있는 후보예요. 겹치는 상위 제목도 적어서 노출에 유리해요.",
  };
}

function buildAnalysisLines(option: KeywordOption): string[] {
  const analysis = option.analysis;
  if (!analysis) return [];

  const lines: string[] = [];
  const intent = intentLabel(analysis.searchIntentAxis);
  lines.push(`주로 "${intent}" 검색 의도에 맞는 글이에요.`);

  if (analysis.externalSignals) {
    lines.push("네이버 실시간 검색 흐름까지 확인했어요.");
  }

  const keywordOverlap = analysis.duplicateRisk?.keywordCombinationOverlap.length ?? 0;
  if (keywordOverlap > 0) {
    lines.push("같은 키워드 조합을 쓰는 글이 이미 많아요. 서브 키워드를 바꿔도 좋아요.");
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
    setEditingIndex(idx);
  }

  function handleSaveEdit(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (editingIndex === null || !editDraft) return;

    setEditedOptions((prev) => ({
      ...prev,
      [editingIndex]: { ...editDraft },
    }));
    setEditingIndex(null);
    setEditDraft(null);
  }

  function handleCancelEdit(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setEditingIndex(null);
    setEditDraft(null);
  }

  function handleConfirm() {
    const idx = parseInt(selectedIndex, 10);
    if (!Number.isNaN(idx) && options[idx]) {
      onSelect(getDisplayOption(idx));
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">제목과 키워드 후보</h2>
        <p className="text-sm text-muted-foreground">
          각 제목이 어떤 독자를 위한 글인지, 네이버 상위 제목과 겹치지 않는지 한눈에 볼 수 있어요.
        </p>
      </div>

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
          const displayOption = getDisplayOption(idx);
          const externalTrend = displayOption.analysis?.externalSignals?.searchVolume?.[0]?.trend;

          return (
            <Label key={idx} htmlFor={`keyword-${idx}`} className="cursor-pointer">
              <Card
                className={`transition-all duration-200 ${
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
                      <Input
                        value={editDraft.title}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, title: event.target.value } : prev
                          )
                        }
                        className="h-8 text-base font-semibold"
                        placeholder="제목을 수정하세요"
                        onClick={(event) => event.stopPropagation()}
                      />
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
                        >
                          <Save className="h-4 w-4 text-green-600" />
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

                <CardContent className="pl-10 pt-0">
                  {isEditing && editDraft ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs font-medium text-blue-700">
                          메인
                        </span>
                        <Input
                          value={editDraft.mainKeyword}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, mainKeyword: event.target.value } : prev
                            )
                          }
                          className="h-7 text-sm"
                          placeholder="메인 키워드"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs font-medium text-green-700">
                          서브 1
                        </span>
                        <Input
                          value={editDraft.subKeyword1}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, subKeyword1: event.target.value } : prev
                            )
                          }
                          className="h-7 text-sm"
                          placeholder="서브 키워드 1"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs font-medium text-green-700">
                          서브 2
                        </span>
                        <Input
                          value={editDraft.subKeyword2}
                          onChange={(event) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, subKeyword2: event.target.value } : prev
                            )
                          }
                          className="h-7 text-sm"
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
                                네이버 실시간 확인
                              </Badge>
                            )}
                            {(displayOption.analysis.duplicateRisk?.titlePatternOverlap.length ??
                              0) > 0 && (
                              <Badge
                                variant="secondary"
                                className="bg-rose-100 text-rose-700 hover:bg-rose-100"
                              >
                                상위 제목과 유사
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
                            <p className="text-xs leading-5 text-muted-foreground">
                              네이버 검색 추세:{" "}
                              {displayOption.analysis.externalSignals.searchVolume
                                .slice(0, 3)
                                .map((item) => `${item.keyword} ${trendLabel(item.trend)}`)
                                .join(" / ")}
                              {externalTrend ? `, 전체 흐름은 ${trendLabel(externalTrend)}이에요.` : ""}
                            </p>
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

      <Separator />

      <div className="flex justify-end gap-3">
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
  );
}
