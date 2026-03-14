import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

const TEMP_DIR = path.join(os.tmpdir(), "naverpost-images");
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveImage(
  sessionId: string,
  index: number,
  base64Data: string
): Promise<{ imageId: string; filePath: string }> {
  const sessionDir = path.join(TEMP_DIR, sessionId);
  await ensureDir(sessionDir);

  const imageId = crypto.randomUUID();
  const filePath = path.join(sessionDir, `${imageId}-${index}.jpg`);
  const buffer = Buffer.from(base64Data, "base64");
  await fs.writeFile(filePath, buffer);

  return { imageId, filePath };
}

export async function getImage(imageId: string): Promise<Buffer | null> {
  try {
    await ensureDir(TEMP_DIR);
    const sessions = await fs.readdir(TEMP_DIR);

    for (const session of sessions) {
      const sessionDir = path.join(TEMP_DIR, session);
      const stat = await fs.stat(sessionDir);
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(sessionDir);
      const match = files.find((f) => f.startsWith(imageId));
      if (match) {
        const filePath = path.join(sessionDir, match);
        return await fs.readFile(filePath);
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function cleanupSession(sessionId: string): Promise<void> {
  const sessionDir = path.join(TEMP_DIR, sessionId);
  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory does not exist
  }
}

// ---------------------------------------------------------------------------
// Generation session params (avoids URL length limits for SSE endpoint)
// ---------------------------------------------------------------------------

const PARAMS_DIR = path.join(os.tmpdir(), "naverpost-params");

export async function saveGenerationParams(params: {
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
}): Promise<string> {
  await ensureDir(PARAMS_DIR);
  const token = crypto.randomUUID();
  const filePath = path.join(PARAMS_DIR, `${token}.json`);
  await fs.writeFile(filePath, JSON.stringify(params), "utf-8");
  return token;
}

export async function getGenerationParams(token: string): Promise<{
  sessionId: string;
  articleContent: string;
  title: string;
  mainKeyword: string;
} | null> {
  try {
    const filePath = path.join(PARAMS_DIR, `${token}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteGenerationParams(token: string): Promise<void> {
  try {
    const filePath = path.join(PARAMS_DIR, `${token}.json`);
    await fs.unlink(filePath);
  } catch {
    // Ignore if already deleted
  }
}

export async function cleanupStale(): Promise<void> {
  try {
    await ensureDir(TEMP_DIR);
    const sessions = await fs.readdir(TEMP_DIR);
    const now = Date.now();

    for (const session of sessions) {
      const sessionDir = path.join(TEMP_DIR, session);
      try {
        const stat = await fs.stat(sessionDir);
        if (stat.isDirectory() && now - stat.mtimeMs > STALE_MS) {
          await fs.rm(sessionDir, { recursive: true, force: true });
        }
      } catch {
        // Skip entries that cannot be read
      }
    }
  } catch {
    // Ignore if TEMP_DIR does not exist yet
  }
}
