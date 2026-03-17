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

// In-memory store (Vercel 서버리스 호환)
// 같은 인스턴스 내에서 유지됨. 콜드 스타트 시 초기화됨.
const sessions = new Map<string, SavedSession>();

export async function saveSession(data: SavedSession): Promise<void> {
  sessions.set(data.id, data);
}

export async function getSession(id: string): Promise<SavedSession | null> {
  return sessions.get(id) ?? null;
}

export async function listSessions(): Promise<SavedSession[]> {
  const all = Array.from(sessions.values());
  all.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return all;
}

export async function deleteSession(id: string): Promise<void> {
  sessions.delete(id);
}
