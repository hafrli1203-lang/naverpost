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
      return "가격형";
    case "review":
      return "후기형";
    case "guide":
      return "가이드형";
    case "visit":
      return "방문형";
    case "info":
      return "정보형";
    default:
      return "일반형";
  }
}

function trendLabel(trend?: string): string {
  switch (trend) {
    case "rising":
      return "상승";
    case "steady":
      return "유지";
    case "falling":
      return "하락";
    default:
      return "확인 중";
  }
}

function buildAnalysisSummary(option: KeywordOption): string[] {
  const analysis = option.analysis;
  if (!analysis) {
    return ["기본 규칙만 먼저 통과한 후보입니다."];
  }

  const lines: string[] = [];
  const intent = intentLabel(analysis.searchIntentAxis);

  lines.push(`이 후보는 ${intent} 글 방향에 가장 가깝습니다.`);

  if (analysis.bodyExpansionFit?.isLikelyExpandable) {
    lines.push("본문을 길게 풀어도 내용이 끊기지 않을 가능성이 높습니다.");
  } else {
    lines.push("본문을 길게 쓰면 비슷한 설명이 반복될 수 있어 주의가 필요합니다.");
  }

  if (analysis.externalSignals) {
    lines.push("외부 검색 신호까지 확인된 후보라 우선 검토 가치가 높습니다.");
  } else {
    lines.push("속도를 위해 내부 분석만 먼저 적용한 후보입니다.");
  }

  if ((analysis.duplicateRisk?.titlePatternOverlap.length ?? 0) > 0) {
    lines.push("기존 제목과 비슷할 수 있어 표현을 조금 더 차별화하는 편이 안전합니다.");
  }

  return lines;
}

function buildExposureSummary(option: KeywordOption): string {
  const analysis = option.analysis;
  if (!analysis) {
    return "노출 판단 데이터가 아직 적어 기본 규칙 기준으로만 추천합니다.";
  }

  const parts: string[] = [];

  parts.push(
    analysis.bodyExpansionFit?.isLikelyExpandable
      ? "본문 확장성이 좋아 글 밀도를 확보하기 쉽습니다."
      : "본문 밀도가 약해질 수 있어 보완이 필요합니다."
  );

  parts.push(
    analysis.externalSignals
      ? "외부 검색 신호가 확인돼 우선순위가 높습니다."
      : "아직 외부 검색 신호 확인 전입니다."
  );

  if ((analysis.duplicateRisk?.titlePatternOverlap.length ?? 0) > 0) {
    parts.push("기존 제목과 겹칠 위험이 있습니다.");
  } else {
    parts.push("제목 중복 위험은 상대적으로 낮습니다.");
  }

  return parts.join(" ");
}

function buildValidationNote(
  validation?: { isValid: boolean; failures: { rule: string; reason: string }[] }
): string | null {
  if (!validation) return null;
  if (validation.isValid) return "기본 제목 규칙 검사를 통과했습니다.";
  return validation.failures[0]?.reason ?? "추가 검토가 필요합니다.";
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
          summary: buildAnalysisSummary(option),
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
          각 후보가 어떤 글 방향에 맞는지, 노출 가능성은 어떤지, 중복 위험은 없는지 쉽게
          읽을 수 있게 정리했습니다.
        </p>
      </div>

      <RadioGroup
        value={selectedIndex}
        onValueChange={setSelectedIndex}
        disabled={isLoading}
        className="space-y-4"
      >
        {cards.map(({ summary, exposureSummary }, idx) => {
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
                              글 방향: {intentLabel(displayOption.analysis.searchIntentAxis)}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={
                                displayOption.analysis.bodyExpansionFit?.isLikelyExpandable
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                  : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              }
                            >
                              본문 전개:{" "}
                              {displayOption.analysis.bodyExpansionFit?.isLikelyExpandable
                                ? "안정적"
                                : "주의 필요"}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={
                                displayOption.analysis.externalSignals
                                  ? "bg-violet-100 text-violet-700 hover:bg-violet-100"
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-100"
                              }
                            >
                              검증 수준:{" "}
                              {displayOption.analysis.externalSignals
                                ? "외부 검색 확인"
                                : "내부 분석 우선"}
                            </Badge>
                            {(displayOption.analysis.duplicateRisk?.titlePatternOverlap.length ??
                              0) > 0 && (
                              <Badge
                                variant="secondary"
                                className="bg-rose-100 text-rose-700 hover:bg-rose-100"
                              >
                                리스크: 기존 제목과 유사
                              </Badge>
                            )}
                          </div>

                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                            <p className="text-xs font-semibold text-blue-700">노출 가능성 요약</p>
                            <p className="mt-1 text-xs leading-5 text-blue-900">
                              {exposureSummary}
                            </p>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="space-y-1">
                              {summary.map((line) => (
                                <p key={line} className="text-xs leading-5 text-slate-700">
                                  {line}
                                </p>
                              ))}
                            </div>
                          </div>

                          {displayOption.analysis.externalSignals?.searchVolume?.length ? (
                            <p className="text-xs leading-5 text-muted-foreground">
                              외부 검색 추세:{" "}
                              {displayOption.analysis.externalSignals.searchVolume
                                .slice(0, 3)
                                .map((item) => `${item.keyword} ${trendLabel(item.trend)}`)
                                .join(" / ")}
                              {externalTrend ? `, 대표 흐름은 ${trendLabel(externalTrend)}입니다.` : ""}
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
