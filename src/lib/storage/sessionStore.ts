import fs from "fs/promises";
import path from "path";
import os from "os";

const SESSIONS_DIR = path.join(os.tmpdir(), "naverpost-sessions");

async function ensureDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

export interface SavedImage {
  index: number;
  imageId: string;
  prompt: string;
  section: string;
}

export interface SavedSession {
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
  images?: SavedImage[];
}

export async function saveSession(data: SavedSession): Promise<void> {
  await ensureDir();
  const filePath = path.join(SESSIONS_DIR, `${data.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function getSession(id: string): Promise<SavedSession | null> {
  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<SavedSession[]> {
  await ensureDir();
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions: SavedSession[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
        sessions.push(JSON.parse(raw));
      } catch {
        // skip corrupted files
      }
    }
    // Sort by savedAt descending (newest first)
    sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    return sessions;
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}
