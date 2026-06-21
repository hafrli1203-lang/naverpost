# 월별 시즌 키워드 → 시리즈 자동편성 (설계)

> STEP 1 설계 문서. 코드 작성 전 필수(목적·트리거·실패복구·상태경계·아웃풋). 기준: CLAUDE.md 봇 개발 플로우.
> 작성 2026-06-21. 상태: **설계 검토 대기**(코드 미작성).

## 한 줄 목적
**"검색량이 계절마다 오르내리는 키워드를, 뜨는 시점 직전에 N편 시리즈로 미리 편성"** 해서 꾸준한 발행(C-Rank) + 시의성(검색 수요 피크) + 6매장 중복 회피를 동시에 잡는다.

## 왜 지금 가능한가 (부품 재고 — 실측)
이 기능은 70%가 이미 코드로 존재한다. 빠진 건 "월별 시즌 곡선"과 "편성 레이어" 둘뿐.

| 부품 | 위치 | 상태 |
|------|------|------|
| 시리즈 N편 기획(축 순환+자기잠식 가드) | `lib/topics/seriesPlanner.ts` `planKeywordSeries` | ✅ 있음 |
| 월간 절대 검색량 | `lib/naver/searchSignals.ts` `fetchKeywordDemandSignals` (검색광고 API, `monthlyTotalSearches`) | ✅ 있음 |
| 계절→키워드 매핑 | `lib/keywords/seasonalStrategy.ts` `getMonthSeason` | ✅ 있음(휴리스틱) |
| 단기 추세(rising/steady/falling) | `searchSignals.ts` 데이터랩 호출(`/v1/datalab/search`) | ✅ 있음(단, 최근 28일만) |
| BlogOps 노출 1~3위 제외 | `lib/blogops/insights.ts` `getTopExposedKeywordKeys` | ✅ 있음 |
| 발행 간격(cadence) | `lib/blogops/cadence.ts` | ✅ 있음 |
| **12개월 시즌 곡선** | — | ❌ **없음**(아래 갭1) |
| **시즌 캘린더→발행 편성 레이어** | — | ❌ **없음**(아래 갭2) |

### 갭1 — 데이터랩이 지금은 "단기"만 본다 (핵심 발견)
`searchSignals.ts:308` 현재 호출은 `startDate = endDate - 28일`, `timeUnit:"date"`. 즉 **최근 4주 일별**만 받아 rising/falling만 판정한다. 12개월 시즌성(예: "눈 건조"는 겨울, "선글라스"는 여름)을 알려면 **새 호출이 필요**: `startDate = endDate - 1년`, `timeUnit:"month"` → 12개 월별 비율 배열. 인증·fetch·파싱 코드는 그대로 재사용, **시간 창과 timeUnit만 바꾼 새 함수**를 추가한다(`fetchMonthlySeasonality`).

> 한계(정직): 데이터랩은 **상대 비율(0~100)**만 준다(절대 검색수 아님). 절대량은 검색광고 API(`fetchKeywordDemandSignals`)에 있으므로 **둘을 곱해** "이 키워드는 7월에 연중 최고이고 그 달 절대량 약 N회"를 만든다. 둘 다 이미 연동돼 있어 가능.

### 갭2 — 편성 레이어
월별 곡선 + 절대량 + seriesPlanner + cadence를 묶어 "다음 달 발행 캘린더"를 만드는 순수 함수가 없다. 이게 이번 추가의 본체.

## 트리거 조건
- **수동**(1차 범위): 운영자가 대시보드에서 "다음 달 시즌 편성" 버튼 → 매장+카테고리 선택 → 편성표 생성.
- **미래(범위 외)**: 매월 1일 cron 자동 생성. 이번엔 안 한다(설계만 열어둠).

## 아웃풋 정의
`SeasonalSeriesPlan` (순수 데이터, JSON):
```
{
  shopId, month: "2026-07",
  picks: [{
    headKeyword,                 // 예: "선글라스"
    seasonScore: number,         // 해당 월 데이터랩 비율(0~100, 연중 상대 피크도)
    monthlyVolume: number|null,  // 검색광고 절대 월간량
    peakMonth: number,           // 연중 최고 달(1~12)
    rationale: string,           // "7월 연중 피크, 절대량 ~N회"
    series: SeriesPlan           // 기존 planKeywordSeries 결과(N편)
  }],
  schedule: [{ slot, suggestedDate, categoryId, topic, axis }],  // cadence 간격 적용
  notes: string[]               // 자기잠식 제외·데이터 부족 안내
}
```
전달 경로: `POST /api/topics/seasonal-series` → 대시보드 표 + (선택) 세션 일괄 생성 입력.

## 실패 복구
| 실패 | 처리 |
|------|------|
| 데이터랩 API 무응답/한도 | 시즌 곡선 없이 진행 — `seasonalStrategy` 휴리스틱(getMonthSeason)으로 폴백, notes에 "시즌 데이터 미사용" |
| 검색광고 키 미설정 | `monthlyVolume: null`, 시즌 비율만으로 순위(기존 volumeGate 패턴 재사용) |
| BlogOps 다운 | 자기잠식 가드 빈 집합(기존 동작), notes에 안내 |
| 후보 부족 | 요청 N편 중 가능분만(기존 seriesPlanner 동작 계승) |

**원칙: 어떤 외부가 죽어도 빈손 대신 "덜 똑똑한 편성"이라도 낸다**(기존 graceful OFF 일관).

## 상태 경계 (충돌 방지)
| 신규/변경 | 소유 | 공유 인터페이스 |
|------|------|----------------|
| `lib/naver/searchSignals.ts` | 기존 + `fetchMonthlySeasonality(keywords)` 추가(읽기 전용 데이터랩, timeUnit=month) | 기존 export 불변 |
| `lib/topics/seasonalSeriesPlanner.ts`(신규) | 순수 편성 로직 | `planSeasonalSeries(params)` |
| `lib/keywords/seasonalStrategy.ts` | 기존 휴리스틱(폴백으로만 사용) | 불변 |
| `app/api/topics/seasonal-series/route.ts`(신규) | zod 경계검증 + 위임 | POST |

**기존 모듈 시그니처 변경 0**(추가만). seriesPlanner·cadence·volumeGate 재사용.

## 발행 금지 정책 준수
자동 **발행** 아님. 산출물은 "편성표 + 시리즈 초안 입력"이며, 사람이 정해진 날 기존 export(붙여넣기)로 네이버에 임시저장한다. writePost.json 의존 0.

## 검증 계획 (STEP 2~4)
- STEP 2(정상): 고정 시즌 데이터 주입 → 7월 편성에 여름 키워드가 상위, cadence 간격대로 schedule 생성.
- STEP 3(아웃풋): SeasonalSeriesPlan 스키마 일치, 사람이 표로 즉시 판단 가능.
- STEP 4(엣지): 데이터랩 다운/키 없음/BlogOps 다운/후보 부족 4종 폴백. **전부 무비용 단위테스트**(외부 mock — 이번 세션에 깐 패턴 재사용).

## 범위 밖(이번 안 함)
- 매월 cron 자동 편성 · 절대량/비율 가중 튜닝 고도화 · UI 디자인 상세. 본 문서는 "편성 엔진 + 데이터 소스" 설계까지.

## 다음 단계
이 문서 승인 → STEP 2 스펙 테스트(고정 데이터로 편성 엔진 TDD) → 데이터랩 month 호출 추가 → 편성 엔진 → 라우트 → 대시보드. 부품 재고가 많아 엔진+데이터만 새로 짜면 된다.
