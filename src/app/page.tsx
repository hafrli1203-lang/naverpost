"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArticlePreview } from "@/components/ArticlePreview";
import { FinalConfirm } from "@/components/FinalConfirm";
import { ImagePreview } from "@/components/ImagePreview";
import { KeywordOptions } from "@/components/KeywordOptions";
import { ShopSelector } from "@/components/ShopSelector";
import type { ArticleOptions } from "@/components/ShopSelector";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { usePersistedWorkflow } from "@/hooks/usePersistedWorkflow";
import { CATEGORIES } from "@/lib/constants";
import type { ArticleContent, BlogImage, KeywordOption, Shop, WorkflowState } from "@/types";

type LooseApiResponse = {
  success?: boolean;
  error?: string;
  data?: unknown;
};

async function safeJson(res: Response): Promise<LooseApiResponse> {
  if (res.status === 401) {
    window.location.href = "/login";
    return { success: false, error: "인증이 필요합니다." };
  }

  const text = await res.text();
  if (!text) {
    return { success: false, error: "빈 응답이 반환되었습니다." };
  }

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: "응답을 JSON으로 해석하지 못했습니다." };
  }
}

const INITIAL_STATE: WorkflowState = {
  sessionId: "",
  currentStage: 1,
  shop: null,
  category: null,
  topic: "",
  selectedKeyword: null,
  article: null,
  images: [],
};

function makeInitialState(): WorkflowState {
  return {
    ...INITIAL_STATE,
    sessionId: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36),
  };
}

