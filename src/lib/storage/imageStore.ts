import crypto from "crypto";
import fs from "fs";
import path from "path";

// 하이브리드 저장소: 파일 기반 우선, 실패 시 인메모리 fallback
const IMAGES_DIR = path.join(process.cwd(), "data", "images");
const memoryImageStore = new Map<string, Buffer>();
const memoryParamsStore = new Map<string, {
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
}>();
let useFileSystem = true;

function ensureDir(): boolean {
  if (!useFileSystem) return false;
  try {
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
    return true;
  } catch {
    useFileSystem = false;
    return false;
  }
}

function imagePath(imageId: string): string {
  const safeId = imageId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(IMAGES_DIR, `${safeId}.jpg`);
}

export async function saveImage(
  sessionId: string,
  index: number,
  base64Data: string
): Promise<{ imageId: string; filePath: string }> {
  const imageId = crypto.randomUUID();
  const buffer = Buffer.from(base64Data, "base64");

  if (ensureDir()) {
    try {
      const filePath = imagePath(imageId);
      fs.writeFileSync(filePath, buffer);
      return { imageId, filePath };
    } catch {
      useFileSystem = false;
    }
  }

  // 인메모리 fallback
  memoryImageStore.set(imageId, buffer);
  return { imageId, filePath: `memory://${sessionId}/${imageId}-${index}.jpg` };
}

export async function getImage(imageId: string): Promise<Buffer | null> {
  // 파일에서 읽기 시도
  if (useFileSystem) {
    try {
      const filePath = imagePath(imageId);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
    } catch {
      // 무시
    }
  }

  // 인메모리 fallback
  return memoryImageStore.get(imageId) ?? null;
}

export async function cleanupSession(sessionId: string): Promise<void> {
  void sessionId;
  // 파일 기반에서는 sessionId별 정리가 필요하면 별도 매핑 필요
  // 현재는 수동 정리 또는 cleanupStale에서 처리
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
  memoryParamsStore.set(token, params);
  return token;
}

export async function getGenerationParams(token: string): Promise<{
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
} | null> {
  return memoryParamsStore.get(token) ?? null;
}

export async function deleteGenerationParams(token: string): Promise<void> {
  memoryParamsStore.delete(token);
}

export async function cleanupStale(): Promise<void> {
  // 파일 기반: 오래된 이미지 정리 (24시간 이상)
  if (!ensureDir()) return;
  try {
    const files = fs.readdirSync(IMAGES_DIR);
    const now = Date.now();
    const MAX_AGE = 24 * 60 * 60 * 1000; // 24시간
    for (const file of files) {
      try {
        const filePath = path.join(IMAGES_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_AGE) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // 개별 파일 오류 무시
      }
    }
  } catch {
    // 무시
  }
}
