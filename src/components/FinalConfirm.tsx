"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Key,
  RotateCcw,
  Store,
  Tag,
  TrendingUp,
} from "lucide-react";
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

function buildFinalReport(state: WorkflowState) {
  const article = state.article;
  const keyword = state.selectedKeyword;
  const geo = article?.geo;
  const competitor = article?.brief?.competitorMorphology;

  if (!article || !keyword) {
    return null;
  }

  const strengths: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  if (geo) {
    if (geo.score >= 85) {
      strengths.push(`GEO 점수 ${geo.score}점으로 구조와 신뢰성 상태가 좋습니다.`);
    } else if (geo.score >= 70) {
      strengths.push(`GEO 점수 ${geo.score}점으로 기본 구조는 안정적입니다.`);
      actions.push("FAQ, 비교표, 출처 블록 중 빠진 항목이 있으면 한 번 더 보강하는 편이 좋습니다.");
    } else {
      risks.push(`GEO 점수 ${geo.score}점으로 발행 전 구조 보강이 더 필요합니다.`);
      actions.push("GEO 최적화를 다시 열어 질문형 소제목, FAQ, 출처 블록을 우선 적용하세요.");
    }
  }

  if (article.validation.revisionReasons.length === 0) {
    strengths.push("본문 검증에서 큰 수정 사유가 잡히지 않았습니다.");
  } else {
    risks.push(`본문 검증에서 ${article.validation.revisionReasons.length}개의 수정 사유가 남아 있습니다.`);
    actions.push("검증 패널의 수정 사유를 먼저 정리한 뒤 발행하는 편이 안전합니다.");
  }

  if (keyword.analysis?.externalSignals) {
    strengths.push("키워드 후보 단계에서 외부 검색 신호까지 확인된 제목입니다.");
  } else {
    risks.push("키워드가 내부 분석 중심으로만 검토되어 외부 검색 검증은 약한 편입니다.");
  }

  if (keyword.analysis?.bodyExpansionFit?.isLikelyExpandable) {
    strengths.push("본문 확장성이 좋아 체류시간을 받기 쉬운 길이로 풀기 유리합니다.");
  } else {
    risks.push("본문을 길게 쓰면 설명 반복이 생길 수 있는 제목입니다.");
    actions.push("첫 문단과 각 소제목 앞 문장을 더 구체적인 정보형 문장으로 다듬는 것이 좋습니다.");
  }

  if ((keyword.analysis?.duplicateRisk?.titlePatternOverlap.length ?? 0) > 0) {
    risks.push("기존 제목과 유사한 패턴이 감지되어 제목 차별화가 필요할 수 있습니다.");
    actions.push("제목 첫 문장을 바꾸거나 숫자·비교·질문형 각도를 더 분명히 주는 것이 좋습니다.");
  } else {
    strengths.push("제목 중복 위험이 상대적으로 낮은 편입니다.");
  }

  if ((competitor?.contentBlocks?.length ?? 0) > 0) {
    strengths.push("상위 노출 글의 본문 구조 힌트를 생성에 반영했습니다.");
  } else {
    risks.push("상위 노출 글 구조 힌트가 충분히 잡히지 않아 일반 구조로 생성되었을 가능성이 있습니다.");
  }

  if (state.images.filter((image) => image.status === "success").length >= 3) {
    strengths.push("이미지 수가 충분해 본문 구간 분리에 도움이 됩니다.");
  } else {
    risks.push("이미지 수가 적어 본문이 길게 보일 수 있습니다.");
    actions.push("핵심 소제목 구간마다 이미지를 1장씩 배치하면 가독성에 유리합니다.");
  }

  if ((competitor?.cautionPoints?.length ?? 0) > 0) {
    actions.push(...(competitor?.cautionPoints ?? []).slice(0, 2));
  }

  while (actions.length < 3) {
    actions.push("발행 전 첫 200자가 검색 의도를 바로 설명하는지 다시 확인하세요.");
  }

  return {
    exposureLabel:
      geo && geo.score >= 85
        ? "상위노출 가능성 높음"
        : geo && geo.score >= 70
          ? "상위노출 가능성 보통 이상"
          : "발행 전 보강 권장",
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 4),
    actions: actions.slice(0, 3),
  };
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

  const finalReport = useMemo(() => buildFinalReport(state), [state]);

  const handleCopyHtml = async () => {
    if (!previewHtml || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(previewHtml);
    setCopiedHtml(true);
    window.setTimeout(() => setCopiedHtml(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">최종 발행 확인</h2>
        <p className="text-sm text-muted-foreground">
          발행 직전 기준으로 노출 가능성, 남은 리스크, 마지막 보완 포인트를 한 번에 확인할 수
          있게 정리했습니다.
        </p>
      </div>

      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="flex items-start gap-3 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-green-800">발행 가능한 상태입니다.</p>
            <p className="text-sm text-green-700">
              제목, 본문, 이미지, GEO 구조를 한 흐름으로 확인할 수 있습니다. 아래 리포트만 마지막으로
              보고 바로 발행하면 됩니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {finalReport && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              발행 전 점검 리포트
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-800">{finalReport.exposureLabel}</p>
              <p className="mt-1 text-xs leading-5 text-blue-700">
                최종 발행 전에 아래 강점과 리스크를 같이 보고 판단하면 됩니다.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 text-sm font-semibold text-emerald-800">강점</p>
                <div className="space-y-2">
                  {finalReport.strengths.map((item) => (
                    <p key={item} className="text-sm leading-6 text-emerald-900">
                      - {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-800">주의할 점</p>
                <div className="space-y-2">
                  {finalReport.risks.map((item) => (
                    <p key={item} className="text-sm leading-6 text-amber-900">
                      - {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">마지막 추천 3가지</p>
              <div className="space-y-2">
                {finalReport.actions.map((item, index) => (
                  <p key={`${index}-${item}`} className="text-sm leading-6 text-slate-700">
                    {index + 1}. {item}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">요약 정보</CardTitle>
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
              {images.filter((image) => image.status === "success").length}장 준비됨
            </span>
          </div>
          {article?.geo && (
            <div className="flex items-center gap-3">
              <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="w-16 shrink-0 text-sm text-muted-foreground">GEO</span>
              <span className="text-sm font-medium">{article.geo.score}점</span>
            </div>
          )}
        </CardContent>
      </Card>

      {article && (
        <Card>
          <button
            className="flex w-full items-center justify-between rounded-lg px-5 py-4 text-left transition-colors hover:bg-gray-50"
            onClick={() => setArticleExpanded((value) => !value)}
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
                  {copiedHtml ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
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
            onClick={() => setImagesExpanded((value) => !value)}
          >
            <span className="text-sm font-medium">
              이미지 미리보기 ({images.filter((image) => image.status === "success").length}장)
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
                  .filter((image) => image.status === "success" && image.imageUrl)
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

      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-sm leading-6 text-slate-700">
            이 화면은 최종 발행 판단용입니다. 3000 포트는 사용하지 않으며, 테스트 서버가 필요하면
            다른 포트로만 열어야 합니다.
          </p>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-center">
        <Button onClick={onStartOver} variant="outline" className="h-11 gap-2 px-8">
          <RotateCcw className="h-4 w-4" />
          처음부터 다시
        </Button>
      </div>
    </div>
  );
}
