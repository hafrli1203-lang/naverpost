import crypto from "crypto";
import fs from "fs";
import path from "path";

const IMAGES_DIR = process.env.VERCEL
  ? path.join("/tmp", "data", "images")
  : path.join(process.cwd(), "data", "images");
const memoryParamsStore = new Map<
  string,
  {
    sessionId: string;
    articleContent: string;
    title: string;
    mainKeyword: string;
  }
>();

type StoredImageMeta = {
  sessionId: string;
  index: number;
  mimeType: string;
  extension: string;
  savedAt: string;
};

export type StoredImage = {
  buffer: Buffer;
  mimeType: string;
};

function ensureDir(): void {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

function sanitizeImageId(imageId: string): string {
  return imageId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

function imageMetaPath(imageId: string): string {
  return path.join(IMAGES_DIR, `${sanitizeImageId(imageId)}.json`);
}

function imageBinaryPath(imageId: string, extension: string): string {
  return path.join(IMAGES_DIR, `${sanitizeImageId(imageId)}.${extension}`);
}

function readImageMeta(imageId: string): StoredImageMeta | null {
  try {
    const metaPath = imageMetaPath(imageId);
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as StoredImageMeta;
  } catch (error) {
    console.error("[imageStore] Failed to read image metadata:", error);
    return null;
  }
}

function writeImageMeta(imageId: string, meta: StoredImageMeta): void {
  fs.writeFileSync(imageMetaPath(imageId), JSON.stringify(meta, null, 2), "utf-8");
}

export async function saveImage(
  sessionId: string,
  index: number,
  base64Data: string,
  mimeType = "image/jpeg"
): Promise<{ imageId: string; filePath: string; mimeType: string }> {
  ensureDir();

  const imageId = crypto.randomUUID();
  const buffer = Buffer.from(base64Data, "base64");
  const extension = getExtensionFromMimeType(mimeType);
  const filePath = imageBinaryPath(imageId, extension);

  try {
    fs.writeFileSync(filePath, buffer);
    writeImageMeta(imageId, {
      sessionId,
      index,
      mimeType,
      extension,
      savedAt: new Date().toISOString(),
    });
    console.log(`[imageStore] Saved durable image: ${filePath}`);
    return { imageId, filePath, mimeType };
  } catch (error) {
    console.error("[imageStore] Durable image save failed:", error);
    throw new Error("이미지 파일 저장에 실패했습니다. 다시 시도해 주세요.");
  }
}

export async function getImage(imageId: string): Promise<StoredImage | null> {
  try {
    const meta = readImageMeta(imageId);
    if (!meta) return null;

    const filePath = imageBinaryPath(imageId, meta.extension);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return {
      buffer: fs.readFileSync(filePath),
      mimeType: meta.mimeType,
    };
  } catch (error) {
    console.error("[imageStore] Failed to load durable image:", error);
    return null;
  }
}

export async function cleanupSession(sessionId: string): Promise<void> {
  void sessionId;
}

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
  ensureDir();

  try {
    const files = fs.readdirSync(IMAGES_DIR);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000;

    for (const file of files) {
      try {
        if (!file.endsWith(".json")) continue;

        const imageId = file.replace(/\.json$/, "");
        const meta = readImageMeta(imageId);
        if (!meta) continue;

        const age = now - new Date(meta.savedAt).getTime();
        if (age <= maxAge) continue;

        const binaryPath = imageBinaryPath(imageId, meta.extension);
        const metaPath = imageMetaPath(imageId);

        if (fs.existsSync(binaryPath)) {
          fs.unlinkSync(binaryPath);
        }
        if (fs.existsSync(metaPath)) {
          fs.unlinkSync(metaPath);
        }
      } catch {
        // ignore per-file cleanup failures
      }
    }
  } catch {
    // ignore cleanup failures
  }
}
