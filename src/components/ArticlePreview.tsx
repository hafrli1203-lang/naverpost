"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GeoOptimizationDialog } from "@/components/GeoOptimizationDialog";
import { ArticleContent, GeoAnalysisResult, GeoOptimizationResult, GeoRecommendation } from "@/types";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Check,
  RotateCcw,
  PenLine,
  FileText,
  Copy,
  Save,
} from "lucide-react";

interface ArticlePreviewProps {
  article: ArticleContent;
  onApprove: () => void;
  onRewrite: () => void;
  onManualEdit: (content: string) => void | Promise<void>;
  onSave?: () => void;
  onRefreshGeoAnalysis?: () => Promise<GeoAnalysisResult | null>;
  onLoadGeoPlan?: () => Promise<unknown | null>;
  onApplyGeo: (
    selectedRecommendationIds: GeoRecommendation["id"][]
  ) => Promise<GeoOptimizationResult | null>;
  onApplyAdvancedGeo?: (
    selectedRecommendationIds: GeoRecommendation["id"][]
  ) => Promise<GeoOptimizationResult | null>;
  isLoading: boolean;
  isGeoLoading?: boolean;
  targetCharCount?: number;
}

function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect table: consecutive lines starting with |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        // Parse header
        const headerCells = tableLines[0].split("|").filter((c) => c.trim() !== "").map((c) => c.trim());
        // Skip separator row (| :--- | ... |)
        const dataStartIndex = tableLines[1].match(/^[\s|:-]+$/) ? 2 : 1;
        const dataRows = tableLines.slice(dataStartIndex).map((row) =>
          row.split("|").filter((c) => c.trim() !== "").map((c) => c.trim())
        );

        elements.push(
          <div key={`table-${i}`} className="my-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-200 rounded-lg">
              <thead>
                <tr className="bg-gray-50">
                  {headerCells.map((cell, ci) => (
                    <th key={ci} className="px-3 py-2 text-left font-semibold text-gray-700 border border-gray-200">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-gray-700 border border-gray-200">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Existing rendering logic
    if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="text-xl font-bold mt-6 mb-2 text-gray-900">
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="text-lg font-semibold mt-5 mb-2 text-gray-800">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="text-base font-semibold mt-4 mb-1 text-gray-700">
          {line.slice(4)}
        </h4>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-3" />);
    } else {
      elements.push(
        <p key={i} className="text-sm leading-7 text-gray-700">
          {line}
        </p>
      );
    }
    i++;
  }

  return elements;
}

export function ArticlePreview({
  article,
  onApprove,
  onRewrite,
  onManualEdit,
  onSave,
  onRefreshGeoAnalysis,
  onLoadGeoPlan,
  onApplyGeo,
  onApplyAdvancedGeo,
  isLoading,
  isGeoLoading = false,
  targetCharCount = 2000,
}: ArticlePreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(article.content);
  const [copiedField, setCopiedField] = useState<"title" | "keywords" | "content" | null>(null);

  function copyToClipboard(text: string, field: "title" | "keywords" | "content") {
    const doSet = () => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(doSet).catch(() => {
        fallbackCopy(text);
        doSet();
      });
    } else {
      fallbackCopy(text);
      doSet();
    }
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // ignore
    }
    document.body.removeChild(ta);
  }

  const charCount = article.content.length;
  const { validation } = article;

  function handleSaveEdit() {
    onManualEdit(editContent);
    setIsEditing(false);
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">본문 미리보기</h2>
        <p className="text-sm text-muted-foreground">작성된 블로그 본문을 검토하세요</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Article content */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="flex-1">{article.title}</span>
                <button
                  onClick={() => copyToClipboard(article.title, "title")}
                  className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="제목 복사"
                >
                  {copiedField === "title" ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-3">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[400px] text-sm font-mono"
                    disabled={isLoading}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditContent(article.content);
                        setIsEditing(false);
                      }}
                    >
                      취소
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={isLoading}>
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => copyToClipboard(article.content, "content")}
                    className="absolute top-0 right-0 z-10 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="본문 복사"
                  >
                    {copiedField === "content" ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <div className="prose prose-sm max-w-none overflow-y-auto max-h-[500px] pr-2">
                    {renderContent(article.content)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Validation panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">검증 결과</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Prohibited words */}
              {validation.prohibitedWords.length === 0 ? (
                <div className="flex items-start gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm">금지어 검사 통과</span>
                </div>
              ) : (
                <Alert variant="destructive" className="py-2">
                  <XCircle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    금지어 발견:{" "}
                    <span className="font-semibold">
                      {validation.prohibitedWords.join(", ")}
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {/* Repeated words */}
              {validation.overusedWords.length === 0 ? (
                <div className="flex items-start gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm">반복어 검사 통과</span>
                </div>
              ) : (
                <Alert className="py-2 border-yellow-300 bg-yellow-50">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <AlertDescription className="text-xs text-yellow-800">
                    <div className="font-semibold mb-1">반복어 발견:</div>
                    {validation.overusedWords.map((w, i) => (
                      <div key={i}>
                        {w.word}{" "}
                        <span className="text-yellow-600">({w.count}회)</span>
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              {/* Caution phrases */}
              {validation.cautionPhrases.length > 0 && (
                <Alert className="py-2 border-orange-300 bg-orange-50">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <AlertDescription className="text-xs text-orange-800">
                    <div className="font-semibold mb-1">주의 표현:</div>
                    {validation.cautionPhrases.join(", ")}
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              {/* Character count */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>글자 수</span>
                  <span
                    className={
                      charCount >= targetCharCount ? "text-green-600 font-semibold" : "text-orange-500"
                    }
                  >
                    {charCount.toLocaleString()}자 / {targetCharCount.toLocaleString()}자 목표
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      charCount >= targetCharCount ? "bg-green-500" : "bg-orange-400"
                    }`}
                    style={{ width: `${Math.min((charCount / targetCharCount) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Keywords */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">사용 키워드</p>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `메인: ${article.mainKeyword}\n서브1: ${article.subKeyword1}\n서브2: ${article.subKeyword2}`,
                        "keywords"
                      )
                    }
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="키워드 복사"
                  >
                    {copiedField === "keywords" ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">
                    {article.mainKeyword}
                  </Badge>
                  <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                    {article.subKeyword1}
                  </Badge>
                  <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                    {article.subKeyword2}
                  </Badge>
                </div>
              </div>

              {article.geo && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">GEO 점수</p>
                      <span className="text-sm font-semibold text-teal-600">
                        {article.geo.score} / 100
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{article.geo.summary}</p>
                    <div className="space-y-2">
                      {article.geo.categories.map((item) => (
                        <div key={item.key} className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>{item.label}</span>
                            <span>
                              {item.score}/{item.maxScore}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-teal-500"
                              style={{ width: `${Math.round((item.score / item.maxScore) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {article.brief?.competitorMorphology?.status === "available" && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">경쟁 블로그 본문 신호</p>
                      <span className="text-[11px] text-muted-foreground">
                        본문 샘플 {article.brief.competitorMorphology.bodySampleSize ?? 0}건
                      </span>
                    </div>

                    {(article.brief.competitorMorphology.bodyNouns?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-600">본문 공통 명사</p>
                        <div className="flex flex-wrap gap-1">
                          {article.brief.competitorMorphology.bodyNouns?.slice(0, 12).map((noun) => (
                            <Badge
                              key={noun}
                              variant="secondary"
                              className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-[11px]"
                            >
                              {noun}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(article.brief.competitorMorphology.bodyHighlights?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-600">본문 핵심 논점</p>
                        <div className="space-y-1">
                          {article.brief.competitorMorphology.bodyHighlights?.map((highlight) => (
                            <p key={highlight} className="text-xs leading-5 text-muted-foreground">
                              - {highlight}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {(article.brief.competitorMorphology.titleAngles?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-600">상위 제목 패턴</p>
                        <div className="space-y-1">
                          {article.brief.competitorMorphology.titleAngles?.map((item) => (
                            <p key={item} className="text-xs leading-5 text-muted-foreground">
                              - {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {(article.brief.competitorMorphology.contentBlocks?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-600">상위 본문 구조 힌트</p>
                        <div className="space-y-1">
                          {article.brief.competitorMorphology.contentBlocks?.map((item) => (
                            <p key={item} className="text-xs leading-5 text-muted-foreground">
                              - {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {(article.brief.competitorMorphology.cautionPoints?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-600">노출 관점 주의사항</p>
                        <div className="space-y-1">
                          {article.brief.competitorMorphology.cautionPoints?.map((item) => (
                            <p key={item} className="text-xs leading-5 text-muted-foreground">
                              - {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        {onSave && (
          <Button
            variant="outline"
            onClick={onSave}
            disabled={isLoading}
            className="gap-2 border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            <Save className="w-4 h-4" />
            저장
          </Button>
        )}
        <GeoOptimizationDialog
          article={article}
          isBusy={isLoading || isGeoLoading}
          onRefreshAnalysis={onRefreshGeoAnalysis}
          onLoadPlan={onLoadGeoPlan}
          onApply={onApplyGeo}
          onApplyAdvanced={onApplyAdvancedGeo}
        />
        <Button
          variant="outline"
          onClick={() => setIsEditing((v) => !v)}
          disabled={isLoading}
          className="gap-2"
        >
          <PenLine className="w-4 h-4" />
          수동 수정
        </Button>
        <Button
          variant="outline"
          onClick={onRewrite}
          disabled={isLoading}
          className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          재작성
        </Button>
        <Button
          onClick={onApprove}
          disabled={isLoading}
          className="gap-2 bg-green-600 hover:bg-green-700"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          승인
        </Button>
      </div>
    </div>
  );
}
