import fs from "fs/promises";
import path from "path";

const REFS_ROOT = path.join(process.cwd(), "data", "shop-refs");
const SCENE_INDEX_FILE = path.join(REFS_ROOT, "_scene-index.json");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_REF_IMAGES = 3;
/** 장면 매칭 시 첨부할 최대 사진 수. 많으면 콜라주/충돌 위험이라 2장으로 제한. */
const MAX_SCENE_REFS = 2;

/** 프롬프트/사진 장면 카테고리. */
export type SceneTag = "exterior" | "interior" | "exam" | "fitting" | "detail";

const SCENE_TAGS: readonly SceneTag[] = ["exterior", "interior", "exam", "fitting", "detail"];

function isSceneTag(value: string): value is SceneTag {
  return (SCENE_TAGS as readonly string[]).includes(value);
}

/**
 * 장면별 참조사진 폴백 체인. 해당 장면 사진이 없으면 뒤 후보로 대체.
 * exam/fitting/detail 은 매장 내부 톤이라도 살리기 위해 interior 로 폴백.
 */
const SCENE_FALLBACK: Record<SceneTag, SceneTag[]> = {
  exterior: ["exterior"],
  interior: ["interior", "detail"],
  exam: ["exam", "interior"],
  fitting: ["fitting", "interior"],
  detail: ["detail", "interior"],
};

export type ShopRefProfile = {
  /** 매장 실제 사진을 "읽어서" 만든 인테리어 묘사. 프롬프트에 텍스트로 주입(합성 아님). */
  interiorDescription?: string;
  /**
   * 원본 사진을 gti --image 로 직접 첨부(="떡하니 잡아넣기")할지 여부.
   * 기본 false — 사진은 묘사로만 활용하고 새로 그린다(합성티 방지).
   */
  useRawReference?: boolean;
};

type ScenePhotoEntry = { scene: SceneTag; desc?: string };
type ShopSceneEntry = {
  brand?: string;
  interiorDescription?: string;
  photos: Record<string, ScenePhotoEntry>;
};

/**
 * _scene-index.json 을 읽어 매장별 장면 분류를 반환. 파일 없음/깨짐 시 null.
 * (서브에이전트가 전 사진 육안 분류해 생성한 인덱스. 우리 소유 데이터지만 방어적 파싱.)
 */
