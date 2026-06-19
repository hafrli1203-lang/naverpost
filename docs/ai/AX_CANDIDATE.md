# AX_CANDIDATE — naverpost

> 나중에 단일 AX 운영 시스템으로 통합·승격할 후보. 오늘은 기록만(구현/통합은 별도 승인).
> 작성: 2026-06-19 (오늘 사용 가능 점검 중 식별)

## 1. 재사용 가능한 기능(흐름)
- **붙여넣기용 export 엔진** (`src/lib/naver/contentFormatter.ts`, 순수함수): markdown → 네이버 rich HTML + 평문 폴백 + 이미지 자리 마커. **모든 콘텐츠 도구(블로그/상세페이지/보고서)의 공통 export 모듈**로 승격 가능.
- **콘텐츠 컴플라이언스 필터** (`src/lib/validation/`: blaiLanguageRules·keywordRules·repetitionCheck·contentSignalAnalyzer): 금지어/광고법/의료법/반복어/키워드 규칙. **AX 전역 "발행 전 검수" 게이트**로 재사용(mktool·place 보고서·naver-sa 소재에도 적용 가능).
- **AI 실행 추상화 레이어** (`src/lib/ai/cli/`: claude/codex/gti spawn 래퍼): 구독형 CLI 위임. **AX 공통 AI 프로바이더 어댑터**로 통합(naver-sa AI 상담, mktool daangn 생성과 중복 → 단일화 후보).
- **키워드 신호** (`src/lib/keywords/spellingVariants`, `naver/searchSignals`): 검색량·표기변형. **naver-sa/naverkey의 키워드 엔진과 합칠 핵심 중복 영역**.
- **BlogOps 성과측정 연동** (`src/lib/blogops/`): 노출 추적·백필. **AX 통합 분석/리포팅 파이프라인** 후보(blogoperator·blogposting과 중복).

## 2. 가져갈 데이터 구조
- 세션(workflow state: shop/category → keywords → article(+citations) → images → export) — AX 작업 단위 표준 스키마 후보.
- shopRefs(6개 매장·블로그ID), 카테고리 6종 — AX "운영 대상(계정/매장)" 마스터 데이터.
- 성과/노출 레코드(blogops) — AX 통합 KPI 스토어.

## 3. 재사용 가능한 UI/컴포넌트
- `WorkflowStepper`(단계 파이프라인 UI), `ShopSelector`, `KeywordOptions`, `ArticlePreview`, `ImagePreview` — **AX의 "단계형 생성 워크플로우" 공통 UI 키트** 후보.
- operations 화면(Human-in-the-loop 대시보드) 패턴 — AX 운영 콘솔 레이아웃 레퍼런스.

## 4. 다른 프로젝트와 합칠 부분
- **네이버 검색/검색량**: naverpost(searchSignals) ↔ naver-sa ↔ naverkey → 단일 "네이버 데이터 게이트웨이".
- **AI 프로바이더**: naverpost(CLI 위임) ↔ naver-sa(rule/anthropic/openai/CLI) ↔ mktool(anthropic) → 단일 어댑터.
- **컴플라이언스 검수**: naverpost validation → 전 콘텐츠 도구 공통.
- **성과 분석**: blogops ↔ blogoperator/blogposting → 통합 리포팅.

## 5. 통합 시 주의(현 제약 보존)
- 네이버 자동 발행 금지(writePost.json 2020 종료) — export+수동 임시저장 모델 유지.
- AI 생성은 실제 호출/비용 발생 → AX에서도 demo/mock 모드 분리 필수.
- 모듈 상태 경계(CLAUDE.md) 준수 — 통합 시 인터페이스로만 결합.

## 6. 승격 후보 요약표 (우선순위)
> 기준: `_AGENCY_OS/AX_PROMOTION_CRITERIA.md`. 우선순위 1=가장 먼저 추출.

| 우선 | AX로 가져갈 기능 | 재사용 데이터 구조 | 재사용 UI | 다른 프로젝트와 합칠 부분 | 가져가기 전 정리할 문제 |
|---|---|---|---|---|---|
| 1 | 붙여넣기 export 엔진(contentFormatter) | export 입력(title/content/imageCount) | FinalConfirm | 전 콘텐츠 도구(상세페이지/보고서) | 인터페이스 추출(순수함수라 용이) |
| 2 | 컴플라이언스 필터(validation) | 위반 결과 스키마 | (검증 배지) | mktool·place 보고서·naver-sa 소재 | 규칙셋 외부화/도메인 분리 |
| 3 | AI 프로바이더 어댑터(ai/cli) | provider/model/timeout | — | naver-sa·mktool AI | 키/구독 처리 표준화, demo 모드 |
| 4 | 네이버 검색/검색량 게이트웨이 | 검색량/표기변형 | — | naver-sa·naverkey·place_master | 중복 클라이언트 단일화 |
| 5 | 단계형 워크플로우 UI 키트 | 세션(워크플로우 상태) | WorkflowStepper·ShopSelector·KeywordOptions·*Preview | naver-sa 승인센터 | 프레임워크/스타일 토큰 일치 |
| 6 | 성과/리포팅(blogops) | 노출/성과 레코드 | CadenceTracker | blogoperator·blogposting·naver-sa KPI | KPI 스토어 스키마 통일 |

- **승격 게이트**: naverpost = READY → 1차 후보 자격 충족. 공통모듈 1·2·3은 인터페이스 문서화부터(추후 승인).

## 7. 자동화/외부리뷰 후보 (2026-06-19)
- 자동검증 레벨2 훅(validate-stop-check.sh) 자체가 **AX 공통 "완료 직전 검증 게이트"** 후보(전 프로젝트 표준화 시 재사용).
- 외부 리뷰 프로토콜(EXTERNAL_REVIEW + @codex 문구)도 AX 공통 리뷰 게이트 후보.
