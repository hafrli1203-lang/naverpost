"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle, ChevronDown, ChevronUp, Copy, FileText, Key, RotateCcw, Store, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatForNaver } from "@/lib/naver/contentFormatter";
import { WorkflowState } from "@/types";

interface FinalConfirmProps {
  state: WorkflowState;
  onStartOver: () => void;
}

export function FinalConfirm({ state, onStartOver }: FinalConfirmProps) {
  const [articleExpanded, setArticleExpanded] = useState(false);
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState<"raw" | "naver">("naver");
  const [copiedHtml, setCopiedHtml] = useState(false);
  const { shop, category, article, images, selectedKeyword } = state;
  const previewHtml = useMemo(() => {
    if (!article) return "";
    const imageUrls = images
      .filter((img) => img.status === "success" && img.imageUrl)
      .map((img) => img.imageUrl);

    return formatForNaver({
      title: article.title,
      content: article.content,
      imageUrls,
    });
  }, [article, images]);

  const handleCopyHtml = async () => {
    if (!previewHtml || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(previewHtml);
    setCopiedHtml(true);
    window.setTimeout(() => setCopiedHtml(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">게시 준비 완료</h2>
        <p className="text-sm text-muted-foreground">
          생성된 본문과 이미지를 검토했습니다. 필요하면 다시 시작해 새 초안을 만들 수 있습니다.
        </p>
      </div>

      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="flex items-start gap-3 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-green-800">최종 검토가 끝났습니다.</p>
            <p className="text-sm text-green-700">
              이 화면에서는 결과만 정리해 보여주며, 외부 저장이나 발행은 수행하지 않습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">요약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-sm text-muted-foreground">상점</span>
            <span className="text-sm font-medium">{shop?.name ?? "-"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-sm text-muted-foreground">카테고리</span>
            <span className="text-sm font-medium">{category?.name ?? "-"}</span>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-sm text-muted-foreground">제목</span>
            <span className="text-sm font-medium leading-snug">{article?.title ?? "-"}</span>
          </div>
          {selectedKeyword && (
            <div className="flex items-start gap-3">
              <Key className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="w-16 shrink-0 text-sm text-muted-foreground">키워드</span>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">
                  {selectedKeyword.mainKeyword}
                </Badge>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                  {selectedKeyword.subKeyword1}
                </Badge>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                  {selectedKeyword.subKeyword2}
                </Badge>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <CheckCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-sm text-muted-foreground">이미지</span>
            <span className="text-sm font-medium">
              {images.filter((i) => i.status === "success").length}개 준비됨
            </span>
          </div>
        </CardContent>
      </Card>

      {article && (
        <Card>
          <button
            className="flex w-full items-center justify-between rounded-lg px-5 py-4 text-left transition-colors hover:bg-gray-50"
            onClick={() => setArticleExpanded((v) => !v)}
          >
            <span className="text-sm font-medium">본문 미리보기</span>
            {articleExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {articleExpanded && (
            <CardContent className="pt-0">
              <Separator className="mb-4" />
              <div className="mb-4 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === "naver" ? "default" : "outline"}
                  onClick={() => setPreviewMode("naver")}
                >
                  네이버 포맷 미리보기
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === "raw" ? "default" : "outline"}
                  onClick={() => setPreviewMode("raw")}
                >
                  원문 보기
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto gap-1.5"
                  onClick={handleCopyHtml}
                  disabled={!previewHtml}
                >
                  {copiedHtml ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedHtml ? "HTML 복사됨" : "네이버 HTML 복사"}
                </Button>
              </div>

              {previewMode === "raw" ? (
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-gray-700">
                  {article.content}
                </div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
                  <div
                    className="min-h-[200px]"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {images.length > 0 && (
        <Card>
          <button
            className="flex w-full items-center justify-between rounded-lg px-5 py-4 text-left transition-colors hover:bg-gray-50"
            onClick={() => setImagesExpanded((v) => !v)}
          >
            <span className="text-sm font-medium">
              이미지 미리보기 ({images.filter((i) => i.status === "success").length}개)
            </span>
            {imagesExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {imagesExpanded && (
            <CardContent className="pt-0">
              <Separator className="mb-4" />
              <div className="grid grid-cols-3 gap-2">
                {images
                  .filter((img) => img.status === "success" && img.imageUrl)
                  .map((image) => (
                    <div
                      key={image.index}
                      className="aspect-square overflow-hidden rounded-md bg-gray-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.imageUrl}
                        alt={`이미지 ${image.index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Separator />

      <div className="flex justify-center">
        <Button onClick={onStartOver} variant="outline" className="gap-2 h-11 px-8">
          <RotateCcw className="h-4 w-4" />
          새로 시작
        </Button>
      </div>
    </div>
  );
}
