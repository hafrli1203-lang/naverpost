import type { KeywordOption, KeywordVolumeTier, SearchVolumeSignal } from "@/types";

export interface VolumeGateFields {
  _volumeTier: KeywordVolumeTier;
  _volumeSignal?: SearchVolumeSignal;
  _volumeSaturation: number | null;
}

export interface VolumeGateResult<T extends KeywordOption> {
  candidates: Array<T & VolumeGateFields>;
  notes: string[];
  searchAdEnabled: boolean;
}

export interface VolumeGateOptions {
  minVolume?: number;
  maxSaturationRatio?: number;
}

const DEFAULT_MIN_VOLUME = 30;
const DEFAULT_MAX_SATURATION_RATIO = 30;

function normalizeCredential(value: string | undefined): string {
  return (value ?? "").trim();
}

function hasWorkingSearchAdCredentials(): boolean {
  const apiKey = normalizeCredential(process.env.NAVER_SEARCHAD_API_KEY);
  const secretKey = normalizeCredential(process.env.NAVER_SEARCHAD_SECRET_KEY);
  const customerId = normalizeCredential(process.env.NAVER_SEARCHAD_CUSTOMER_ID);

  return (
    apiKey.length > 0 &&
    secretKey.length > 0 &&
    customerId.length > 0 &&
    !apiKey.startsWith("your_") &&
    !secretKey.startsWith("your_") &&
    !customerId.startsWith("your_")
  );
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeKeywordKey(keyword: string): string {
  return keyword.replace(/\s+/g, "").trim().toLowerCase();
}

function calculateSaturation(signal: SearchVolumeSignal): number | null {
  if (typeof signal.competitionRatio === "number") return signal.competitionRatio;
  const volume = signal.monthlyTotalSearches ?? 0;
  const blogCount = signal.blogDocumentCount ?? null;
  if (volume <= 0 || blogCount === null) return null;
  return blogCount / volume;
}

function findVolumeSignal(
  keyword: string,
  signals: SearchVolumeSignal[]
): SearchVolumeSignal | undefined {
  const key = normalizeKeywordKey(keyword);
  const exact = signals.find((signal) => normalizeKeywordKey(signal.keyword) === key);
  if (exact) return exact;

  return signals.find((signal) => {
    const signalKey = normalizeKeywordKey(signal.keyword);
    return key.includes(signalKey) || signalKey.includes(key);
  });
}

function classifyVolumeTier(params: {
  signal?: SearchVolumeSignal;
  saturation: number | null;
  minVolume: number;
  maxSaturationRatio: number;
  searchAdEnabled: boolean;
}): KeywordVolumeTier {
  if (!params.searchAdEnabled || !params.signal) return "unknown";

  const monthlyTotal = params.signal.monthlyTotalSearches ?? null;
  if (monthlyTotal === null) return "unknown";

  const hasLowSaturation =
    params.saturation === null || params.saturation <= params.maxSaturationRatio;
  if (monthlyTotal >= params.minVolume && hasLowSaturation) return "pass";
  if (monthlyTotal > 0) return "weak";
  return "unknown";
}

function getTierSortWeight(tier: KeywordVolumeTier): number {
  if (tier === "pass") return 2;
  if (tier === "unknown") return 1;
  return 0;
}

function getSignalSortScore(signal?: SearchVolumeSignal, saturation?: number | null): number {
  if (!signal) return 0;
  const monthlyScore = Math.min(200, signal.monthlyTotalSearches ?? 0);
  const opportunityScore = signal.opportunityScore ?? 0;
  const saturationPenalty = saturation === null || saturation === undefined
    ? 0
    : Math.min(120, saturation);
  return monthlyScore + opportunityScore - saturationPenalty;
}

export function applyVolumeGate<T extends KeywordOption>(
  candidates: T[],
  signals: SearchVolumeSignal[],
  options: VolumeGateOptions = {}
): VolumeGateResult<T> {
  const searchAdEnabled = hasWorkingSearchAdCredentials();
  const minVolume = options.minVolume ?? readPositiveNumber(process.env.KEYWORD_MIN_VOLUME, DEFAULT_MIN_VOLUME);
  const maxSaturationRatio =
    options.maxSaturationRatio ??
    readPositiveNumber(process.env.KEYWORD_MAX_SATURATION_RATIO, DEFAULT_MAX_SATURATION_RATIO);
  const notes: string[] = [];

  if (!searchAdEnabled) {
    notes.push("실검색량 미사용(검색광고 키 필요): NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET_KEY, NAVER_SEARCHAD_CUSTOMER_ID를 설정하면 검색량 게이트를 적용합니다.");
  } else if (signals.length === 0) {
    notes.push("검색광고 실검색량 신호가 비어 있어 후보를 unknown으로 처리했습니다.");
  }

  const gated = candidates.map((candidate, index) => {
    const signal = searchAdEnabled ? findVolumeSignal(candidate.mainKeyword, signals) : undefined;
    const saturation = signal ? calculateSaturation(signal) : null;
    const tier = classifyVolumeTier({
      signal,
      saturation,
      minVolume,
      maxSaturationRatio,
      searchAdEnabled,
    });

    return {
      candidate: {
        ...candidate,
        _volumeTier: tier,
        _volumeSignal: signal,
        _volumeSaturation: saturation,
      },
      index,
      sortScore: getTierSortWeight(tier) * 10_000 + getSignalSortScore(signal, saturation),
    };
  });

  gated.sort((a, b) => b.sortScore - a.sortScore || a.index - b.index);

  return {
    candidates: gated.map((item) => item.candidate),
    notes,
    searchAdEnabled,
  };
}
