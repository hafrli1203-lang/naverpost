"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WorkflowState } from "@/types";
import {
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  RotateCcw,
  Loader2,
  Store,
  Tag,
  FileText,
  Key,
} from "lucide-react";

interface FinalConfirmProps {
  state: WorkflowState;
  onSaveDraft: () => void;
  onStartOver: () => void;
  isLoading: boolean;
  savedPostId?: string;
}

export function FinalConfirm({
  state,
  onSaveDraft,
  onStartOver,
  isLoading,
  savedPostId,
}: FinalConfirmProps) {
  const [articleExpanded, setArticleExpanded] = useState(false);
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { shop, category, article, images, selectedKeyword } = state;

  function handleConfirmSave() {
    setDialogOpen(false);
    onSaveDraft();
  }

  if (savedPostId) {
    return (
      <div className="w-full max-w-2xl mx-auto text-center space-y-6 py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-green-700">임시저장 완료!</h2>
            <p className="text-muted-foreground text-sm">
              네이버 블로그에 임시저장되었습니다.
              <br />
              블로그 임시저장함에서 확인하고 발행하세요.
            </p>
            {savedPostId && (
              <p className="text-xs text-muted-foreground mt-1">
                저장 ID: <span className="font-mono">{savedPostId}</span>
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={onStartOver}
          variant="outline"
          className="gap-2 h-11 px-8"
        >
          <RotateCcw className="w-4 h-4" />
          처음으로
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">최종 확인</h2>
        <p className="text-sm text-muted-foreground">
          네이버 블로그에 임시저장하기 전 내용을 확인하세요
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">작성 요약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Store className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground w-16 shrink-0">안경원</span>
            <span className="text-sm font-medium">{shop?.name ?? "-"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground w-16 shrink-0">카테고리</span>
            <span className="text-sm font-medium">{category?.name ?? "-"}</span>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground w-16 shrink-0">제목</span>
            <span className="text-sm font-medium leading-snug">{article?.title ?? "-"}</span>
          </div>
          {selectedKeyword && (
            <div className="flex items-start gap-3">
              <Key className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-sm text-muted-foreground w-16 shrink-0">키워드</span>
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
            <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground w-16 shrink-0">이미지</span>
            <span className="text-sm font-medium">
              {images.filter((i) => i.status === "success").length}개 준비됨
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible article preview */}
      {article && (
        <Card>
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors rounded-lg"
            onClick={() => setArticleExpanded((v) => !v)}
          >
            <span className="text-sm font-medium">본문 미리보기</span>
            {articleExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {articleExpanded && (
            <CardContent className="pt-0">
              <Separator className="mb-4" />
              <div className="max-h-64 overflow-y-auto text-sm text-gray-700 leading-7 whitespace-pre-wrap">
                {article.content}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Collapsible image thumbnails */}
      {images.length > 0 && (
        <Card>
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors rounded-lg"
            onClick={() => setImagesExpanded((v) => !v)}
          >
            <span className="text-sm font-medium">
              이미지 미리보기 ({images.filter((i) => i.status === "success").length}개)
            </span>
            {imagesExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
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
                      className="aspect-square rounded-md overflow-hidden bg-gray-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.imageUrl}
                        alt={`이미지 ${image.index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Separator />

      {/* Save draft button with dialog */}
      <div className="flex flex-col items-center gap-3">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button
                className="w-full h-12 text-base gap-2"
                disabled={isLoading}
              />
            }
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            임시저장
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>임시저장 확인</DialogTitle>
              <DialogDescription>
                네이버 블로그에 임시저장합니다. (발행되지 않습니다)
                <br />
                임시저장함에서 직접 내용을 확인하고 발행하실 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isLoading}
              >
                취소
              </Button>
              <Button onClick={handleConfirmSave} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                확인
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          onClick={onStartOver}
          disabled={isLoading}
          className="text-muted-foreground gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          처음으로
        </Button>
      </div>
    </div>
  );
}