async function loadSceneIndex(): Promise<Record<string, ShopSceneEntry> | null> {
  try {
    const raw = await fs.readFile(SCENE_INDEX_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const shops = (parsed as { shops?: unknown }).shops;
    if (!shops || typeof shops !== "object") return null;

    const result: Record<string, ShopSceneEntry> = {};
    for (const [shopId, value] of Object.entries(shops as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as { brand?: unknown; interiorDescription?: unknown; photos?: unknown };
      const photos: Record<string, ScenePhotoEntry> = {};
      if (v.photos && typeof v.photos === "object") {
        for (const [file, p] of Object.entries(v.photos as Record<string, unknown>)) {
          if (!p || typeof p !== "object") continue;
          const scene = (p as { scene?: unknown }).scene;
          if (typeof scene === "string" && isSceneTag(scene)) {
            photos[file] = { scene };
          }
        }
      }
      result[shopId] = {
        brand: typeof v.brand === "string" ? v.brand : undefined,
        interiorDescription:
          typeof v.interiorDescription === "string" && v.interiorDescription.trim().length > 0
            ? v.interiorDescription.trim()
            : undefined,
        photos,
      };
    }
    return result;
  } catch {
    return null;
  }
}

// blogId 형식만 허용 (영숫자/언더스코어/하이픈). 경로 트래버설 차단.
const SHOP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * shopId를 검증해 매장 참조 디렉터리 절대경로를 반환. 부적합/탈출 시도 시 null.
 */
function shopRefDir(shopId: string): string | null {
  // shopId === blogId in data/shops.json
  if (!SHOP_ID_PATTERN.test(shopId)) return null;
  const root = path.resolve(REFS_ROOT);
  const dir = path.resolve(root, shopId);
  // REFS_ROOT 밖으로 벗어나면 거부
  if (dir !== root && !dir.startsWith(root + path.sep)) return null;
  return dir;
}

/**
 * 매장별 실제 참조사진 경로 목록 (최대 3장).
 * 폴더/파일 없으면 빈 배열.
 */
export async function getShopRefImages(shopId: string): Promise<string[]> {
  if (!shopId) return [];
  const dir = shopRefDir(shopId);
  if (!dir) return [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const images = entries
      .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(dir, e.name))
      .sort();
    return images.slice(0, MAX_REF_IMAGES);
  } catch {
    return [];
  }
}

/**
 * 매장 인테리어 묘사(profile.json). 없으면 null → 기본 묘사 사용.
 * 이 묘사는 매장 사진을 "읽어서" 텍스트화한 것 — 프롬프트 주입용(합성 아님).
 */
export async function getShopProfile(shopId: string): Promise<ShopRefProfile | null> {
  if (!shopId) return null;
  const dir = shopRefDir(shopId);
  if (!dir) return null;

  // 1순위: _scene-index.json 의 매장별 묘사 (전 사진 육안 분류 기반).
  const index = await loadSceneIndex();
  const fromIndex = index?.[shopId]?.interiorDescription;
  if (fromIndex) {
    return { interiorDescription: fromIndex };
  }

  // 폴백: 매장 폴더의 profile.json.
  const file = path.join(dir, "profile.json");
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const obj = parsed as { interiorDescription?: unknown; useRawReference?: unknown };
    const result: ShopRefProfile = {};
    if (typeof obj.interiorDescription === "string" && obj.interiorDescription.trim().length > 0) {
      result.interiorDescription = obj.interiorDescription.trim();
    }
    if (obj.useRawReference === true) {
      result.useRawReference = true;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * 매장 장면에 첨부할 원본 참조사진.
 * 기본은 빈 배열(사진을 직접 붙여넣지 않음 = 합성티 방지).
 * profile.json 의 useRawReference 가 true 인 매장만 원본 사진을 반환한다.
 */
export async function getStoreReferenceImages(shopId: string): Promise<string[]> {
  if (!shopId) return [];
  const profile = await getShopProfile(shopId);
  if (!profile?.useRawReference) return [];
  return getShopRefImages(shopId);
}

/**
 * 장면별 참조사진 (최대 2장). 프롬프트 장면 태그에 맞는 실제 매장 사진을 골라 반환한다.
 * 예: scene="exam" → 그 매장 검안실 사진. 해당 장면 없으면 폴백 체인(→interior).
 * 사진을 그대로 합성하는 게 아니라 gti --image 참조로 써서 새 장면을 생성한다.
 * 인덱스/사진 없으면 빈 배열 → 묘사(interiorDescription)만으로 생성.
 */
export async function getSceneReferenceImages(
  shopId: string,
  scene: SceneTag
): Promise<string[]> {
  if (!shopId || !isSceneTag(scene)) return [];
  const dir = shopRefDir(shopId);
  if (!dir) return [];

  const index = await loadSceneIndex();
  const entry = index?.[shopId];
  if (!entry || Object.keys(entry.photos).length === 0) return [];

  const order = SCENE_FALLBACK[scene];
  for (const cat of order) {
    const candidates = Object.entries(entry.photos)
      .filter(([, p]) => p.scene === cat)
      .map(([file]) => path.join(dir, file))
      .sort();

    const existing: string[] = [];
    for (const p of candidates) {
      try {
        await fs.access(p);
        existing.push(p);
      } catch {
        // 파일 경로 깨짐(한글/공백 등) → 스킵
      }
      if (existing.length >= MAX_SCENE_REFS) break;
    }
    if (existing.length > 0) return existing;
  }
  return [];
}

/**
 * 장면+폴백 체인의 "모든" 실제 사진 절대경로(존재 확인, 중복 제거, 캡 없음).
 * 라우트에서 매장 컷마다 서로 다른 실제 사진을 배정(distinct)할 때 쓴다.
 * getSceneReferenceImages 와 달리 2장 캡이 없어 후보 풀 전체를 본다.
 */
export async function listScenePhotos(shopId: string, scene: SceneTag): Promise<string[]> {
  if (!shopId || !isSceneTag(scene)) return [];
  const dir = shopRefDir(shopId);
  if (!dir) return [];
  const index = await loadSceneIndex();
  const entry = index?.[shopId];
  if (!entry || Object.keys(entry.photos).length === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const cat of SCENE_FALLBACK[scene]) {
    const candidates = Object.entries(entry.photos)
      .filter(([, p]) => p.scene === cat)
      .map(([file]) => path.join(dir, file))
      .sort();
    for (const p of candidates) {
      if (seen.has(p)) continue;
      try {
        await fs.access(p);
        out.push(p);
        seen.add(p);
      } catch {
        // 깨진 경로 스킵
      }
    }
  }
  return out;
}
