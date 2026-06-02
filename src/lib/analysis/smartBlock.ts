/**
 * 스마트블록 하위키워드 추론 (블라이 "키워드 분석 → 유형/스마트블록" 대응)
 *
 * 블라이 강의 핵심: 스마트블록 키워드는 제목에 상위 키워드("보청기 가격")가 아니라
 * 더 구체적인 하위 블록 키워드("노인 보청기 가격")가 들어가야 노출된다.
 *
 * 네이버는 스마트블록 구조를 공개 API로 주지 않으므로(블라이는 검색결과 페이지를
 * 파싱한다), 여기서는 깨지기 쉬운 HTML 파싱 대신 두 가지 견고한 신호로 하위키워드를
 * "추론"한다.
 *  1) 자동완성(ac.search.naver.com): 메인키워드를 확장하는 더 구체적인 검색어.
 *  2) 상위 블로그 제목(OpenAPI): 상위 노출 글들이 공통으로 쓰는 더 구체적인 표현.
 *
 * 두 신호가 함께 가리키는 확장어를 "제목에 넣을 하위키워드"로 추천한다.
 * 네이버 자격증명이 없으면 graceful unavailable.
 */

export interface SmartBlockSubKeyword {
  keyword: string;
  /** 상위 블로그 제목 중 이 확장어를 포함한 글 수 */
  titleHits: number;
  /** 자동완성에서 노출된 확장어인지 */
  fromAutocomplete: boolean;
  /** 종합 점수(정렬용) */
  score: number;
}

export interface SmartBlockResult {
  status: "available" | "unavailable";
  reason?: string;
  mainKeyword: string;
  /** 네이버 블로그 검색 총 문서수(발행량 근사) */
  documentVolume: number | null;
  /** 발행량 기반 대략적 경쟁 강도 힌트 */
  blockTypeHint: "high-volume" | "mid-volume" | "long-tail" | "unknown";
  /** 더 구체적인 하위키워드 후보(점수 내림차순) */
  subKeywordCandidates: SmartBlockSubKeyword[];
  /** 제목에 넣을 것을 추천하는 키워드(하위키워드 우선, 없으면 메인키워드) */
  recommendedTitleKeyword: string;
  notes: string[];
}

const FETCH_TIMEOUT_MS = 7000;
const MAX_TITLE_SAMPLE = 20;

function normalizeNaverCredential(value: string | undefined): string {
  return (value ?? "").trim();
}

function hasNaverCredentials(): boolean {
  const id = normalizeNaverCredential(process.env.NAVER_CLIENT_ID);
  const secret = normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET);
  return (
    id.length > 0 &&
    secret.length > 0 &&
    id !== "your_client_id" &&
    secret !== "your_client_secret"
  );
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** 공백 제거 + 소문자: 부분 문자열 비교용 */
function squash(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
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

async function fetchTopBlogTitles(
  keyword: string
): Promise<{ titles: string[]; total: number }> {
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", String(MAX_TITLE_SAMPLE));
  url.searchParams.set("sort", "sim");

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "X-Naver-Client-Id": normalizeNaverCredential(process.env.NAVER_CLIENT_ID),
      "X-Naver-Client-Secret": normalizeNaverCredential(process.env.NAVER_CLIENT_SECRET),
    },
  });

  if (!response.ok) {
    throw new Error(`Naver blog search failed (${response.status})`);
  }

  const json = (await response.json()) as {
    total?: number;
    items?: Array<{ title?: string }>;
  };

  return {
    total: json.total ?? 0,
    titles: (json.items ?? []).map((item) => stripHtml(item.title ?? "")).filter(Boolean),
  };
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

function classifyBlockType(total: number | null): SmartBlockResult["blockTypeHint"] {
  if (total === null) return "unknown";
  if (total >= 50000) return "high-volume";
  if (total >= 5000) return "mid-volume";
  return "long-tail";
}

/**
 * candidate가 mainKeyword를 더 구체적으로 확장한 표현인지.
 * 예) main="보청기 가격", candidate="노인 보청기 가격" → true
 */
function isSpecificExtension(candidate: string, mainKeyword: string): boolean {
  const c = squash(candidate);
  const m = squash(mainKeyword);
  if (!c || !m) return false;
  if (c === m) return false; // 동일어는 하위키워드가 아님
  if (c.length <= m.length) return false; // 더 길어야 구체적
  return c.includes(m); // 메인을 그대로 품으면서 수식어가 붙은 형태
}

