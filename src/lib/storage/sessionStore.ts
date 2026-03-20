import fs from "fs";
import path from "path";

// @vercel/kv는 런타임에만 로드 (빌드 타임 에러 방지)
async function getKv() {
  const { kv } = await import("@vercel/kv");
  return kv;
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

// KV 키 패턴
const SESSION_PREFIX = "session:";
const SESSION_INDEX_KEY = "session:index";

// 로컬 개발 파일 저장소 (KV 미설정 시 fallback)
const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function isKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

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

// ─── KV 기반 저장 ───

async function kvSave(data: SavedSession): Promise<void> {
  const kv = await getKv();
  await kv.set(`${SESSION_PREFIX}${data.id}`, JSON.stringify(data));
  // 인덱스에 세션 ID 추가
  const index: string[] = (await kv.get(SESSION_INDEX_KEY)) ?? [];
  if (!index.includes(data.id)) {
    index.push(data.id);
    await kv.set(SESSION_INDEX_KEY, index);
  }
}

async function kvGet(id: string): Promise<SavedSession | null> {
  const kv = await getKv();
  const raw = await kv.get<string>(`${SESSION_PREFIX}${id}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as SavedSession;
}

async function kvList(): Promise<SavedSession[]> {
  const kv = await getKv();
  const index: string[] = (await kv.get(SESSION_INDEX_KEY)) ?? [];
  const sessions: SavedSession[] = [];
  for (const id of index) {
    const session = await kvGet(id);
    if (session) sessions.push(session);
  }
  sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return sessions;
}

async function kvDelete(id: string): Promise<void> {
  const kv = await getKv();
  await kv.del(`${SESSION_PREFIX}${id}`);
  const index: string[] = (await kv.get(SESSION_INDEX_KEY)) ?? [];
  const updated = index.filter((i) => i !== id);
  await kv.set(SESSION_INDEX_KEY, updated);
}

// ─── 파일 기반 저장 (로컬 개발 fallback) ───

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
  if (isKvAvailable()) {
    try {
      await kvSave(data);
      console.log(`[sessionStore] KV 저장 성공: ${data.id}`);
      return;
    } catch (err) {
      console.error("[sessionStore] KV 저장 실패, 파일 fallback:", err);
    }
  }
  await fileSave(data);
}

export async function getSession(id: string): Promise<SavedSession | null> {
  if (isKvAvailable()) {
    try {
      return await kvGet(id);
    } catch (err) {
      console.error("[sessionStore] KV 읽기 실패, 파일 fallback:", err);
    }
  }
  return fileGet(id);
}

export async function listSessions(): Promise<SavedSession[]> {
  if (isKvAvailable()) {
    try {
      return await kvList();
    } catch (err) {
      console.error("[sessionStore] KV 목록 실패, 파일 fallback:", err);
    }
  }
  return fileList();
}

export async function deleteSession(id: string): Promise<void> {
  if (isKvAvailable()) {
    try {
      await kvDelete(id);
      console.log(`[sessionStore] KV 삭제 성공: ${id}`);
      return;
    } catch (err) {
      console.error("[sessionStore] KV 삭제 실패, 파일 fallback:", err);
    }
  }
  await fileDelete(id);
}
