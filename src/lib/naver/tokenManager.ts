import type { NaverBlogToken } from "@/types";

const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const BUFFER_MS = 5 * 60 * 1000; // 5-minute buffer before expiry

let tokens: NaverBlogToken[] = [];

export function loadTokens(): void {
  const raw = process.env.NAVER_BLOG_TOKENS_JSON;
  if (!raw) {
    tokens = [];
    return;
  }
  try {
    tokens = JSON.parse(raw) as NaverBlogToken[];
  } catch {
    tokens = [];
  }
}

export function getValidToken(blogId: string): NaverBlogToken | null {
  const token = tokens.find((t) => t.blogId === blogId);
  if (!token) return null;
  if (Date.now() >= token.expiresAt - BUFFER_MS) return null;
  return token;
}

export async function refreshToken(
  token: NaverBlogToken
): Promise<NaverBlogToken> {
  const clientId = process.env.NAVER_CLIENT_ID ?? "";
  const clientSecret = process.env.NAVER_CLIENT_SECRET ?? "";

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken,
  });

  const response = await fetch(
    `${NAVER_TOKEN_URL}?${params.toString()}`,
    { method: "GET" }
  );

  if (!response.ok) {
    throw new Error(`Token refresh failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const updated: NaverBlogToken = {
    blogId: token.blogId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };

  // Update in-memory store
  const idx = tokens.findIndex((t) => t.blogId === token.blogId);
  if (idx >= 0) {
    tokens[idx] = updated;
  }

  return updated;
}

export async function withTokenRetry<T>(
  blogId: string,
  fn: (token: string) => Promise<T>
): Promise<T> {
  let token = getValidToken(blogId);

  if (!token) {
    // Attempt to find and refresh expired token
    const expired = tokens.find((t) => t.blogId === blogId);
    if (!expired) throw new Error(`No token found for blogId: ${blogId}`);
    token = await refreshToken(expired);
  }

  try {
    return await fn(token.accessToken);
  } catch (err) {
    const isUnauthorized =
      err instanceof Error && err.message.includes("401");
    if (!isUnauthorized) throw err;

    // Refresh and retry once
    const expiredToken = tokens.find((t) => t.blogId === blogId);
    if (!expiredToken) throw err;
    const refreshed = await refreshToken(expiredToken);
    return await fn(refreshed.accessToken);
  }
}

export function validateAllTokensOnStartup(): {
  blogId: string;
  valid: boolean;
  expiresIn?: number;
}[] {
  return tokens.map((token) => {
    const now = Date.now();
    const valid = token.expiresAt - BUFFER_MS > now;
    const expiresIn = valid
      ? Math.floor((token.expiresAt - now) / 1000)
      : undefined;
    return { blogId: token.blogId, valid, expiresIn };
  });
}