export async function inferSmartBlockSubKeywords(
  mainKeyword: string
): Promise<SmartBlockResult> {
  const keyword = mainKeyword.trim();
  const base: Omit<SmartBlockResult, "status"> = {
    mainKeyword: keyword,
    documentVolume: null,
    blockTypeHint: "unknown",
    subKeywordCandidates: [],
    recommendedTitleKeyword: keyword,
    notes: [],
  };

  if (!keyword) {
    return { status: "unavailable", reason: "빈 키워드", ...base };
  }
  if (!hasNaverCredentials()) {
    return {
      status: "unavailable",
      reason: "네이버 OpenAPI 자격증명이 없어 스마트블록 추론을 할 수 없습니다.",
      ...base,
    };
  }

  const [titleResult, autocompleteResult] = await Promise.allSettled([
    fetchTopBlogTitles(keyword),
    fetchAutocomplete(keyword),
  ]);

  const titles =
    titleResult.status === "fulfilled" ? titleResult.value.titles : [];
  const documentVolume =
    titleResult.status === "fulfilled" ? titleResult.value.total : null;
  const autocomplete =
    autocompleteResult.status === "fulfilled" ? autocompleteResult.value : [];

  const notes: string[] = [];
  if (titleResult.status === "rejected") notes.push("상위 블로그 제목 수집 실패.");
  if (autocompleteResult.status === "rejected") notes.push("자동완성 수집 실패.");

  // 1) 자동완성에서 메인키워드를 구체화한 확장어
  const autoExtensions = autocomplete.filter((s) => isSpecificExtension(s, keyword));

  // 2) 후보별 상위 제목 포함 수 집계
  const squashedTitles = titles.map(squash);
  const candidateMap = new Map<string, SmartBlockSubKeyword>();

  const register = (candidate: string, fromAutocomplete: boolean) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const key = squash(trimmed);
    const titleHits = squashedTitles.filter((t) => t.includes(key)).length;
    const existing = candidateMap.get(key);
    if (existing) {
      existing.fromAutocomplete = existing.fromAutocomplete || fromAutocomplete;
      return;
    }
    candidateMap.set(key, {
      keyword: trimmed,
      titleHits,
      fromAutocomplete,
      score: titleHits * 2 + (fromAutocomplete ? 1 : 0),
    });
  };

  for (const ext of autoExtensions) register(ext, true);

  // 3) 상위 제목에서 직접 확장어 후보 추출(메인 키워드 앞에 수식어 1개가 붙은 형태)
  const m = squash(keyword);
  for (const title of titles) {
    const tokens = (title.match(/[가-힣A-Za-z0-9]+/g) ?? []).map((t) => t.trim());
    for (let i = 0; i < tokens.length; i++) {
      // 앞 토큰 + 메인키워드 토큰들 조합 시도
      for (let span = 2; span <= 4; span++) {
        const phrase = tokens.slice(i, i + span).join(" ");
        if (isSpecificExtension(phrase, keyword) && squash(phrase).length <= m.length + 8) {
          register(phrase, false);
        }
      }
    }
  }

  const subKeywordCandidates = Array.from(candidateMap.values())
    .filter((c) => c.titleHits > 0 || c.fromAutocomplete)
    .sort((a, b) => b.score - a.score || b.titleHits - a.titleHits)
    .slice(0, 8);

  // 추천: 상위 제목에 2건 이상 등장하는 하위키워드가 있으면 그것을 제목 메인키워드로.
  const strongCandidate = subKeywordCandidates.find((c) => c.titleHits >= 2);
  const recommendedTitleKeyword = strongCandidate?.keyword ?? keyword;

  if (strongCandidate) {
    notes.push(
      `상위 글 다수가 "${strongCandidate.keyword}"를 제목에 쓰고 있어, 단순 "${keyword}"보다 하위키워드를 제목에 넣는 편이 노출에 유리합니다.`
    );
  } else if (subKeywordCandidates.length > 0) {
    notes.push(
      "하위키워드 후보는 있으나 상위 제목 공통도가 약합니다. 메인키워드 단독도 검토하세요."
    );
  } else {
    notes.push("뚜렷한 하위키워드 신호가 없어 메인키워드를 그대로 사용해도 됩니다.");
  }

  return {
    status: "available",
    mainKeyword: keyword,
    documentVolume,
    blockTypeHint: classifyBlockType(documentVolume),
    subKeywordCandidates,
    recommendedTitleKeyword,
    notes,
  };
}
