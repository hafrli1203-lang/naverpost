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

// 파일 기반 저장소: data/sessions/ 디렉토리에 JSON 파일로 저장
// 서버 재시작/재배포해도 데이터가 유지됨
const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function ensureDir(): void {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  } catch {
    // Vercel 등 읽기 전용 파일시스템에서는 무시
  }
}

function sessionPath(id: string): string {
  // 파일명에 안전하지 않은 문자 제거
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

export async function saveSession(data: SavedSession): Promise<void> {
  ensureDir();
  try {
    fs.writeFileSync(sessionPath(data.id), JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[sessionStore] 파일 저장 실패:", err);
    throw new Error("세션 저장에 실패했습니다.");
  }
}

export async function getSession(id: string): Promise<SavedSession | null> {
  try {
    const filePath = sessionPath(id);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<SavedSession[]> {
  ensureDir();
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
    const sessions: SavedSession[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
        sessions.push(JSON.parse(raw) as SavedSession);
      } catch {
        // 손상된 파일 무시
      }
    }
    sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    return sessions;
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const filePath = sessionPath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // 삭제 실패 무시
  }
}
