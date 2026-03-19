import fs from "fs";
import path from "path";

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

// 하이브리드 저장소: 파일 기반 우선, 실패 시 인메모리 fallback
// 로컬 개발: 파일 기반 (재시작해도 유지)
// Vercel: 인메모리 fallback (읽기 전용 파일시스템)
const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");
const memoryFallback = new Map<string, SavedSession>();
let useFileSystem = true;

function ensureDir(): boolean {
  if (!useFileSystem) return false;
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    return true;
  } catch {
    useFileSystem = false;
    return false;
  }
}

function sessionPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

export async function saveSession(data: SavedSession): Promise<void> {
  // 파일 저장 시도
  if (ensureDir()) {
    try {
      fs.writeFileSync(sessionPath(data.id), JSON.stringify(data, null, 2), "utf-8");
      return;
    } catch {
      // 파일 저장 실패 → 인메모리 fallback
      useFileSystem = false;
    }
  }
  // 인메모리 fallback (에러 없이 저장)
  memoryFallback.set(data.id, data);
}

export async function getSession(id: string): Promise<SavedSession | null> {
  // 파일에서 읽기 시도
  if (useFileSystem) {
    try {
      const filePath = sessionPath(id);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as SavedSession;
      }
    } catch {
      // 무시
    }
  }
  // 인메모리 fallback
  return memoryFallback.get(id) ?? null;
}

export async function listSessions(): Promise<SavedSession[]> {
  const sessions: SavedSession[] = [];

  // 파일에서 읽기
  if (ensureDir()) {
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
  }

  // 인메모리 데이터 병합 (파일에 없는 것만)
  const fileIds = new Set(sessions.map((s) => s.id));
  for (const [id, session] of memoryFallback) {
    if (!fileIds.has(id)) {
      sessions.push(session);
    }
  }

  sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return sessions;
}

export async function deleteSession(id: string): Promise<void> {
  // 파일 삭제
  try {
    const filePath = sessionPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // 무시
  }
  // 인메모리에서도 삭제
  memoryFallback.delete(id);
}