export default function Home() {
  const [state, setState, clearPersistedState] = usePersistedWorkflow(makeInitialState());
  const uiStage: 0 | 1 | 2 | 3 | 4 =
    state.shop === null && state.currentStage <= 1 ? 0 : (state.currentStage as 1 | 2 | 3 | 4);

  const [maxStageReached, setMaxStageReached] = useState<number>(state.currentStage);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
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
        if (json.success) setSavedSessions((json.data as typeof savedSessions) ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setShops((json.data as Shop[]) ?? []);
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
        const json = await safeJson(res);
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "키워드 생성에 실패했습니다.");
        }

        const raw = (json.data as { results?: unknown } | undefined)?.results;
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
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "키워드 생성 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [shops, state, setState]
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
      const json = await safeJson(res);
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "키워드 재생성에 실패했습니다.");
      }
      const rawResults = (json.data as { results?: unknown } | undefined)?.results;
      setKeywordOptions(Array.isArray(rawResults) ? (rawResults as KeywordOption[]) : []);
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
        const json = await safeJson(res);
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "본문 생성에 실패했습니다.");
        }

        setState({
          ...state,
          selectedKeyword: option,
          article: json.data as ArticleContent,
          currentStage: 2,
        });
        setMaxStageReached((prev) => Math.max(prev, 2));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "본문 생성 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [articleOptions, state, setState]
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

  const handleArticleApprove = useCallback(() => {
    if (!state.article || !state.shop) return;
    setState((prev) => ({ ...prev, currentStage: 3, images: [] }));
    setMaxStageReached((prev) => Math.max(prev, 3));
  }, [state.article, state.shop, setState]);

  const handleStartImageGeneration = useCallback(
    async (customContent?: { articleContent: string }) => {
      if (!customContent && !state.article) return;

      const articleContent = customContent?.articleContent ?? state.article!.content;
      const title = customContent
        ? articleContent.split("\n")[0].trim().slice(0, 30) || "이미지 생성"
        : state.article!.title;
      const mainKeyword = customContent ? "이미지 생성" : state.article!.mainKeyword;

      setIsGeneratingImages(true);
      setImageProgress({ current: 0, total: 10 });

      try {
        const promptsRes = await fetch("/api/image/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleContent, title, mainKeyword }),
        });
        const promptsJson = await safeJson(promptsRes);
        if (!promptsRes.ok || !promptsJson.success) {
          throw new Error(promptsJson.error ?? "프롬프트 생성 실패");
        }
        const prompts: string[] = (promptsJson.data as { prompts: string[] }).prompts;
        const total = prompts.length;
        setImageProgress({ current: 0, total });

        let completed = 0;
        let successCount = 0;
        let failCount = 0;
        const concurrency = 1;
        let cursor = 0;

        const worker = async () => {
          while (true) {
            const i = cursor++;
            if (i >= total) return;
            try {
              const maxAttempts = 3;
              let lastErr: unknown = null;
              let json: { success?: boolean; error?: string; data?: unknown } = {};
              let res: Response | null = null;
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                  res = await fetch("/api/image/one", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sessionId: state.sessionId,
                      index: i,
                      prompt: prompts[i],
                    }),
                  });
                  json = await safeJson(res);
                  if (res.ok && json.success) {
                    lastErr = null;
                    break;
                  }
                  lastErr = new Error(json.error ?? `HTTP ${res.status}`);
                } catch (e) {
                  lastErr = e;
                }
                if (attempt < maxAttempts) {
                  await new Promise((r) => setTimeout(r, 1000 * attempt));
                }
              }
              if (lastErr) throw lastErr;
              const data = json.data as {
                imageId?: string;
                imageUrl?: string;
                base64Data?: string;
                mimeType?: string;
                prompt?: string;
              };
              const mimeType = data.mimeType || "image/jpeg";
              const imageUrl = data.base64Data
                ? `data:${mimeType};base64,${data.base64Data}`
                : (data.imageUrl ?? "");
              const img: BlogImage = {
                index: i,
                imageId: data.imageId ?? "",
                imageUrl,
                prompt: data.prompt ?? prompts[i],
                section: `섹션 ${i + 1}`,
                status: "success",
              };
              setState((prev) => ({
                ...prev,
                images: [...prev.images.filter((x) => x.index !== i), img].sort(
                  (a, b) => a.index - b.index
                ),
              }));
              successCount++;
            } catch {
              const img: BlogImage = {
                index: i,
                imageId: "",
                imageUrl: "",
                prompt: prompts[i] ?? "",
                section: `섹션 ${i + 1}`,
                status: "failed",
              };
              setState((prev) => ({
                ...prev,
                images: [...prev.images.filter((x) => x.index !== i), img].sort(
                  (a, b) => a.index - b.index
                ),
              }));
              failCount++;
            } finally {
              completed++;
              setImageProgress({ current: completed, total });
            }
          }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        setIsGeneratingImages(false);
        toast.success(`이미지 생성 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
      } catch (err) {
        setIsGeneratingImages(false);
        toast.error(err instanceof Error ? err.message : "이미지 생성 중 오류가 발생했습니다.");
      }
    },
    [state.article, state.sessionId, setState]
  );

  const handleImageRegenerate = useCallback(
    async (index: number, customPrompt?: string) => {
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
        const json = await safeJson(res);
        if (!res.ok || !json.success) throw new Error(json.error ?? "이미지 재생성 실패");

        const regenData = (json.data as {
          mimeType?: string;
          base64Data?: string;
          imageUrl?: string;
          imageId?: string;
        }) ?? { imageUrl: "" };
        const regenMime = regenData.mimeType || "image/jpeg";
        const regenUrl = regenData.base64Data
          ? `data:${regenMime};base64,${regenData.base64Data}`
          : (regenData.imageUrl ?? "");

        setState((prev) => ({
          ...prev,
          images: prev.images.map((img) =>
            img.index === index
              ? {
                  ...img,
                  status: "success" as const,
                  imageUrl: regenUrl,
                  imageId: regenData.imageId ?? "",
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

  const handleStageChange = useCallback(
    (stage: number) => {
      if (stage <= maxStageReached) {
        setState({ ...state, currentStage: stage as 1 | 2 | 3 | 4 });
      }
    },
    [maxStageReached, state, setState]
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
      const json = await safeJson(res);
      if (json.success) {
        toast.success("세션을 저장했습니다.");
        loadSavedSessions();
      } else {
        toast.error("세션 저장 실패: " + (json.error ?? ""));
      }
    } catch {
      toast.error("세션 저장 중 오류가 발생했습니다.");
    }
  }, [loadSavedSessions, state]);

  const handleLoadSession = useCallback(
    (session: (typeof savedSessions)[number]) => {
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
      });
      setMaxStageReached(hasImages ? 3 : 2);
      toast.success("저장된 세션을 불러왔습니다.");
    },
    [setState, shops]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
        loadSavedSessions();
        toast.success("세션을 삭제했습니다.");
      } catch {
        toast.error("세션 삭제 실패");
      }
    },
    [loadSavedSessions]
  );

  const handleStartOver = useCallback(() => {
    clearPersistedState();
    setKeywordOptions([]);
    setMaxStageReached(1);
    setState(makeInitialState());
  }, [clearPersistedState, setState]);

  const handleImageOnly = useCallback(() => {
    setState((prev) => ({ ...prev, currentStage: 3 as 1 | 2 | 3 | 4, images: [] }));
    setMaxStageReached(3);
  }, [setState]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">네이버 블로그 콘텐츠 생성기</h1>
          {uiStage > 0 && (
            <button
              onClick={handleStartOver}
              className="text-sm text-muted-foreground transition-colors hover:text-gray-700"
            >
              새로 시작
            </button>
          )}
        </div>
      </header>

      {uiStage > 0 && (
        <div className="border-b border-gray-100 bg-white">
          <div className="mx-auto max-w-5xl px-4">
            <WorkflowStepper
              currentStage={state.currentStage}
              maxStageReached={maxStageReached}
              onStageClick={handleStageChange}
            />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8">
        {uiStage === 0 && (
          <>
            <ShopSelector shops={shops} onStart={handleStart} isLoading={isLoading} />

            <div className="mx-auto mt-6 max-w-3xl">
              <button
                onClick={handleImageOnly}
                className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-600 transition-colors hover:border-blue-400 hover:text-blue-600"
              >
                이미지 생성만 진행
              </button>
            </div>

            {savedSessions.length > 0 && (
              <div className="mx-auto mt-8 max-w-3xl">
                <h3 className="mb-3 text-base font-semibold text-gray-700">저장된 세션</h3>
                <div className="space-y-2">
                  {savedSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-blue-300"
                    >
                      <div className="flex-1 cursor-pointer" onClick={() => handleLoadSession(s)}>
                        <p className="truncate text-sm font-medium text-gray-900">{s.title}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {s.shopName} · {s.category} · {new Date(s.savedAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(s.id);
                        }}
                        className="ml-3 shrink-0 text-xs text-red-400 transition-colors hover:text-red-600"
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
            hasArticle={!!state.article}
          />
        )}

        {uiStage === 4 && <FinalConfirm state={state} onStartOver={handleStartOver} />}
      </main>
    </div>
  );
}
