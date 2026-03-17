import crypto from "crypto";

// In-memory store (Vercel 서버리스 호환)
const imageStore = new Map<string, Buffer>();
const paramsStore = new Map<string, {
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
}>();

export async function saveImage(
  sessionId: string,
  index: number,
  base64Data: string
): Promise<{ imageId: string; filePath: string }> {
  const imageId = crypto.randomUUID();
  const buffer = Buffer.from(base64Data, "base64");
  imageStore.set(imageId, buffer);
  return { imageId, filePath: `memory://${sessionId}/${imageId}-${index}.jpg` };
}

export async function getImage(imageId: string): Promise<Buffer | null> {
  return imageStore.get(imageId) ?? null;
}

export async function cleanupSession(sessionId: string): Promise<void> {
  // sessionId is embedded in virtual paths but images are keyed by imageId
  // For memory store, we accept orphaned images are cleaned up on cold start
  void sessionId;
}

// ---------------------------------------------------------------------------
// Generation session params (avoids URL length limits for SSE endpoint)
// ---------------------------------------------------------------------------

export async function saveGenerationParams(params: {
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
}): Promise<string> {
  const token = crypto.randomUUID();
  paramsStore.set(token, params);
  return token;
}

export async function getGenerationParams(token: string): Promise<{
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
} | null> {
  return paramsStore.get(token) ?? null;
}

export async function deleteGenerationParams(token: string): Promise<void> {
  paramsStore.delete(token);
}

export async function cleanupStale(): Promise<void> {
  // In-memory store is cleaned up on cold start automatically
}
