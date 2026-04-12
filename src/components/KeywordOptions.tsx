"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { KeywordOption } from "@/types";
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  CheckCheck,
  Edit2,
  Save,
  X,
} from "lucide-react";

interface KeywordOptionsProps {
  options: KeywordOption[];
  onSelect: (option: KeywordOption) => void;
  onRegenerate: () => void;
  isLoading: boolean;
  validations?: { isValid: boolean; failures: { rule: string; reason: string }[] }[];
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
  const safeOptions = options;

  const getDisplayOption = useCallback(
    (idx: number) => editedOptions[idx] ?? safeOptions[idx],
    [editedOptions, safeOptions]
  );

  function handleStartEdit(idx: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = getDisplayOption(idx);
    setEditDraft({ ...current });
    setEditingIndex(idx);
  }

  function handleSaveEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (editingIndex === null || !editDraft) return;
    setEditedOptions((prev) => ({ ...prev, [editingIndex]: { ...editDraft } }));
    setEditingIndex(null);
    setEditDraft(null);
  }

  function handleCancelEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingIndex(null);
    setEditDraft(null);
  }

  function handleConfirm() {
    const idx = parseInt(selectedIndex, 10);
    if (!isNaN(idx) && safeOptions[idx]) {
      onSelect(getDisplayOption(idx));
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">키워드 옵션 선택</h2>
        <p className="text-sm text-muted-foreground">
          아래 키워드 조합 중 하나를 선택하세요 (수정 가능)
        </p>
      </div>

      <RadioGroup
        value={selectedIndex}
        onValueChange={setSelectedIndex}
        disabled={isLoading}
        className="space-y-4"
      >
        {safeOptions.map((_, idx) => {
          const displayOption = getDisplayOption(idx);
          const validation = validations?.[idx];
          const isSelected = selectedIndex === String(idx);
          const isEditing = editingIndex === idx;

          return (
            <Label
              key={idx}
              htmlFor={`keyword-${idx}`}
              className="cursor-pointer"
            >
              <Card
                className={`transition-all duration-200 ${
                  isSelected
                    ? "border-blue-500 shadow-md shadow-blue-100 ring-1 ring-blue-500"
                    : "border-border hover:border-blue-300"
                }`}
              >
                <CardHeader className="pb-2 flex flex-row items-start gap-3">
                  <RadioGroupItem
                    value={String(idx)}
                    id={`keyword-${idx}`}
                    className="mt-1 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    {isEditing && editDraft ? (
                      <Input
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, title: e.target.value } : prev
                          )
                        }
                        className="text-base font-semibold h-8"
                        placeholder="제목 입력"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <CardTitle className="text-base font-semibold leading-snug">
                        {displayOption.title}
                        {editedOptions[idx] && (
                          <span className="ml-2 text-xs text-orange-500 font-normal">수정됨</span>
                        )}
                      </CardTitle>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {validation && (
                      <>
                        {validation.isValid ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </>
                    )}
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={handleSaveEdit}
                          title="저장"
                        >
                          <Save className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={handleCancelEdit}
                          title="취소"
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => handleStartEdit(idx, e)}
                        title="수정"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400 hover:text-gray-700" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pl-10">
                  {isEditing && editDraft ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-700 w-12 shrink-0">메인</span>
                        <Input
                          value={editDraft.mainKeyword}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, mainKeyword: e.target.value } : prev
                            )
                          }
                          className="h-7 text-sm"
                          placeholder="메인 키워드"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-700 w-12 shrink-0">서브1</span>
                        <Input
                          value={editDraft.subKeyword1}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, subKeyword1: e.target.value } : prev
                            )
                          }
                          className="h-7 text-sm"
                          placeholder="서브 키워드 1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-700 w-12 shrink-0">서브2</span>
                        <Input
                          value={editDraft.subKeyword2}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, subKeyword2: e.target.value } : prev
                            )
                          }
                          className="h-7 text-sm"
                          placeholder="서브 키워드 2"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                        메인: {displayOption.mainKeyword}
                      </Badge>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        서브1: {displayOption.subKeyword1}
                      </Badge>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        서브2: {displayOption.subKeyword2}
                      </Badge>
                    </div>
                  )}
                  {validation && !validation.isValid && !isEditing && (
                    <div className="mt-2 space-y-1">
                      {validation.failures.map((f, fi) => (
                        <p key={fi} className="text-xs text-red-500">
                          • {f.reason}
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

      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          다시 생성
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!selectedIndex || isLoading || editingIndex !== null}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCheck className="w-4 h-4" />
          )}
          선택 완료
        </Button>
      </div>
    </div>
  );
}
