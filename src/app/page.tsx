"use client";

import { useState, useCallback, useEffect } from "react";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { ShopSelector } from "@/components/ShopSelector";
import { KeywordOptions } from "@/components/KeywordOptions";
import { ArticlePreview } from "@/components/ArticlePreview";
import { ImagePreview } from "@/components/ImagePreview";
import { FinalConfirm } from "@/components/FinalConfirm";
import { usePersistedWorkflow } from "@/hooks/usePersistedWorkflow";
import { toast } from "sonner";
import { CATEGORIES } from "@/lib/constants";
import type { WorkflowState, KeywordOption, ArticleContent, BlogImage, Shop } from "@/types";

const INITIAL_STATE: WorkflowState = {
  sessionId: "",
  currentStage: 1,
  shop: null,
  category: null,
  topic: "",
  selectedKeyword: null,
  article: null,
  images: [],
  naverDraftSaved: false,
};

function makeInitialState(): WorkflowState {
  return {
    ...INITIAL_STATE,
    sessionId: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36),
  };
}

export default function Home() {
  const [state, setState, clearPersistedState] = usePersistedWorkflow(makeInitialState());

  const uiStage: 0 | 1 | 2 | 3 | 4 = state.shop === null ? 0 : (state.currentStage as 1 | 2 | 3 | 4);

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  const [savedPostId, setSavedPostId] = useState<string | undefined>(undefined);
  const [keywordOptions, setKeywordOptions] = useState<KeywordOption[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setShops(json.data);
      })
      .catch(() => {});
  }, []);

  const handleStart = useCallback(
    async (shopId: string, categoryId: string, topic: string) => {
      const shop = shops.find((s) => s.id === shopId) ?? null;
      const category = CATEGORIES.find((c) => c.id === categoryId) ?? null;
      if (!shop || !category) return;

      setIsLoading(true);
      try {
        const res = await fetch("/api/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, categoryId, topic }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "키워드 생성에 실패했습니다.");
        }

        const options: KeywordOption[] = json.data?.results ?? [];
        setKeywordOptions(options);
        setState({
          ...state,
          sessionId: crypto.randomUUID(),
          shop,
          category,
          topic,
          currentStage: 1,
          selectedKeyword: null,
          article: null,
          images: [],
          naverDraftSaved: false,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "키워드 생성 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [state, setState, shops]
  );

  const handleKeywordRegenerate = useCallback(async () => {
    if (!state.shop || !state.category) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: state.shop.id,
          categoryId: state.category.id,
          topic: state.topic,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "키워드 재생성에 실패했습니다.");
      }
      setKeywordOptions(json.data?.results ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "키워드 재생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [state]);

  const handleKeywordSelect = useCallback(
    async (option: KeywordOption) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/article", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: option,
            shopId: state.shop?.id,
            categoryId: state.category?.id,
            topic: state.topic,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "본문 작성에 실패했습니다.");
        }

        setState({
          ...state,
          selectedKeyword: option,
          article: json.data as ArticleContent,
          currentStage: 2,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "본문 작성 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [state, setState]
  );

  const handleArticleRewrite = useCallback(async () => {
    if (!state.selectedKeyword) return;
    await handleKeywordSelect(state.selectedKeyword);
  }, [state.selectedKeyword, handleKeywordSelect]);

  const handleManualEdit = useCallback(
    (content: string) => {
      if (!state.article) return;
      setState({ ...state, article: { ...state.article, content } });
    },
    [state, setState]
  );

  const handleArticleApprove = useCallback(async () => {
    if (!state.article || !state.shop) return;

    setIsGeneratingImages(true);
    setImageProgress({ current: 0, total: 10 });
    setState({ ...state, currentStage: 3, images: [] });

    try {
      const params = new URLSearchParams({
        sessionId: state.sessionId,
        articleContent: state.article.content,
        title: state.article.title,
        mainKeyword: state.article.mainKeyword,
      });

      const eventSource = new EventSource(`/api/image/generate?${params.toString()}`);

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === "progress") {
            setImageProgress({ current: event.index ?? 0, total: event.total ?? 10 });
          } else if (event.type === "image-ready") {
            const img: BlogImage = {
              index: event.index,
              imageId: event.imageId ?? "",
              imageUrl: event.imageUrl ?? "",
              prompt: event.prompt ?? "",
              section: `섹션 ${event.index + 1}`,
              status: "success",
            };
            setState((prev) => ({
              ...prev,
              images: [...prev.images.filter((i) => i.index !== event.index), img].sort(
                (a, b) => a.index - b.index
              ),
            }));
          } else if (event.type === "image-failed") {
            const img: BlogImage = {
              index: event.index,
              imageId: "",
              imageUrl: "",
              prompt: "",
              section: `섹션 ${event.index + 1}`,
              status: "failed",
            };
            setState((prev) => ({
              ...prev,
              images: [...prev.images.filter((i) => i.index !== event.index), img].sort(
                (a, b) => a.index - b.index
              ),
            }));
          } else if (event.type === "complete") {
            eventSource.close();
            setIsGeneratingImages(false);
            setImageProgress({
              current: event.successCount ?? 0,
              total: event.total ?? 10,
            });
            toast.success(`이미지 생성 완료: 성공 ${event.successCount ?? 0}개, 실패 ${event.failCount ?? 0}개`);
          }
        } catch {
          // Ignore SSE parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsGeneratingImages(false);
        toast.error("이미지 생성 중 연결 오류가 발생했습니다.");
      };
    } catch (err) {
      setIsGeneratingImages(false);
      toast.error(err instanceof Error ? err.message : "이미지 생성 중 오류가 발생했습니다.");
    }
  }, [state, setState]);

  const handleImageRegenerate = useCallback(
    async (index: number) => {
      if (!state.shop) return;

      setState({
        ...state,
        images: state.images.map((img) =>
          img.index === index ? { ...img, status: "generating" as const } : img
        ),
      });

      try {
        const res = await fetch("/api/image/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, sessionId: state.sessionId }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? "재생성 실패");

        setState((prev) => ({
          ...prev,
          images: prev.images.map((img) =>
            img.index === index
              ? {
                  ...img,
                  status: "success" as const,
                  imageUrl: json.data.imageUrl,
                  imageId: json.data.imageId,
                }
              : img
          ),
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          images: prev.images.map((img) =>
            img.index === index ? { ...img, status: "failed" as const } : img
          ),
        }));
        toast.error(err instanceof Error ? err.message : "이미지 재생성 중 오류가 발생했습니다.");
      }
    },
    [state, setState]
  );

  const handleApproveAll = useCallback(() => {
    setState({ ...state, currentStage: 4 });
  }, [state, setState]);

  // TODO: 네이버 연동 — 사용자 요청 시 활성화
  // 현재는 로컬 완료 처리만 수행 (네이버 API 호출 안 함)
  const handleSaveDraft = useCallback(async () => {
    if (!state.shop) return;
    setIsLoading(true);
    try {
      setSavedPostId("local-preview");
      setState({ ...state, naverDraftSaved: true });
      clearPersistedState();
      toast.success("작성 완료! 네이버 연동은 아직 비활성 상태입니다.");
    } finally {
      setIsLoading(false);
    }
  }, [state, setState, clearPersistedState]);

  const handleStartOver = useCallback(() => {
    clearPersistedState();
    setSavedPostId(undefined);
    setKeywordOptions([]);
    setState(makeInitialState());
  }, [clearPersistedState, setState]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">네이버 블로그 자동 작성</h1>
          {uiStage > 0 && (
            <button
              onClick={handleStartOver}
              className="text-sm text-muted-foreground hover:text-gray-700 transition-colors"
            >
              처음으로
            </button>
          )}
        </div>
      </header>

      {uiStage > 0 && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4">
            <WorkflowStepper currentStage={state.currentStage} />
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        {uiStage === 0 && (
          <ShopSelector shops={shops} onStart={handleStart} isLoading={isLoading} />
        )}

        {uiStage === 1 && (
          <KeywordOptions
            options={keywordOptions}
            onSelect={handleKeywordSelect}
            onRegenerate={handleKeywordRegenerate}
            isLoading={isLoading}
          />
        )}

        {uiStage === 2 && state.article && (
          <ArticlePreview
            article={state.article}
            onApprove={handleArticleApprove}
            onRewrite={handleArticleRewrite}
            onManualEdit={handleManualEdit}
            isLoading={isLoading || isGeneratingImages}
          />
        )}

        {uiStage === 3 && (
          <ImagePreview
            images={state.images}
            onRegenerate={handleImageRegenerate}
            onApproveAll={handleApproveAll}
            isGenerating={isGeneratingImages}
            progress={imageProgress}
          />
        )}

        {uiStage === 4 && (
          <FinalConfirm
            state={state}
            onSaveDraft={handleSaveDraft}
            onStartOver={handleStartOver}
            isLoading={isLoading}
            savedPostId={savedPostId}
          />
        )}
      </main>
    </div>
  );
}
