/**
 * 시즌 키워드 발굴 엔진 (설계: seasonal-series-planner.md — 발굴형 전환).
 *
 * 매장 + 월만 입력하면 안경원 업종에서 "그 달 검색량이 높은" 키워드 TOP N을 캐낸다.
 * 사용자가 키워드를 직접 넣지 않는다 — 카테고리 핵심 시드를 검색광고 연관도구로 확장해
 * 후보를 발굴하고, 데이터랩 12개월 곡선으로 그 달 시즌 강도를 매겨 종합 랭킹한다.
 *
 * 두 가지 리스트를 돌려준다:
 *  - coreTop:       카테고리 핵심 시드만 랭킹 (좁고 정확한 "안경원 핵심" TOP N)
 *  - discoveredTop: 시드+연관 전체 랭킹 (넓게 발굴된 "전체" TOP N)
 *
 * 순수 랭킹(rankSeasonalKeywords)은 외부 데이터를 주입받아 결정론적·무비용으로 테스트한다.
 * 외부 fetch는 discoverSeasonalKeywords(IO)가 담당하며, 어떤 외부가 죽어도 빈손 대신
 * "덜 똑똑한 발굴"이라도 낸다(graceful).
 */

import { CATEGORIES } from "@/lib/constants";
import { CATEGORY_CORE_KEYWORDS } from "@/lib/keywords/seasonalStrategy";
import {
  fetchKeywordDemandSignals,
  fetchMonthlySeasonality,
} from "@/lib/naver/searchSignals";
import { getTopExposedKeywordKeys } from "@/lib/blogops/insights";

/** 랭킹에 주입하는 후보(외부 데이터 조립 결과). */
export interface DiscoveryCandidate {
  keyword: string;
  categoryId: string;
  categoryName: string;
  /** 데이터랩 12개월 상대 비율(0~100). 없으면 빈 배열 → 시즌점수 0 처리. */
  monthlyRatios: number[];
  /** 검색광고 절대 월간 검색량. 없으면 null. */
  monthlyVolume: number | null;
}

export interface RankedKeyword {
  keyword: string;
  categoryId: string;
  categoryName: string;
  /** 대상 월의 데이터랩 비율(0~100). */
  seasonScore: number;
  monthlyVolume: number | null;
  /** 연중 최고 비율 월(1~12). 시즌데이터 없으면 null. */
  peakMonth: number | null;
  /** 대상 월이 연중 피크인가. */
  isPeakMonth: boolean;
  /** 그 달 추정 수요 = 절대량 × 시즌비율/100. 시즌데이터 없으면 절대량, 절대량 없으면 null. */
  estimatedMonthlyDemand: number | null;
  /** 그 달 급상승 배수 = 그 달 비율 ÷ 연평균 비율. 1보다 크면 평소보다 이 달에 튄다. 시즌데이터 없으면 null. */
  seasonalLift: number | null;
}

export interface SeasonalDiscoveryResult {
  shopId: string;
  month: number;
  /** 그 달 검색량(추정) 상위 — 꾸준한 큰 소재. */
  volumeTop: RankedKeyword[];
  /** 그 달 급상승(시의성/이슈) 상위 — 평소 대비 이 달에 검색이 튀는 키워드. */
  issueTop: RankedKeyword[];
  notes: string[];
}

const DEFAULT_COUNT = 10;
const MAX_COUNT = 20;
/**
 * 데이터랩 시즌곡선을 받을 후보 상한(절대량 상위). 호출 비용을 묶는다.
 * 이슈(급상승) 랭킹은 시즌데이터가 있어야 평가되므로, 검색량은 중위권이지만
 * 그 달에 튀는 키워드를 덜 놓치도록 컷을 넉넉히 둔다(컷 초과분은 notes로 명시).
 */
const SEASONALITY_FETCH_LIMIT = 60;
/** 이슈(급상승) 리스트의 노이즈 컷 — 절대 검색량이 이보다 작으면 제외. */
const MIN_ISSUE_VOLUME = 200;

function normalizeKey(keyword: string): string {
  return keyword.replace(/\s+/g, "").trim().toLowerCase();
}

/** 비율 배열에서 (대상 월 점수, 피크 월, 대상 월이 연중 최고치인가). 데이터 없으면 (0, null, false). */
function seasonMetrics(monthlyRatios: number[], month: number): {
  seasonScore: number;
  peakMonth: number | null;
  isPeakMonth: boolean;
} {
  if (!Array.isArray(monthlyRatios) || monthlyRatios.length === 0) {
    return { seasonScore: 0, peakMonth: null, isPeakMonth: false };
  }
  const idx = Math.min(Math.max(1, month), monthlyRatios.length) - 1;
  const seasonScore = monthlyRatios[idx] ?? 0;
  let peakIdx = 0;
  for (let i = 1; i < monthlyRatios.length; i += 1) {
    if ((monthlyRatios[i] ?? 0) > (monthlyRatios[peakIdx] ?? 0)) peakIdx = i;
  }
  const maxRatio = monthlyRatios[peakIdx] ?? 0;
  const isPeakMonth = maxRatio > 0 && seasonScore === maxRatio;
  return { seasonScore, peakMonth: peakIdx + 1, isPeakMonth };
}

