/**
 * 월별 시즌 키워드 → 시리즈 편성 엔진 (순수 함수).
 * 설계: docs/designs/seasonal-series-planner.md
 *
 * 외부 데이터(데이터랩 12개월 비율·검색광고 절대량·자기잠식 키)를 "주입받아"
 * 편성만 계산한다. 외부 호출 0 → 결정론·무비용 테스트. 데이터 fetch는 라우트 레이어 책임.
 *
 * 하는 일:
 *  1) 후보 헤드 키워드를 대상 월의 시즌 비율로 랭크(동점 시 절대량) + 자기잠식 제외
 *  2) 각 후보의 연중 피크 월 계산
 *  3) cadence 간격(기본 3일)으로 발행 일정(schedule) 배치
 */

export interface SeasonalCandidate {
  headKeyword: string;
  /** 데이터랩 12개월 상대 비율(0~100). 길이 12 권장, 부족하면 시즌 점수 0 처리. */
  monthlyRatios: number[];
  /** 검색광고 절대 월간 검색량. 없으면 null. */
  monthlyVolume: number | null;
}

export interface SeasonalSeriesParams {
  shopId: string;
  /** 대상 월(1~12). 보통 "다음 달". */
  month: number;
  candidates: SeasonalCandidate[];
  /** 뽑을 헤드 키워드 수(기본 4). */
  count?: number;
  /** 일정 기준일(ISO yyyy-mm-dd). 결정론을 위해 주입받는다. */
  startDateIso: string;
  /** 발행 간격(일, 기본 3 — cadence 권장). */
  intervalDays?: number;
  /** 자기잠식 제외: 이미 노출 1~3위인 헤드 키워드 키(공백제거·소문자). */
  excludedKeys?: string[];
}

export interface SeasonalPick {
  headKeyword: string;
  /** 대상 월의 시즌 비율(0~100). */
  seasonScore: number;
  monthlyVolume: number | null;
  /** 연중 최고 비율 월(1~12). 데이터 없으면 null. */
  peakMonth: number | null;
  /** 대상 월이 연중 피크인가. */
  isPeakMonth: boolean;
  rationale: string;
}

export interface SeasonalScheduleSlot {
  slot: number;
  /** ISO yyyy-mm-dd. */
  suggestedDate: string;
  headKeyword: string;
}

export interface SeasonalSeriesPlan {
  shopId: string;
  month: number;
  picks: SeasonalPick[];
  schedule: SeasonalScheduleSlot[];
  notes: string[];
}

const DEFAULT_COUNT = 4;
const DEFAULT_INTERVAL_DAYS = 3;
const MAX_COUNT = 8;

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
  // 동점 피크도 피크로 인정한다(예: 6·7·8월이 모두 최고치면 7월도 피크).
  const isPeakMonth = maxRatio > 0 && seasonScore === maxRatio;
  return { seasonScore, peakMonth: peakIdx + 1, isPeakMonth };
}

/** ISO yyyy-mm-dd에 days를 더한 ISO yyyy-mm-dd(UTC, 결정론). */
function addDaysIso(startDateIso: string, days: number): string {
  const [y, m, d] = startDateIso.split("-").map((part) => Number(part));
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function planSeasonalSeries(params: SeasonalSeriesParams): SeasonalSeriesPlan {
  const month = Math.min(Math.max(1, Math.round(params.month)), 12);
  const count = Math.min(MAX_COUNT, Math.max(1, params.count ?? DEFAULT_COUNT));
  const intervalDays = Math.max(1, params.intervalDays ?? DEFAULT_INTERVAL_DAYS);
  const excluded = new Set((params.excludedKeys ?? []).map(normalizeKey));
  const notes: string[] = [];

  const excludedHits: string[] = [];
  const scored = params.candidates
    .filter((candidate) => {
      if (excluded.has(normalizeKey(candidate.headKeyword))) {
        excludedHits.push(candidate.headKeyword);
        return false;
      }
      return true;
    })
    .map((candidate) => {
      const { seasonScore, peakMonth, isPeakMonth } = seasonMetrics(candidate.monthlyRatios, month);
      const volumeLabel =
        candidate.monthlyVolume != null ? `절대량 약 ${candidate.monthlyVolume}회` : "절대량 미확인";
      const peakLabel = peakMonth ? `${peakMonth}월` : "시즌데이터 없음";
      const pick: SeasonalPick = {
        headKeyword: candidate.headKeyword,
        seasonScore,
        monthlyVolume: candidate.monthlyVolume,
        peakMonth,
        isPeakMonth,
        rationale: isPeakMonth
          ? `${month}월 연중 피크, ${volumeLabel}`
          : `${month}월 시즌점수 ${seasonScore} (연중 피크 ${peakLabel}), ${volumeLabel}`,
      };
      return pick;
    })
    .sort((a, b) => {
      if (b.seasonScore !== a.seasonScore) return b.seasonScore - a.seasonScore;
      return (b.monthlyVolume ?? 0) - (a.monthlyVolume ?? 0);
    });

  const picks = scored.slice(0, count);

  const schedule: SeasonalScheduleSlot[] = picks.map((pick, index) => ({
    slot: index + 1,
    suggestedDate: addDaysIso(params.startDateIso, index * intervalDays),
    headKeyword: pick.headKeyword,
  }));

  if (excludedHits.length > 0) {
    notes.push(
      `이미 검색 상위(1~3위)에 노출 중인 ${excludedHits.length}개는 자기잠식을 막기 위해 편성에서 제외했습니다.`
    );
  }
  if (picks.every((pick) => pick.peakMonth === null)) {
    notes.push("시즌(데이터랩) 데이터가 없어 검색량/순서만으로 편성했습니다.");
  }
  if (picks.length < count) {
    notes.push(`요청한 ${count}편 중 ${picks.length}편만 편성됐습니다(후보 부족).`);
  }

  return { shopId: params.shopId, month, picks, schedule, notes };
}
