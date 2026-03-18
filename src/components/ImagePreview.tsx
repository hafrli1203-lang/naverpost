"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { BlogImage } from "@/types";
import {
  RefreshCw,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  ImageOff,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Edit2,
  Save,
} from "lucide-react";

interface ImagePreviewProps {
  images: BlogImage[];
  onRegenerate: (index: number, customPrompt?: string) => void;
  onApproveAll: () => void;
  onSave?: () => void;
  onStartGeneration?: () => void;
  isGenerating: boolean;
  progress: { current: number; total: number };
}

function ImageStatusBadge({ status }: { status: BlogImage["status"] }) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
          완료
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs">
          실패
        </Badge>
      );
    case "generating":
    case "retrying":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          {status === "retrying" ? "재시도 중" : "생성 중"}
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-xs">
          대기 중
        </Badge>
      );
  }
}

interface ImageCardProps {
  image: BlogImage;
  onRegenerate: (index: number, customPrompt?: string) => void;
  isGenerating: boolean;
}

function ImageCard({ image, onRegenerate, isGenerating }: ImageCardProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(image.prompt);

  const isBusy =
    isGenerating ||
    image.status === "generating" ||
    image.status === "retrying";

  const handleDownload = useCallback(async () => {
    if (!image.imageUrl) return;
    try {
      const res = await fetch(image.imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blog-image-${image.index + 1}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab if fetch fails (e.g. cross-origin)
      const a = document.createElement("a");
      a.href = image.imageUrl;
      a.download = `blog-image-${image.index + 1}.png`;
      a.target = "_blank";
      a.click();
    }
  }, [image.imageUrl, image.index]);

  const handleRegenerate = useCallback(() => {
    onRegenerate(image.index, image.prompt);
  }, [image.index, image.prompt, onRegenerate]);

  const handleRegenerateWithPrompt = useCallback(() => {
    onRegenerate(image.index, editedPrompt);
  }, [image.index, editedPrompt, onRegenerate]);

  return (
    <Card className="overflow-hidden">
      {/* Image area */}
      <div className="relative bg-gray-100 aspect-square">
        {image.imageUrl && image.status === "success" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.imageUrl}
            alt={`이미지 ${image.index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {image.status === "generating" || image.status === "retrying" ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            ) : image.status === "failed" ? (
              <XCircle className="w-8 h-8 text-red-400" />
            ) : (
              <ImageOff className="w-8 h-8 opacity-30" />
            )}
          </div>
        )}
        {/* Status overlay */}
        <div className="absolute top-2 left-2">
          <ImageStatusBadge status={image.status} />
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Section label */}
        <p className="text-xs font-semibold text-gray-700 truncate">
          {image.section || `섹션 ${image.index + 1}`}
        </p>

        {/* Collapsible prompt */}
        {image.prompt && (
          <div className="space-y-1">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700 transition-colors w-full text-left"
              onClick={() => setPromptOpen((v) => !v)}
            >
              <Edit2 className="w-3 h-3 shrink-0" />
              <span className="flex-1 truncate">프롬프트</span>
              {promptOpen ? (
                <ChevronUp className="w-3 h-3 shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 shrink-0" />
              )}
            </button>

            {promptOpen && (
              <Textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="text-xs min-h-[80px] resize-y"
                placeholder="이미지 생성 프롬프트를 입력하세요"
              />
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={handleRegenerate}
            disabled={isBusy}
            title="원래 프롬프트로 재생성"
          >
            <RefreshCw className="w-3 h-3" />
            재생성
          </Button>

          {image.prompt && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs gap-1"
              onClick={handleRegenerateWithPrompt}
              disabled={isBusy || !editedPrompt.trim()}
              title="수정된 프롬프트로 재생성"
            >
              <Edit2 className="w-3 h-3" />
              수정 재생성
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={handleDownload}
            disabled={image.status !== "success"}
            title="이미지 다운로드"
          >
            <Download className="w-3 h-3" />
            다운로드
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ImagePreview({
  images,
  onRegenerate,
  onApproveAll,
  onSave,
  onStartGeneration,
  isGenerating,
  progress,
}: ImagePreviewProps) {
  const successCount = images.filter((img) => img.status === "success").length;
  const failCount = images.filter((img) => img.status === "failed").length;
  const progressPercent =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">이미지 생성</h2>
        <p className="text-sm text-muted-foreground">블로그에 사용될 이미지를 확인하세요</p>
      </div>

      {/* Progress bar */}
      {isGenerating && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>이미지 생성 중...</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      )}

      {/* Stats badges */}
      {!isGenerating && images.length > 0 && (
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span>성공 {successCount}개</span>
          </div>
          {failCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-red-500">
              <XCircle className="w-4 h-4" />
              <span>실패 {failCount}개</span>
            </div>
          )}
        </div>
      )}

      {/* Image grid */}
      {images.length === 0 && !isGenerating ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ImageOff className="w-12 h-12 opacity-30" />
          <p className="text-sm">이미지가 아직 생성되지 않았습니다.</p>
          {onStartGeneration && (
            <Button onClick={onStartGeneration} className="gap-2 bg-blue-600 hover:bg-blue-700 mt-2">
              이미지 생성 시작
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((image) => (
            <ImageCard
              key={image.index}
              image={image}
              onRegenerate={onRegenerate}
              isGenerating={isGenerating}
            />
          ))}
        </div>
      )}

      <Separator />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onSave && (
          <Button
            variant="outline"
            onClick={onSave}
            disabled={isGenerating || successCount === 0}
            className="gap-2 h-11 px-6 border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            <Save className="w-4 h-4" />
            저장
          </Button>
        )}
        <Button
          onClick={onApproveAll}
          disabled={isGenerating || successCount === 0}
          className="gap-2 h-11 px-8"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCheck className="w-4 h-4" />
          )}
          전체 승인
        </Button>
      </div>
    </div>
  );
}