/** 그 달 추정 수요. 시즌데이터 있으면 절대량×비율/100, 없으면 절대량, 절대량 없으면 null. */
function estimateDemand(
  monthlyVolume: number | null,
  seasonScore: number,
  hasSeasonData: boolean
): number | null {
  if (monthlyVolume == null) return null;
  if (!hasSeasonData || seasonScore <= 0) return monthlyVolume;
  return Math.round((monthlyVolume * seasonScore) / 100);
}

/** 그 달 급상승 배수 = 그 달 비율 ÷ 연평균 비율. 시즌데이터 없거나 평균 0이면 null. */
function computeSeasonalLift(monthlyRatios: number[], seasonScore: number): number | null {
  if (!Array.isArray(monthlyRatios) || monthlyRatios.length === 0) return null;
  const sum = monthlyRatios.reduce((acc, r) => acc + (r ?? 0), 0);
  const mean = sum / monthlyRatios.length;
  if (mean <= 0) return null;
  return Math.round((seasonScore / mean) * 100) / 100;
}

function toRanked(candidate: DiscoveryCandidate, month: number): RankedKeyword {
  const hasSeasonData = Array.isArray(candidate.monthlyRatios) && candidate.monthlyRatios.length > 0;
  const { seasonScore, peakMonth, isPeakMonth } = seasonMetrics(candidate.monthlyRatios, month);
  return {
    keyword: candidate.keyword,
    categoryId: candidate.categoryId,
    categoryName: candidate.categoryName,
    seasonScore,
    monthlyVolume: candidate.monthlyVolume,
    peakMonth,
    isPeakMonth,
    estimatedMonthlyDemand: estimateDemand(candidate.monthlyVolume, seasonScore, hasSeasonData),
    seasonalLift: computeSeasonalLift(candidate.monthlyRatios, seasonScore),
  };
}

/**
 * 후보를 랭킹해 상위 count개를 고른다(순수·결정론). 같은 키워드는 한 번만, 자기잠식 제외.
 * mode "volume": 그 달 추정 검색량 순(꾸준한 큰 소재).
 * mode "issue":  그 달 급상승 배수 순(평소 대비 이 달에 튀는 시의성 키워드). 절대량 노이즈는 컷.
 */
