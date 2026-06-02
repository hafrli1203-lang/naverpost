/**
 * 자완 색인 분석 (블라이 "자완 색인 분석" 대응)
 *
 * 블라이 강의 핵심: 내 제목을 형태소로 쪼개 조합 가능한 자동완성(자완) 키워드 중,
 * 검색 수요가 있는데 내 "본문"에는 아직 없는 것을 찾아 자연스럽게 심으면
 * 생각지 못한 키워드에도 추가로 노출될 수 있다.
 *
 * 구현: 제목/키워드 형태소를 시드로 자동완성을 수집 → 제목 형태소로 조합 가능한
 * 후보만 남기고 → 본문에 이미 있는 것/없는 것을 분류 → 없는 것을 삽입 제안한다.
 * 네이버 자격증명이 없으면 graceful unavailable.
 */

export interface AutocompleteSuggestion {
  keyword: string;
  /** 이 후보를 끌어낸 시드 */
  seed: string;
  /** 제목 형태소와 겹치는 토큰 수(관련도) */
  titleOverlap: number;
}

export interface AutocompleteIndexResult {
  status: "available" | "unavailable";
  reason?: string;
  /** 자동완성 후보 중 본문에 이미 반영된 키워드 */
  inBody: string[];
  /** 본문에 없어 삽입을 제안하는 키워드(관련도 내림차순) */
  suggestions: AutocompleteSuggestion[];
  notes: string[];
}

const FETCH_TIMEOUT_MS = 7000;
const MAX_SEEDS = 6;

function normalizeNaverCredential(value: string | undefined): string {
  return (value ?? "").trim();
}

function hasNaverCredentials(): boolean {
  const id = normalizeNaverCredential(process.env.NAVER_CLIENT_ID);
  const secret = normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET);
  return id.length > 0 && secret.length > 0 && id !== "your_client_id";
}

function squash(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function tokenize(text: string): string[] {
  return (text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((t) => t.trim());
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAutocomplete(keyword: string): Promise<string[]> {
  const url = new URL("https://ac.search.naver.com/nx/ac");
  url.searchParams.set("q", keyword);
  url.searchParams.set("con", "0");
  url.searchParams.set("frm", "nv");
  url.searchParams.set("ans", "2");
  url.searchParams.set("r_format", "json");
  url.searchParams.set("r_enc", "UTF-8");
  url.searchParams.set("r_unicode", "0");
  url.searchParams.set("t_koreng", "1");
  url.searchParams.set("run", "2");
  url.searchParams.set("rev", "4");
  url.searchParams.set("q_enc", "UTF-8");
  url.searchParams.set("st", "100");

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://search.naver.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`Naver autocomplete failed (${response.status})`);
  }

  const json = (await response.json()) as {
    items?: Array<Array<Array<string | number> | string>>;
  };

  const suggestions = new Set<string>();
  for (const group of json.items ?? []) {
    for (const entry of group) {
      const word = Array.isArray(entry) ? entry[0] : entry;
      if (typeof word === "string" && word.trim().length > 0) {
        suggestions.add(word.trim());
      }
    }
  }
  return Array.from(suggestions);
}

export async function analyzeAutocompleteIndex(params: {
  title: string;
  mainKeyword: string;
  subKeyword1?: string;
  subKeyword2?: string;
  body: string;
}): Promise<AutocompleteIndexResult> {
  const { title, mainKeyword, subKeyword1, subKeyword2, body } = params;

  if (!hasNaverCredentials()) {
    return {
      status: "unavailable",
      reason: "네이버 자격증명이 없어 자완 색인 분석을 할 수 없습니다.",
      inBody: [],
      suggestions: [],
      notes: [],
    };
  }

  const titleTokens = new Set(tokenize(title));
  const bodySquashed = squash(body);

  // 시드: 메인/서브 키워드 + 제목 토큰
  const seeds = Array.from(
    new Set(
      [mainKeyword, subKeyword1 ?? "", subKeyword2 ?? "", ...Array.from(titleTokens)]
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
    )
  ).slice(0, MAX_SEEDS);

  const seedResults = await Promise.allSettled(
    seeds.map(async (seed) => ({ seed, list: await fetchAutocomplete(seed) }))
  );

  const notes: string[] = [];
  const failed = seedResults.filter((r) => r.status === "rejected").length;
  if (failed > 0) notes.push(`${failed}개 시드의 자동완성 수집에 실패했습니다.`);

  const inBodySet = new Set<string>();
  const suggestionMap = new Map<string, AutocompleteSuggestion>();

  for (const result of seedResults) {
    if (result.status !== "fulfilled") continue;
    const { seed, list } = result.value;
    for (const candidate of list) {
      const candTokens = tokenize(candidate);
      if (candTokens.length === 0) continue;

      // 제목 형태소로 "조합 가능한" 후보만: 토큰 중 최소 1개가 제목 토큰과 겹쳐야 함
      const overlap = candTokens.filter((t) => titleTokens.has(t)).length;
      if (overlap === 0) continue;

      const key = squash(candidate);
      if (bodySquashed.includes(key)) {
        inBodySet.add(candidate);
        continue;
      }

      const existing = suggestionMap.get(key);
      if (!existing || overlap > existing.titleOverlap) {
        suggestionMap.set(key, { keyword: candidate, seed, titleOverlap: overlap });
      }
    }
  }

  const suggestions = Array.from(suggestionMap.values())
    .sort((a, b) => b.titleOverlap - a.titleOverlap || a.keyword.length - b.keyword.length)
    .slice(0, 12);

  if (suggestions.length > 0) {
    notes.push(
      "아래 키워드는 제목 형태소로 조합되는 자동완성어인데 본문에 없습니다. 말이 되게 한 번씩 자연스럽게 녹이면 추가 노출 기회가 생깁니다."
    );
  } else {
    notes.push("본문에 없는 조합형 자동완성 키워드를 찾지 못했습니다.");
  }

  return {
    status: "available",
    inBody: Array.from(inBodySet).slice(0, 20),
    suggestions,
    notes,
  };
}
