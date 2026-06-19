"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Gauge,
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
import {
  buildNaverPlainText,
  formatForNaver,
  formatForNaverExport,
} from "@/lib/naver/contentFormatter";
import type { PostingAuditResult } from "@/lib/analysis/postingAudit.types";
import { buildSeoSignals } from "./finalConfirmSignals";
import { WorkflowState } from "@/types";

interface FinalConfirmProps {
  state: WorkflowState;
  onStartOver: () => void;
}

// 발행 전 SEO 검수 신호 한 줄. 색상만으로 상태를 구분하지 않도록
// 아이콘(aria-hidden) + "통과/확인필요" 텍스트 + 설명을 함께 제공한다.
function SeoSignalRow({
  status,
  label,
  detail,
}: {
  status: "pass" | "check";
  label: string;
  detail: string;
}) {
  const isPass = status === "pass";
  const Icon = isPass ? CheckCircle : AlertTriangle;
  const tone = isPass ? "text-green-600" : "text-orange-600";
  const statusText = isPass ? "통과" : "확인필요";
  return (
    <li className="flex items-start gap-2">
      <Icon aria-hidden className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
      <span className="text-[12px] leading-5">
        <span className={`font-medium ${tone}`}>
          {label} · {statusText}
        </span>
        <span className="block text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

function buildFinalReport(state: WorkflowState) {
  const article = state.article;
  const keyword = state.selectedKeyword;
  const competitor = article?.brief?.competitorMorphology;

  if (!article || !keyword) {
    return null;
  }

  const strengths: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

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
      risks.length === 0
        ? "발행 준비 상태 좋음"
        : risks.length <= 2
          ? "발행 전 점검 양호"
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
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "working" | "done" | "error">(
    "idle"
  );
  const { shop, category, article, images, selectedKeyword } = state;

  const successImages = useMemo(
    () => images.filter((img) => img.status === "success" && img.imageUrl),
    [images]
  );

  const previewHtml = useMemo(() => {
    if (!article) return "";
    return formatForNaver({
      title: article.title,
      content: article.content,
      imageUrls: successImages.map((img) => img.imageUrl),
    });
  }, [article, successImages]);

  const finalReport = useMemo(() => buildFinalReport(state), [state]);

  // 발행 전 SEO 검수 신호(읽기 전용). posting-audit는 순수 로컬 분석이라
  // AI/외부 API/네이버 write를 유발하지 않는다. 로딩/실패는 export를 막지 않고
  // 섹션만 조용히 숨긴다(audit=null).
  const [seoAudit, setSeoAudit] = useState<PostingAuditResult | null>(null);
  useEffect(() => {
    if (!article?.title?.trim() || !article?.content?.trim()) {
      setSeoAudit(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "posting-audit",
            title: article.title,
            body: article.content,
            mainKeyword: selectedKeyword?.mainKeyword,
            subKeyword1: selectedKeyword?.subKeyword1,
            subKeyword2: selectedKeyword?.subKeyword2,
          }),
        });
        const json = await res.json();
        if (!cancelled) {
          setSeoAudit(res.ok && json.success ? (json.data as PostingAuditResult) : null);
        }
      } catch {
        if (!cancelled) setSeoAudit(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [article?.title, article?.content, selectedKeyword?.mainKeyword, selectedKeyword?.subKeyword1, selectedKeyword?.subKeyword2]);

  const seoSignals = useMemo(() => buildSeoSignals(seoAudit), [seoAudit]);

  // 네이버 스마트에디터에 서식이 살아서 붙도록 리치(text/html) + 평문 폴백을 함께 복사한다.
  // 이미지는 src 상대경로가 깨지므로 [사진 N 자리] 마커로 위치만 표시한다.
  const handleCopyBody = async () => {
    if (!article || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("error");
      return;
    }
    const richHtml = formatForNaverExport({
      title: article.title,
      content: article.content,
      imageCount: successImages.length,
    });
    const plainText = buildNaverPlainText({
      title: article.title,
      content: article.content,
      imageCount: successImages.length,
    });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([richHtml], { type: "text/html" }),
            "text/plain": new Blob([plainText], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      setCopyState("done");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      try {
        await navigator.clipboard.writeText(plainText);
        setCopyState("done");
        window.setTimeout(() => setCopyState("idle"), 2500);
      } catch {
        setCopyState("error");
      }
    }
  };

  // 성공 이미지를 순서대로 일괄 저장. 브라우저 다중 다운로드 차단을 피해 간격을 둔다.
  const handleDownloadAllImages = async () => {
    if (successImages.length === 0) return;
    setDownloadState("working");
    let ok = 0;
    for (let i = 0; i < successImages.length; i++) {
      try {
        const res = await fetch(successImages[i].imageUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `블로그사진-${i + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        ok += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      } catch {
        // 한 장 실패는 건너뛰고 계속한다.
      }
    }
    setDownloadState(ok > 0 ? "done" : "error");
    window.setTimeout(() => setDownloadState("idle"), 2500);
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

      <Card className="border-teal-200 bg-teal-50/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-teal-900">
            <Copy className="h-4 w-4 text-teal-600" />
            네이버에 올리기 (복사 → 붙여넣기)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="h-11 flex-1 gap-2"
              onClick={handleCopyBody}
              disabled={!article}
            >
              {copyState === "done" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copyState === "done"
                ? "본문 복사됨"
                : copyState === "error"
                  ? "복사 실패 (다시)"
                  : "본문 복사 (서식 유지)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 gap-2"
              onClick={handleDownloadAllImages}
              disabled={successImages.length === 0 || downloadState === "working"}
            >
              <Download className="h-4 w-4" />
              {downloadState === "working"
                ? "저장 중..."
                : downloadState === "done"
                  ? "이미지 저장됨"
                  : `이미지 전체 저장 (${successImages.length}장)`}
            </Button>
          </div>

          <div className="rounded-xl border border-teal-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-teal-900">붙여넣는 순서</p>
            <ol className="space-y-1.5 text-sm leading-6 text-slate-700">
              <li>1. 네이버 블로그 글쓰기 화면을 엽니다.</li>
              <li>2. 본문 칸을 누르고 붙여넣기 합니다 (Ctrl+V). 제목과 표가 함께 들어갑니다.</li>
              <li>3. 본문 속 [사진 N 자리] 위치에 저장한 이미지를 끌어다 놓습니다.</li>
              <li>4. 네이버 화면의 임시저장 버튼을 누릅니다 (발행 아님).</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              네이버 편집기가 일부 서식을 단순화할 수 있어 제목·표는 가볍게 다듬어야 할 수
              있습니다. 발행은 직접 확인 후 임시저장만 하세요.
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

      {seoSignals.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-indigo-500" />
              발행 전 SEO 검수 신호
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              검색 노출을 보장하지 않는 참고용 점검이에요.
            </p>
            <ul className="space-y-1.5">
              {seoSignals.map((signal) => (
                <SeoSignalRow
                  key={signal.label}
                  status={signal.status}
                  label={signal.label}
                  detail={signal.detail}
                />
              ))}
            </ul>
            <p className="text-[11px] leading-5 text-muted-foreground">
              검색 노출을 보장하지 않으며, 글 흐름을 해치면서까지 키워드를 넣지 마세요.
            </p>
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
                  onClick={handleCopyBody}
                  disabled={!article}
                >
                  {copyState === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copyState === "done" ? "복사됨" : "본문 복사"}
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
