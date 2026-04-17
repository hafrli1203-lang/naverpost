import fs from "fs";
import path from "path";

export interface SavedImage {
  index: number;
  imageId: string;
  mimeType?: string;
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

// KV 키 패턴
const SESSION_PREFIX = "session:";
const SESSION_INDEX_KEY = "session:index";

// 로컬 개발 파일 저장소 (KV 미설정 시 fallback)
const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

// ─── Upstash REST API (fetch 기반, 추가 패키지 불필요) ───

function getKvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function kvCommand(...args: string[]): Promise<unknown> {
  const config = getKvConfig();
  if (!config) throw new Error("KV not configured");

  const res = await fetch(`${config.url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`KV error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.result;
}

async function kvSet(key: string, value: string): Promise<void> {
  await kvCommand("SET", key, value);
}

async function kvGet(key: string): Promise<string | null> {
  const result = await kvCommand("GET", key);
  return result as string | null;
}

async function kvDel(key: string): Promise<void> {
  await kvCommand("DEL", key);
}

// ─── KV 기반 저장 ───

async function kvSaveSession(data: SavedSession): Promise<void> {
  await kvSet(`${SESSION_PREFIX}${data.id}`, JSON.stringify(data));
  // 인덱스에 세션 ID 추가
  const rawIndex = await kvGet(SESSION_INDEX_KEY);
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : [];
  if (!index.includes(data.id)) {
    index.push(data.id);
    await kvSet(SESSION_INDEX_KEY, JSON.stringify(index));
  }
}

async function kvGetSession(id: string): Promise<SavedSession | null> {
  const raw = await kvGet(`${SESSION_PREFIX}${id}`);
  if (!raw) return null;
  return JSON.parse(raw) as SavedSession;
}

async function kvListSessions(): Promise<SavedSession[]> {
  const rawIndex = await kvGet(SESSION_INDEX_KEY);
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : [];
  const sessions: SavedSession[] = [];
  for (const id of index) {
    const session = await kvGetSession(id);
    if (session) sessions.push(session);
  }
  sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return sessions;
}

async function kvDeleteSession(id: string): Promise<void> {
  await kvDel(`${SESSION_PREFIX}${id}`);
  const rawIndex = await kvGet(SESSION_INDEX_KEY);
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : [];
  const updated = index.filter((i) => i !== id);
  await kvSet(SESSION_INDEX_KEY, JSON.stringify(updated));
}

// ─── 파일 기반 저장 (로컬 개발 fallback) ───

function ensureDir(): boolean {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error("[sessionStore] 디렉토리 생성 실패:", err);
    return false;
  }
}

function sessionPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

async function fileSave(data: SavedSession): Promise<void> {
  if (!ensureDir()) return;
  try {
    fs.writeFileSync(sessionPath(data.id), JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[sessionStore] 파일 저장 실패:", err);
  }
}

async function fileGet(id: string): Promise<SavedSession | null> {
  try {
    const filePath = sessionPath(id);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as SavedSession;
    }
  } catch (err) {
    console.error("[sessionStore] 파일 읽기 실패:", err);
  }
  return null;
}

async function fileList(): Promise<SavedSession[]> {
  if (!ensureDir()) return [];
  const sessions: SavedSession[] = [];
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
        sessions.push(JSON.parse(raw) as SavedSession);
      } catch {
        // 손상된 파일 무시
      }
    }
  } catch {
    // 무시
  }
  sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return sessions;
}

async function fileDelete(id: string): Promise<void> {
  try {
    const filePath = sessionPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // 무시
  }
}

// ─── 공개 API (KV 우선, 파일 fallback) ───

export async function saveSession(data: SavedSession): Promise<void> {
  if (getKvConfig()) {
    try {
      await kvSaveSession(data);
      console.log(`[sessionStore] KV 저장 성공: ${data.id}`);
      return;
    } catch (err) {
      console.error("[sessionStore] KV 저장 실패, 파일 fallback:", err);
    }
  }
  await fileSave(data);
}

export async function getSession(id: string): Promise<SavedSession | null> {
  if (getKvConfig()) {
    try {
      return await kvGetSession(id);
    } catch (err) {
      console.error("[sessionStore] KV 읽기 실패, 파일 fallback:", err);
    }
  }
  return fileGet(id);
}

export async function listSessions(): Promise<SavedSession[]> {
  if (getKvConfig()) {
    try {
      return await kvListSessions();
    } catch (err) {
      console.error("[sessionStore] KV 목록 실패, 파일 fallback:", err);
    }
  }
  return fileList();
}

export async function deleteSession(id: string): Promise<void> {
  if (getKvConfig()) {
    try {
      await kvDeleteSession(id);
      console.log(`[sessionStore] KV 삭제 성공: ${id}`);
      return;
    } catch (err) {
      console.error("[sessionStore] KV 삭제 실패, 파일 fallback:", err);
    }
  }
  await fileDelete(id);
}
