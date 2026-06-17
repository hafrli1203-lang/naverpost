"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertTriangle, Loader2, Gauge, RefreshCw } from "lucide-react";

type PostingAuditResult = {
  status: "ok" | "review";
  charCount: number;
  imageCount: number;
  commaCount: number;
  queryIntentFocus: {
    titleMorphemes: string[];
    activatedInBody: string[];
    missingInBody: string[];
    coverageRatio: number;
  };
  topRepeatedMorphemes: Array<{ token: string; count: number }>;
  uniqueBodyMorphemeCount: number;
  overusedWords: Array<{ word: string; count: number }>;
  languageFlags: {
    profanity: string[];
    abuse: string[];
    adult: string[];
    commercial: string[];
    emphasis: string[];
    advertising: string[];
  };
  warnings: string[];
};

interface CRankAuditProps {
  title: string;
  body: string;
  mainKeyword?: string;
  subKeyword1?: string;
  subKeyword2?: string;
}

// 이미지는 이 앱에서 별도 단계(붙여넣기 시 배치)로 처리하므로, 본문 마크다운에
// 이미지가 없다는 경고는 C-Rank 점검 맥락에서 오해를 부른다. 그 경고만 숨긴다.
function filterContextWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !warning.startsWith("본문에 이미지가 없습니다"));
}

function coverageTone(ratio: number): { label: string; className: string } {
  if (ratio >= 0.8) return { label: "좋음", className: "text-green-600" };
  if (ratio >= 0.6) return { label: "보통", className: "text-yellow-600" };
  return { label: "낮음", className: "text-orange-600" };
}

export function CRankAudit({
  title,
  body,
  mainKeyword,
  subKeyword1,
  subKeyword2,
}: CRankAuditProps) {
  const [audit, setAudit] = useState<PostingAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    if (!title.trim() || !body.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "posting-audit",
          title,
          body,
          mainKeyword,
          subKeyword1,
          subKeyword2,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "사전 점검에 실패했습니다.");
      }
      setAudit(json.data as PostingAuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "사전 점검 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [title, body, mainKeyword, subKeyword1, subKeyword2]);

  useEffect(() => {
    // 마운트 시 1회 사전 점검(fetch-on-mount). setIsLoading은 동기 호출되지만 의도된 동작이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runAudit();
  }, [runAudit]);

  const warnings = audit ? filterContextWarnings(audit.warnings) : [];
  const coverage = audit ? coverageTone(audit.queryIntentFocus.coverageRatio) : null;
  const flagged = audit
    ? Array.from(
        new Set([
          ...audit.languageFlags.profanity,
          ...audit.languageFlags.abuse,
          ...audit.languageFlags.adult,
          ...audit.languageFlags.commercial,
          ...audit.languageFlags.emphasis,
          ...audit.languageFlags.advertising,
        ])
      )
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="w-4 h-4 text-indigo-500" />
          <span className="flex-1">C-Rank 사전 점검</span>
          <button
            onClick={runAudit}
            disabled={isLoading}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="다시 점검"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-xs text-orange-600">{error}</p>
        )}

        {!audit && isLoading && (
          <p className="text-xs text-muted-foreground">본문을 점검하는 중이에요...</p>
        )}

        {audit && (
          <>
            {/* 종합 상태 */}
            {warnings.length === 0 && flagged.length === 0 ? (
              <div className="flex items-start gap-2 text-green-600">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-sm">붙여넣기 전 큰 문제가 없어요</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-orange-600">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-sm">붙여넣기 전 점검할 항목이 있어요</span>
              </div>
            )}

            <Separator />

            {/* 질의 의도 집중도 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">질의 의도 집중도</span>
                {coverage && (
                  <span className={`font-semibold ${coverage.className}`}>
                    {Math.round(audit.queryIntentFocus.coverageRatio * 100)}% · {coverage.label}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                제목 형태소가 본문에 얼마나 깔렸는지(네이버 질의 의도 매칭)예요.
              </p>
              {audit.queryIntentFocus.missingInBody.length > 0 && (
                <p className="text-[11px] leading-4 text-orange-600">
                  본문에 없는 제목 형태소: {audit.queryIntentFocus.missingInBody.join(", ")}
                </p>
              )}
            </div>

            {/* 형태소 다양성 / 반복 */}
            {audit.topRepeatedMorphemes.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-slate-600">
                  상위 반복 형태소 (다양성 {audit.uniqueBodyMorphemeCount}종)
                </p>
                <div className="flex flex-wrap gap-1">
                  {audit.topRepeatedMorphemes.slice(0, 6).map((m) => (
                    <Badge
                      key={m.token}
                      variant="secondary"
                      className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-[11px]"
                    >
                      {m.token} {m.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 과다 반복 단어 */}
            {audit.overusedWords.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-orange-600">과다 반복 (스팸 신호)</p>
                <div className="flex flex-wrap gap-1">
                  {audit.overusedWords.slice(0, 6).map((w) => (
                    <Badge
                      key={w.word}
                      variant="secondary"
                      className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[11px]"
                    >
                      {w.word} {w.count}회
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 주의 표현 */}
            {flagged.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-orange-600">주의 표현</p>
                <p className="text-[11px] leading-4 text-orange-600">{flagged.slice(0, 10).join(", ")}</p>
              </div>
            )}

            <Separator />

            {/* 수치 요약 */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-700">{audit.charCount.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">글자수</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{audit.uniqueBodyMorphemeCount}</p>
                <p className="text-[10px] text-muted-foreground">형태소 종류</p>
              </div>
              <div>
                <p
                  className={`text-sm font-semibold ${
                    audit.commaCount > 0 ? "text-orange-600" : "text-slate-700"
                  }`}
                >
                  {audit.commaCount}
                </p>
                <p className="text-[10px] text-muted-foreground">쉼표</p>
              </div>
            </div>

            {/* 경고 목록 */}
            {warnings.length > 0 && (
              <div className="space-y-1 pt-1">
                {warnings.map((warning, i) => (
                  <p key={i} className="text-[11px] leading-4 text-muted-foreground">
                    - {warning}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
