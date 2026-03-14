"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES } from "@/lib/constants";
import { Loader2, PenLine, Sparkles, Settings, ChevronDown, ChevronUp, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import type { Shop } from "@/types";

type ArticleType = "info" | "promo";
type PromoSubtype = "blog" | "event" | "season" | "short";

const PROMO_SUBTYPES: { value: PromoSubtype; label: string }[] = [
  { value: "blog", label: "블로그형" },
  { value: "event", label: "행사안내형" },
  { value: "season", label: "시즌제안형" },
  { value: "short", label: "짧은홍보형" },
];

const TONES_INFO = [
  { value: "standard", label: "표준(전문적)" },
  { value: "friendly", label: "친근함(따뜻한)" },
  { value: "casual", label: "캐주얼(대화체)" },
];

const TONES_PROMO = [
  { value: "business", label: "비즈니스형" },
  { value: "friendly", label: "친근형" },
  { value: "expert", label: "전문가형" },
];

const CHAR_COUNTS = [1000, 1500, 2000, 2500];

// Promo subtypes that have fixed lengths (no char count selector)
const FIXED_LENGTH_SUBTYPES: PromoSubtype[] = ["event", "season", "short"];

export interface ArticleOptions {
  articleType: ArticleType;
  tone: string;
  charCount: number;
  contentSubtype?: string;
  eventName?: string;
  eventPeriod?: string;
  benefitContent?: string;
  externalReference?: string;
}

interface ShopSelectorProps {
  shops: Shop[];
  onStart: (shopId: string, categoryId: string, topic: string, options: ArticleOptions) => void;
  isLoading: boolean;
}

export function ShopSelector({ shops, onStart, isLoading }: ShopSelectorProps) {
  const [shopId, setShopId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [topic, setTopic] = useState("");
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // New fields
  const [articleType, setArticleType] = useState<ArticleType>("info");
  const [promoSubtype, setPromoSubtype] = useState<PromoSubtype>("blog");
  const [tone, setTone] = useState("standard");
  const [charCount, setCharCount] = useState(2000);
  const [eventName, setEventName] = useState("");
  const [eventPeriod, setEventPeriod] = useState("");
  const [benefitContent, setBenefitContent] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [externalRefExpanded, setExternalRefExpanded] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const canSubmit = shopId && categoryId && !isLoading;

  const tones = articleType === "info" ? TONES_INFO : TONES_PROMO;
  const showCharCount = articleType === "info" || !FIXED_LENGTH_SUBTYPES.includes(promoSubtype);
  const showEventFields = articleType === "promo" && promoSubtype === "event";
  const showPromoSubtype = articleType === "promo";

  // Reset tone when article type changes
  useEffect(() => {
    setTone(articleType === "info" ? "standard" : "business");
  }, [articleType]);

  // 매장 + 카테고리 선택 시 자동 주제 추천
  useEffect(() => {
    if (!shopId || !categoryId) {
      setSuggestedTopics([]);
      return;
    }

    setIsSuggesting(true);
    setSuggestedTopics([]);

    fetch("/api/topics/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, categoryId }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setSuggestedTopics(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setIsSuggesting(false));
  }, [shopId, categoryId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onStart(shopId, categoryId, topic.trim(), {
      articleType,
      tone,
      charCount,
      contentSubtype: articleType === "promo" ? promoSubtype : undefined,
      eventName: showEventFields ? eventName.trim() : undefined,
      eventPeriod: showEventFields ? eventPeriod.trim() : undefined,
      benefitContent: showEventFields ? benefitContent.trim() : undefined,
      externalReference: externalReference.trim() || undefined,
    });
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <PenLine className="w-6 h-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">블로그 자동 작성</CardTitle>
          <CardDescription className="text-base mt-1">
            안경원과 카테고리를 선택하고 주제를 입력하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 안경원 선택 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="shop-select">안경원 선택</Label>
                <a
                  href="/admin"
                  className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  관리
                </a>
              </div>
              <Select value={shopId} onValueChange={(v) => v && setShopId(v)} disabled={isLoading}>
                <SelectTrigger id="shop-select" className="w-full">
                  <SelectValue placeholder="안경원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((shop) => (
                    <SelectItem key={shop.id} value={shop.id}>
                      {shop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shops.length === 0 && (
                <p className="text-xs text-orange-600">
                  등록된 안경원이 없습니다. <a href="/admin" className="underline">관리 페이지</a>에서 추가하세요.
                </p>
              )}
            </div>

            {/* 카테고리 선택 */}
            <div className="space-y-2">
              <Label htmlFor="category-select">카테고리 선택</Label>
              <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)} disabled={isLoading}>
                <SelectTrigger id="category-select" className="w-full">
                  <SelectValue placeholder="카테고리를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 주제 / 소재 */}
            <div className="space-y-2">
              <Label htmlFor="topic-input">주제 / 소재</Label>
              <Input
                id="topic-input"
                placeholder="직접 입력하거나 아래 추천 주제를 클릭하세요"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isLoading}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground text-right">{topic.length}/100</p>

              {/* AI 자동 주제 추천 */}
              {isSuggesting && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI가 주제를 추천하고 있습니다...
                </div>
              )}
              {suggestedTopics.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    AI 추천 주제 (클릭하여 선택)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedTopics.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setTopic(t)}
                        className="text-xs px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── 글 설정 ── */}
            <div className="space-y-4 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">글 설정</p>

              {/* 글 유형 */}
              <div className="space-y-1.5">
                <Label className="text-sm">글 유형</Label>
                <div className="flex gap-2">
                  {(["info", "promo"] as ArticleType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setArticleType(type)}
                      disabled={isLoading}
                      className={`flex-1 py-1.5 px-3 text-sm rounded-md border transition-colors ${
                        articleType === type
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      {type === "info" ? "정보성 글" : "홍보글"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 홍보글 하위 유형 */}
              {showPromoSubtype && (
                <div className="space-y-1.5">
                  <Label className="text-sm">홍보글 하위 유형</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PROMO_SUBTYPES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPromoSubtype(value)}
                        disabled={isLoading}
                        className={`py-1 px-2.5 text-xs rounded-md border transition-colors ${
                          promoSubtype === value
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 톤앤매너 */}
              <div className="space-y-1.5">
                <Label className="text-sm">톤앤매너</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tones.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTone(value)}
                      disabled={isLoading}
                      className={`py-1 px-2.5 text-xs rounded-md border transition-colors ${
                        tone === value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 글자수 */}
              {showCharCount && (
                <div className="space-y-1.5">
                  <Label className="text-sm">글자수</Label>
                  <div className="flex gap-1.5">
                    {CHAR_COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setCharCount(count)}
                        disabled={isLoading}
                        className={`flex-1 py-1 text-xs rounded-md border transition-colors ${
                          charCount === count
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                        }`}
                      >
                        {count.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── 행사 정보 ── */}
            {showEventFields && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">행사 정보</p>
                <div className="space-y-2">
                  <Input
                    placeholder="행사명 (예: 봄맞이 안경 교체 이벤트)"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    disabled={isLoading}
                    className="text-sm"
                  />
                  <Input
                    placeholder="행사 기간 (예: 2025년 3월 1일 ~ 3월 31일)"
                    value={eventPeriod}
                    onChange={(e) => setEventPeriod(e.target.value)}
                    disabled={isLoading}
                    className="text-sm"
                  />
                  <Input
                    placeholder="혜택 내용 (예: 안경테 20% 할인, 렌즈 무료 증정)"
                    value={benefitContent}
                    onChange={(e) => setBenefitContent(e.target.value)}
                    disabled={isLoading}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {/* ── 참고 자료 ── */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setExternalRefExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full text-left hover:text-gray-700 transition-colors"
              >
                참고 자료 (선택사항)
                {externalRefExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {externalRefExpanded && (
                <div className="space-y-2">
                  <textarea
                    placeholder="웹 검색 결과나 유튜브 요약 또는 참고 문서 내용을 붙여넣으세요"
                    value={externalReference}
                    onChange={(e) => setExternalReference(e.target.value)}
                    disabled={isLoading || isUploading}
                    rows={5}
                    className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <label
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
                        isUploading || isLoading
                          ? "opacity-50 cursor-not-allowed bg-gray-50"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                      }`}
                    >
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      {isUploading ? "업로드 중..." : "파일 업로드"}
                      <input
                        type="file"
                        accept=".txt,.docx,.pdf"
                        className="hidden"
                        disabled={isLoading || isUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setIsUploading(true);
                          try {
                            const formData = new FormData();
                            formData.append("file", file);
                            const res = await fetch("/api/document/upload", {
                              method: "POST",
                              body: formData,
                            });
                            const json = await res.json();
                            if (!res.ok || !json.success) {
                              throw new Error(json.error ?? "파일 업로드 실패");
                            }
                            setExternalReference((prev) =>
                              prev
                                ? prev + "\n\n--- " + file.name + " ---\n" + json.data.text
                                : json.data.text
                            );
                            setUploadedFileName(file.name);
                            toast.success(`${file.name} 업로드 완료 (${json.data.textLength.toLocaleString()}자 추출)`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "파일 처리 중 오류");
                          } finally {
                            setIsUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">.txt .docx .pdf (최대 10MB)</span>
                    {uploadedFileName && (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                        <FileText className="w-3 h-3" />
                        {uploadedFileName}
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFileName("");
                            setExternalReference("");
                          }}
                          className="ml-0.5 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              )}
              {!externalRefExpanded && externalReference && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  참고 자료 {externalReference.length.toLocaleString()}자 입력됨
                </p>
              )}
              {!externalRefExpanded && !externalReference && (
                <p className="text-xs text-muted-foreground">클릭하여 펼치기 — 텍스트 붙여넣기 또는 파일 업로드</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base"
              disabled={!canSubmit}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  키워드 생성 중...
                </>
              ) : (
                "시작"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
