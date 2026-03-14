"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { KeywordOption } from "@/types";
import { CheckCircle, XCircle, Loader2, RefreshCw, CheckCheck } from "lucide-react";

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
  const safeOptions = Array.isArray(options) ? options : [];

  function handleConfirm() {
    const idx = parseInt(selectedIndex, 10);
    if (!isNaN(idx) && safeOptions[idx]) {
      onSelect(safeOptions[idx]);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">키워드 옵션 선택</h2>
        <p className="text-sm text-muted-foreground">
          아래 키워드 조합 중 하나를 선택하세요
        </p>
      </div>

      <RadioGroup
        value={selectedIndex}
        onValueChange={setSelectedIndex}
        disabled={isLoading}
        className="space-y-4"
      >
        {safeOptions.map((option, idx) => {
          const validation = validations?.[idx];
          const isSelected = selectedIndex === String(idx);

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
                    <CardTitle className="text-base font-semibold leading-snug">
                      {option.title}
                    </CardTitle>
                  </div>
                  {validation && (
                    <div className="shrink-0">
                      {validation.isValid ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 pl-10">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      메인: {option.mainKeyword}
                    </Badge>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      서브1: {option.subKeyword1}
                    </Badge>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      서브2: {option.subKeyword2}
                    </Badge>
                  </div>
                  {validation && !validation.isValid && (
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
          disabled={!selectedIndex || isLoading}
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
