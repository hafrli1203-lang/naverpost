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
import type { ArticleOptions } from "@/components/ShopSelector";
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

  const [maxStageReached, setMaxStageReached] = useState<number>(state.currentStage);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  const [savedPostId, setSavedPostId] = useState<string | undefined>(undefined);
  const [keywordOptions, setKeywordOptions] = useState<KeywordOption[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [articleOptions, setArticleOptions] = useState<ArticleOptions | null>(null);
  const [savedSessions, setSavedSessions] = useState<Array<{
    id: string;
    savedAt: string;
    shopName: string;
    category: string;
    topic: string;
    title: string;
    mainKeyword: string;
    subKeyword1: string;
    subKeyword2: string;
    articleContent: string;
    images?: { index: number; imageId: string; prompt: string; section: string }[];
  }>>([]);

  const loadSavedSessions = useCallback(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setSavedSessions(json.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setShops(json.data);
      })
      .catch(() => {});
    loadSavedSessions();
  }, [loadSavedSessions]);

  const handleStart = useCallback(
    async (shopId: string, categoryId: string, topic: string, opts?: ArticleOptions) => {
      const shop = shops.find((s) => s.id === shopId) ?? null;
      const category = CATEGORIES.find((c) => c.id === categoryId) ?? null;
      if (!shop || !category) return;

      if (opts) setArticleOptions(opts);
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

        const raw = json.data?.results;
        const options: KeywordOption[] = Array.isArray(raw) ? raw : [];
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
      const rawResults = json.data?.results;
      setKeywordOptions(Array.isArray(rawResults) ? rawResults : []);
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
            ...(articleOptions ?? {}),
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
        setMaxStageReached((prev) => Math.max(prev, 2));
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
    setState((prev) => ({ ...prev, currentStage: 3, images: [] }));
    setMaxStageReached((prev) => Math.max(prev, 3));
  }, [state.article, state.shop, setState]);

  const handleStartImageGeneration = useCallback(async () => {
    if (!state.article || !state.shop) return;

    setIsGeneratingImages(true);
    setImageProgress({ current: 0, total: 10 });

    try {
      // Base64로 파라미터를 URL에 직접 전달 (Vercel 서버리스 인스턴스 분리 문제 해결)
      const params = JSON.stringify({
        sessionId: state.sessionId,
        articleContent: state.article.content,
        title: state.article.title,
        mainKeyword: state.article.mainKeyword,
      });
      const encoded = btoa(unescape(encodeURIComponent(params)));
      const eventSource = new EventSource(`/api/image/generate?params=${encoded}`);

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
            if (event.error) {
              toast.error(`이미지 생성 실패: ${event.error}`);
            } else {
              toast.success(`이미지 생성 완료: 성공 ${event.successCount ?? 0}개, 실패 ${event.failCount ?? 0}개`);
            }
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
  }, [state.article, state.shop, state.sessionId, setState]);

  const handleImageRegenerate = useCallback(
    async (index: number, customPrompt?: string) => {
      if (!state.shop) return;

      setState({
        ...state,
        images: state.images.map((img) =>
          img.index === index ? { ...img, status: "generating" as const } : img
        ),
      });

      try {
        const body: { index: number; sessionId: string; prompt?: string } = {
          index,
          sessionId: state.sessionId,
        };
        if (customPrompt) body.prompt = customPrompt;

        const res = await fetch("/api/image/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
                  ...(customPrompt ? { prompt: customPrompt } : {}),
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
    setState((prev) => ({ ...prev, currentStage: 4 }));
    setMaxStageReached((prev) => Math.max(prev, 4));
  }, [setState]);

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

  const handleStageChange = useCallback(
    (stage: number) => {
      if (stage <= maxStageReached) {
        setState({ ...state, currentStage: stage as 1 | 2 | 3 | 4 });
      }
    },
    [state, setState, maxStageReached]
  );

  const handleSaveSession = useCallback(async () => {
    if (!state.article) return;
    try {
      const savedImages = state.images
        .filter((img) => img.status === "success")
        .map((img) => ({
          index: img.index,
          imageId: img.imageId,
          prompt: img.prompt,
          section: img.section,
        }));
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.sessionId,
          shopName: state.shop?.name ?? "",
          category: state.category?.name ?? "",
          topic: state.topic,
          title: state.article.title,
          mainKeyword: state.article.mainKeyword,
          subKeyword1: state.article.subKeyword1,
          subKeyword2: state.article.subKeyword2,
          articleContent: state.article.content,
          images: savedImages,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("작업이 저장되었습니다.");
        loadSavedSessions();
      } else {
        toast.error("저장 실패: " + (json.error ?? ""));
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  }, [state, loadSavedSessions]);

  const handleLoadSession = useCallback(
    (session: typeof savedSessions[number]) => {
      const shop = shops.find((s) => s.name === session.shopName) ?? null;
      const category = CATEGORIES.find((c) => c.name === session.category) ?? null;
      const article: ArticleContent = {
        title: session.title,
        content: session.articleContent,
        mainKeyword: session.mainKeyword,
        subKeyword1: session.subKeyword1,
        subKeyword2: session.subKeyword2,
        shopName: session.shopName,
        category: session.category,
        validation: {
          needsRevision: false,
          prohibitedWords: [],
          cautionPhrases: [],
          overusedWords: [],
          missingKeywords: [],
          hasTable: true,
          revisionReasons: [],
        },
      };
      const restoredImages: BlogImage[] = (session.images ?? []).map((img) => ({
        index: img.index,
        imageId: img.imageId,
        imageUrl: `/api/image/file/${img.imageId}`,
        prompt: img.prompt,
        section: img.section,
        status: "success" as const,
      }));
      const hasImages = restoredImages.length > 0;
      setState({
        sessionId: session.id,
        currentStage: hasImages ? 3 : 2,
        shop,
        category,
        topic: session.topic,
        selectedKeyword: {
          title: session.title,
          mainKeyword: session.mainKeyword,
          subKeyword1: session.subKeyword1,
          subKeyword2: session.subKeyword2,
        },
        article,
        images: restoredImages,
        naverDraftSaved: false,
      });
      setMaxStageReached(hasImages ? 3 : 2);
      toast.success("저장된 작업을 불러왔습니다.");
    },
    [shops, setState]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
        loadSavedSessions();
        toast.success("삭제되었습니다.");
      } catch {
        toast.error("삭제 실패");
      }
    },
    [loadSavedSessions]
  );

  const handleStartOver = useCallback(() => {
    clearPersistedState();
    setSavedPostId(undefined);
    setKeywordOptions([]);
    setMaxStageReached(1);
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
            <WorkflowStepper currentStage={state.currentStage} maxStageReached={maxStageReached} onStageClick={handleStageChange} />
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        {uiStage === 0 && (
          <>
            <ShopSelector shops={shops} onStart={handleStart} isLoading={isLoading} />

            {savedSessions.length > 0 && (
              <div className="mt-8 max-w-3xl mx-auto">
                <h3 className="text-base font-semibold mb-3 text-gray-700">저장된 작업</h3>
                <div className="space-y-2">
                  {savedSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-blue-300 transition-colors"
                    >
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => handleLoadSession(s)}
                      >
                        <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.shopName} · {s.category} · {new Date(s.savedAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(s.id);
                        }}
                        className="ml-3 text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
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
            onSave={handleSaveSession}
            isLoading={isLoading || isGeneratingImages}
            targetCharCount={articleOptions?.charCount ?? 2000}
          />
        )}

        {uiStage === 3 && (
          <ImagePreview
            images={state.images}
            onRegenerate={handleImageRegenerate}
            onApproveAll={handleApproveAll}
            onSave={handleSaveSession}
            onStartGeneration={handleStartImageGeneration}
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