export function rankSeasonalKeywords(params: {
  candidates: DiscoveryCandidate[];
  month: number;
  count: number;
  mode?: "volume" | "issue";
  excludedKeys?: Set<string>;
}): RankedKeyword[] {
  const month = Math.min(Math.max(1, Math.round(params.month)), 12);
  const mode = params.mode ?? "volume";
  const excluded = params.excludedKeys ?? new Set<string>();

  const seen = new Set<string>();
  const ranked: RankedKeyword[] = [];
  for (const candidate of params.candidates) {
    const key = normalizeKey(candidate.keyword);
    if (!key || seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    const item = toRanked(candidate, month);
    if (mode === "issue") {
      // 시의성은 시즌데이터 + 최소 검색량이 있어야 의미가 있다.
      if (item.seasonalLift == null) continue;
      if ((item.monthlyVolume ?? 0) < MIN_ISSUE_VOLUME) continue;
    }
    ranked.push(item);
  }

  ranked.sort((a, b) => {
    if (mode === "issue") {
      const la = a.seasonalLift ?? -1;
      const lb = b.seasonalLift ?? -1;
      if (lb !== la) return lb - la;
      return (b.estimatedMonthlyDemand ?? -1) - (a.estimatedMonthlyDemand ?? -1);
    }
    const da = a.estimatedMonthlyDemand ?? -1;
    const db = b.estimatedMonthlyDemand ?? -1;
    if (db !== da) return db - da;
    if ((b.monthlyVolume ?? 0) !== (a.monthlyVolume ?? 0)) {
      return (b.monthlyVolume ?? 0) - (a.monthlyVolume ?? 0);
    }
    return b.seasonScore - a.seasonScore;
  });

  return ranked.slice(0, params.count);
}

type RawCandidate = {
  keyword: string;
  categoryId: string;
  categoryName: string;
  monthlyVolume: number | null;
  isSeed: boolean;
};

/**
 * 매장 + 월로 안경원 시즌 키워드 두 종류의 TOP N을 발굴한다(IO).
 * 1) 카테고리별 핵심 시드를 검색광고 연관도구로 확장(카테고리 귀속 보존)
 * 2) 절대량 상위 후보만 데이터랩 시즌곡선 조회(호출 비용 절감)
 * 3) 그 달 추정 수요로 coreTop(시드만)·discoveredTop(전체) 각각 랭킹
 */
export async function discoverSeasonalKeywords(params: {
  shopId: string;
  month: number;
  count?: number;
  now?: Date;
}): Promise<SeasonalDiscoveryResult> {
  const month = Math.min(Math.max(1, Math.round(params.month)), 12);
  const count = Math.min(MAX_COUNT, Math.max(1, params.count ?? DEFAULT_COUNT));
  const notes: string[] = [];

  const excludedKeys = await getTopExposedKeywordKeys(params.shopId).catch(() => new Set<string>());

  // 카테고리별 시드 → 검색광고 연관 발굴. 각 결과를 그 카테고리로 태깅(귀속 보존).
  const perCategory = await Promise.all(
    CATEGORIES.map(async (category) => {
      const seeds = CATEGORY_CORE_KEYWORDS[category.id] ?? [];
      if (seeds.length === 0) return [] as RawCandidate[];
      const seedKeys = new Set(seeds.map(normalizeKey));
      const signals = await fetchKeywordDemandSignals(seeds).catch(() => []);
      return signals.map((signal) => ({
        keyword: signal.keyword,
        categoryId: category.id,
        categoryName: category.name,
        monthlyVolume: signal.monthlyTotalSearches ?? null,
        isSeed: seedKeys.has(normalizeKey(signal.keyword)),
      }));
    })
  );

  // 통합·중복 제거. 같은 키워드가 여러 카테고리에서 나오면 절대량 큰 쪽을 남기고,
  // 어느 한 곳에서라도 시드였으면 시드로 표시한다.
  const merged = new Map<string, RawCandidate>();
  for (const candidate of perCategory.flat()) {
    const key = normalizeKey(candidate.keyword);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }
    merged.set(key, {
      ...((candidate.monthlyVolume ?? 0) > (existing.monthlyVolume ?? 0) ? candidate : existing),
      isSeed: existing.isSeed || candidate.isSeed,
    });
  }

  const union = Array.from(merged.values());
  if (union.length === 0) {
    notes.push(
      "검색광고 키워드 도구에서 후보를 발굴하지 못했습니다(키 미설정 또는 응답 없음)."
    );
    return { shopId: params.shopId, month, volumeTop: [], issueTop: [], notes };
  }

  // 절대량 상위 후보만 데이터랩 시즌곡선 조회(나머지는 시즌 없이 절대량으로만 랭킹).
  const forSeason = [...union]
    .sort((a, b) => (b.monthlyVolume ?? 0) - (a.monthlyVolume ?? 0))
    .slice(0, SEASONALITY_FETCH_LIMIT)
    .map((c) => c.keyword);

  // 이슈(급상승) 후보는 시즌데이터가 있어야 평가된다. 검색량 상위 컷 밖에 있는
  // 이슈 적격(>= MIN_ISSUE_VOLUME) 후보는 lift를 못 구해 조용히 누락되므로 한계를 명시한다.
  const issueEligibleCount = union.filter(
    (c) => (c.monthlyVolume ?? 0) >= MIN_ISSUE_VOLUME
  ).length;
  if (issueEligibleCount > SEASONALITY_FETCH_LIMIT) {
    notes.push(
      `급상승 후보 ${issueEligibleCount}개 중 검색량 상위 ${SEASONALITY_FETCH_LIMIT}개만 시즌 분석해, 나머지는 이슈 랭킹에서 누락될 수 있습니다.`
    );
  }

  const seasonality = await fetchMonthlySeasonality(forSeason).catch(() => []);
  const seasonByKey = new Map(seasonality.map((s) => [normalizeKey(s.keyword), s.monthlyRatios]));

  // 시드/연관 구분 없이 안경 도메인 전체를 한 풀로 본다(사용자: "안경 그 달 검색량 / 그 달 이슈").
  const candidates: DiscoveryCandidate[] = union.map((c) => ({
    keyword: c.keyword,
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    monthlyRatios: seasonByKey.get(normalizeKey(c.keyword)) ?? [],
    monthlyVolume: c.monthlyVolume,
  }));

  // 리스트1: 그 달 검색량(추정) 상위. 리스트2: 그 달 급상승(이슈) 상위.
  const volumeTop = rankSeasonalKeywords({ candidates, month, count, mode: "volume", excludedKeys });
  const issueTop = rankSeasonalKeywords({ candidates, month, count, mode: "issue", excludedKeys });

  if (seasonByKey.size === 0) {
    notes.push(
      "데이터랩 시즌 데이터가 없어 검색량만 정렬됩니다(급상승/이슈 판정 불가)."
    );
  }
  if (excludedKeys.size > 0) {
    notes.push("이미 검색 상위(1~3위)에 노출 중인 키워드는 자기잠식을 막기 위해 제외했습니다.");
  }
  notes.push(
    "'이 달 이슈'는 네이버가 전 분야 인기검색어 API를 제공하지 않아 안경 도메인 안에서 그 달 급상승 키워드로 산출합니다."
  );

  return { shopId: params.shopId, month, volumeTop, issueTop, notes };
}
