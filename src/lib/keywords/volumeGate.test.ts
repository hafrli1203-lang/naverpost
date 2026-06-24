import { describe, it, expect, afterEach } from "vitest";
import { applyVolumeGate, normalizeKeywordKey } from "./volumeGate";
import type { KeywordOption, SearchVolumeSignal } from "@/types";

/**
 * 검색량 게이트 회귀 테스트(순수 로직, fetch 0 — 제공된 signals 배열만 사용).
 * 검색 노출 직결: 실측 저수요/지어낸 조합이 게이트를 통과하면 안 된다.
 * searchAdEnabled는 env(NAVER_SEARCHAD_*)에 의존하므로 테스트에서 설정/복원한다.
 */

const SEARCHAD_KEYS = [
  "NAVER_SEARCHAD_API_KEY",
  "NAVER_SEARCHAD_SECRET_KEY",
  "NAVER_SEARCHAD_CUSTOMER_ID",
] as const;

const saved: Record<string, string | undefined> = {};
function enableSearchAd() {
  for (const k of SEARCHAD_KEYS) {
    saved[k] = process.env[k];
    process.env[k] = "test-credential";
  }
}
afterEach(() => {
  for (const k of SEARCHAD_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function cand(mainKeyword: string): KeywordOption {
  return { title: `${mainKeyword} 방법`, mainKeyword, subKeyword1: "서브 하나", subKeyword2: "서브 둘" } as KeywordOption;
}
function sig(p: Partial<SearchVolumeSignal> & { keyword: string }): SearchVolumeSignal {
  return { monthlyTotalSearches: null, blogDocumentCount: null, ...p } as SearchVolumeSignal;
}

const GATE = { minVolume: 30, maxSaturationRatio: 30 };

describe("normalizeKeywordKey", () => {
  it("공백 제거 + 소문자화", () => {
    expect(normalizeKeywordKey("누진렌즈 적응")).toBe("누진렌즈적응");
    expect(normalizeKeywordKey("  Blue Light  ")).toBe("bluelight");
  });
});

describe("applyVolumeGate — 자격증명 없으면 graceful OFF", () => {
  it("검색광고 키 없으면 모두 unknown + 안내 노트", () => {
    // afterEach가 복원하므로 여기선 일부러 설정하지 않는다(현 프로세스에 키 없다고 가정).
    for (const k of SEARCHAD_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    const r = applyVolumeGate([cand("누진렌즈 적응")], [], GATE);
    expect(r.searchAdEnabled).toBe(false);
    expect(r.candidates[0]._volumeTier).toBe("unknown");
    expect(r.notes.join(" ")).toContain("검색광고 키 필요");
  });
});

describe("applyVolumeGate — 자격증명 있을 때 게이팅", () => {
  it("충분한 검색량 + 낮은 포화 → pass", () => {
    enableSearchAd();
    const r = applyVolumeGate(
      [cand("누진렌즈 적응")],
      [sig({ keyword: "누진렌즈 적응", monthlyTotalSearches: 500, competitionRatio: 5 })],
      GATE
    );
    expect(r.searchAdEnabled).toBe(true);
    expect(r.candidates[0]._volumeTier).toBe("pass");
  });

  it("실측 저수요 → weak (게이트 통과 금지)", () => {
    enableSearchAd();
    const r = applyVolumeGate(
      [cand("누진렌즈 적응")],
      [sig({ keyword: "누진렌즈 적응", monthlyTotalSearches: 10 })],
      GATE
    );
    expect(r.candidates[0]._volumeTier).toBe("weak");
  });

  it("정확 일치만 인정: 부분일치 키워드는 신호 상속 못 함 → weak", () => {
    enableSearchAd();
    // 후보 메인 "누진렌즈 명시야폭"인데 신호는 "누진렌즈"만 → 매칭 안 됨
    const r = applyVolumeGate(
      [cand("누진렌즈 명시야폭")],
      [sig({ keyword: "누진렌즈", monthlyTotalSearches: 9000, competitionRatio: 1 })],
      GATE
    );
    expect(r.candidates[0]._volumeTier).toBe("weak");
  });

  it("pass가 weak/unknown보다 위로 정렬된다", () => {
    enableSearchAd();
    const r = applyVolumeGate(
      [cand("저수요 키워드"), cand("인기 키워드")],
      [
        sig({ keyword: "저수요 키워드", monthlyTotalSearches: 5 }),
        sig({ keyword: "인기 키워드", monthlyTotalSearches: 800, competitionRatio: 3 }),
      ],
      GATE
    );
    expect(r.candidates[0].mainKeyword).toBe("인기 키워드");
    expect(r.candidates[0]._volumeTier).toBe("pass");
  });
});
