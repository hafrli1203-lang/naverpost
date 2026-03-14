"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArticleContent } from "@/types";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Check,
  RotateCcw,
  PenLine,
  FileText,
} from "lucide-react";

interface ArticlePreviewProps {
  article: ArticleContent;
  onApprove: () => void;
  onRewrite: () => void;
  onManualEdit: (content: string) => void;
  isLoading: boolean;
}

function renderContent(content: string) {
  return content.split("\n").map((line, i) => {
    if (line.startsWith("# ")) {
      return (
        <h2 key={i} className="text-xl font-bold mt-6 mb-2 text-gray-900">
          {line.slice(2)}
        </h2>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3 key={i} className="text-lg font-semibold mt-5 mb-2 text-gray-800">
          {line.slice(3)}
        </h3>
      );
    }
    if (line.startsWith("### ")) {
      return (
        <h4 key={i} className="text-base font-semibold mt-4 mb-1 text-gray-700">
          {line.slice(4)}
        </h4>
      );
    }
    if (line.trim() === "") {
      return <div key={i} className="h-3" />;
    }
    return (
      <p key={i} className="text-sm leading-7 text-gray-700">
        {line}
      </p>
    );
  });
}

export function ArticlePreview({
  article,
  onApprove,
  onRewrite,
  onManualEdit,
  isLoading,
}: ArticlePreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(article.content);

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
                {article.title}
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
                <div className="prose prose-sm max-w-none overflow-y-auto max-h-[500px] pr-2">
                  {renderContent(article.content)}
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
                      charCount >= 2000 ? "text-green-600 font-semibold" : "text-orange-500"
                    }
                  >
                    {charCount.toLocaleString()}자 / 2,000자 목표
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      charCount >= 2000 ? "bg-green-500" : "bg-orange-400"
                    }`}
                    style={{ width: `${Math.min((charCount / 2000) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Keywords */}
              <div className="space-y-1 pt-1">
                <p className="text-xs text-muted-foreground font-medium">사용 키워드</p>
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
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
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
