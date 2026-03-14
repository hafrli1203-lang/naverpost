import { NextRequest, NextResponse } from "next/server";
import { saveDraft } from "@/lib/naver/blogApi";
import { loadTokens, withTokenRetry } from "@/lib/naver/tokenManager";
import { formatForNaver } from "@/lib/naver/contentFormatter";
import { getShopById } from "@/lib/data/shops";
import type { ArticleContent, BlogImage } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, article, images, sessionId } = body as {
      shopId: string;
      article: ArticleContent;
      images: BlogImage[];
      sessionId: string;
    };

    if (!shopId || !article) {
      return NextResponse.json(
        { success: false, error: "shopId와 article은 필수입니다." },
        { status: 400 }
      );
    }

    const shop = await getShopById(shopId);
    if (!shop) {
      return NextResponse.json(
        { success: false, error: "잘못된 shopId입니다." },
        { status: 400 }
      );
    }

    // Load tokens from env
    loadTokens();

    // Build image URLs for successful images
    const imageUrls = (images ?? [])
      .filter((img) => img.status === "success" && img.imageUrl)
      .sort((a, b) => a.index - b.index)
      .map((img) => {
        // Convert relative URLs to absolute for Naver
        if (img.imageUrl.startsWith("/")) {
          const host = request.headers.get("host") ?? "localhost:3000";
          const protocol = request.headers.get("x-forwarded-proto") ?? "http";
          return `${protocol}://${host}${img.imageUrl}`;
        }
        return img.imageUrl;
      });

    // Format content for Naver blog
    const htmlContent = formatForNaver({
      title: article.title,
      content: article.content,
      imageUrls,
    });

    // Save draft via Naver API with token retry
    const result = await withTokenRetry(shop.blogId, async (accessToken) => {
      return saveDraft({
        title: article.title,
        content: htmlContent,
        blogId: shop.blogId,
        accessToken,
      });
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "임시저장에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { postId: result.postId, sessionId },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "임시저장 중 오류가 발생했습니다.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
