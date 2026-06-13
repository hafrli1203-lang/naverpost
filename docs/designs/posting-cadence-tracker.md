# 발행 일관성 트래커 (설계)

## 목적
매장별 발행 주기(최근 발행 간격)를 점검해 **C-Rank에 유리한 꾸준한 발행 리듬**을 유지하도록
경과일·평균 간격·권장 간격·상태를 한눈에 보여준다. 네이버 C-Rank의 연결(Chain) 축은 꾸준한
생산 패턴을 반영하므로, 발행이 끊기면 누적 권위가 약해진다.

## 트리거 조건
- 수동. `GET /api/blogops/cadence` (전 매장) 또는 `?shopId=` (단일 매장).
- admin 화면의 "발행 일관성" 패널 로드 시 호출.

## 실패 복구
- BlogOps 미설정/다운: `{ success: true, data: { shops: [], reason } }` (graceful, 화면이 깨지지 않음).
- 개별 매장 조회 실패: 그 매장만 건너뛰고 `reason`에 표면화. 전체는 계속.
- published_at 파싱 실패 항목은 무시(나머지로 계산).

## 상태 경계
- **읽기 전용. 신규 상태 없음.**
- BlogOps `GET /clients` → blog_url로 매장 매핑(client.ts와 동일 규칙) → `GET /posts?client_id=`의
  `published_at`(YYYY-MM-DD)으로 간격 계산.
- 발행/세션/키워드 모듈 미변경. 날짜 기준은 서버 today.

## 아웃풋 정의
```ts
type ShopCadence = {
  shopId: string;
  shopName: string;
  totalPosts: number;
  lastPublishedAt: string | null;   // YYYY-MM-DD
  daysSinceLast: number | null;     // today - lastPublishedAt
  avgIntervalDays: number | null;   // 최근 발행 간격 평균(최대 최근 12건)
  recommendedIntervalDays: number;  // 권장 간격(기본 3일)
  status: "good" | "slowing" | "stale" | "unknown";
  recentDates: string[];            // 최근 발행일(최신순, 최대 8)
};
type CadenceReport = { shops: ShopCadence[]; reason?: string };
```
- status 판정(권장 간격 R=3 기준):
  - `daysSinceLast == null` → unknown(발행 이력 없음)
  - `daysSinceLast <= R*1.5` → good
  - `daysSinceLast <= R*3` → slowing
  - 그 외 → stale
- recommendedIntervalDays는 상수(3). 추후 카테고리/매장별 조정 여지(본 설계 범위 밖).
