# WIKI_INDEX — naverpost

LLM Wiki(프로젝트 기억) 색인. 새 세션은 여기서 출발.

## 문서 지도
- (최우선) 기존 `CLAUDE.md`, `bot_created_rule.md`, `docs/designs/`(기능별 설계), `CHANGELOG.md`
- `AGENTS.md` — 운영 진입점(작업 원칙)
- `PROJECT_BRIEF.md` — 개요/스택
- `RULES.md` — 규칙(기존 정책 포함)
- `WORKFLOW.md` — 작업 순서(5단계 플로우)
- `TASKS.md` — 기능 TASK / `UI_TASKS.md` — UI TASK
- `ERROR_LOG.md` — 오류 / `DECISIONS.md` — 의사결정
- `UIUX_RULES.md` — UI 기준 / `DESIGN_REFERENCE.md` — 디자인 레퍼런스 / `DESIGN_AUDIT.md` — UI 점검
- `RAW_NOTES.md` — 운영 메모

## 골든 샘플 운영 문서 (2026-06-19)
- `OPERATING_STANDARD.md` — naverpost 운영 기준(내부 사용·6대 구조 연결) ★정본
- `NAVERPOST_RUNBOOK.md` — 오늘 바로 쓰는 법 / `READY_CHECKLIST.md` — 사용 가능 점검
- `PIPELINE_FLOW.md` — 키워드→본문→이미지→export 흐름(T3) / `SCREEN_FLOW.md` — 화면 흐름(T2)
- `SUBAGENT_PROTOCOL.md` — 내부 검수자 사용 규칙 / `EXTERNAL_REVIEW.md` — Codex 외부 리뷰
- `RUN_NEXT_TASK_PROMPT.md` — 표준 TASK 프롬프트 / `RUN_LOCAL_TOOL_PROMPT.md` — 오늘 쓰기 프롬프트
- `AX_CANDIDATE.md` — AX 승격 후보(우선순위 표)

## 핵심 지식 (채워나갈 것)
- API 라우트 ↔ 책임 지도: ✅ 아래 "API 라우트 입출력 맵 (T1)" (2026-06-19 완료)
- 화면(operations/admin/login) ↔ 단계 흐름: (정리 예정 — T2)
- 파이프라인 데이터 흐름(keywords→article→image→export): (정리 예정 — T3)
- 모듈 상태 경계: `CLAUDE.md`의 "현재 모듈 상태 경계" 표 참조(권위 출처).

## API 라우트 입출력 맵 (T1, 2026-06-19)
> `src/app/api/` 23개 route.ts. 입력=요청 본문/경로 주요 키, 출력=책임. 외부의존: **AI**=Claude/gti CLI(구독·비용), **BlogOps**=성과측정 REST, **DB**=Supabase, **로컬**=순수/파일/내부.
> ⚠ AI 표시 라우트는 호출 시 실제 비용 발생 → 내부 점검은 demo/mock 또는 미트리거.

### 콘텐츠 생성 (Stage 1·2)
| 라우트 | 메서드 | 입력(주요 키) | 출력 책임 | 외부의존 |
|---|---|---|---|---|
| `keywords` | POST | shopId, topic | 제목·키워드 옵션 생성(`ai/claude`) | **AI** |
| `topics/suggest` | POST | shopId, topic | 주제 추천(`data/shops`) | 로컬 |
| `topics/series` | POST | shopId, topic | 시리즈 기획(`topics/seriesPlanner`) | 로컬 |
| `article` | POST | shopId, topic, keyword, title | 본문 작성(`ai/claude`) | **AI** |
| `article/chat` | POST | title, content, article | 본문 대화형 수정(`ai/claude`) | **AI** |
| `article/wash` | POST | title, content, article | 본문 정제(`ai/claude`) | **AI** |
| `article/validate` | POST | content | 금지어/규칙 검증(`validation/contentValidator`) | 로컬(순수) |
| `analysis` | POST | mode, title/content | **모드별 상이**(아래) | **모드 의존** |
| `title-similarity` | POST | title, keyword | 제목 유사도(`analysis/titleSimilarity`) | 로컬(순수) |

> ⚠ **`analysis` route는 단일 "로컬"이 아니다 — mode로 외부 호출 여부가 갈린다** (Codex P1 반영):
> - `mode=posting-audit` → 발행 전 통합 점검(형태소/반복/금지어/이미지). **순수 로컬, 외부 호출 없음.**
> - `mode=smart-block` → 스마트블록 하위키워드 추론. **외부 호출 가능**(네이버 검색 신호 의존).
> - `mode=autocomplete-index` → 자동완성 색인 분석(`analysis/autocompleteIndex` → `https://ac.search.naver.com/nx/ac`). **외부 호출 / `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` credentials 필요 / 미설정 시 실패 → safe mode(posting-audit) 권장.**
> - 관련 `analysis/competitorMorphology`는 `https://openapi.naver.com/v1/search/blog.json` 호출(credentials 필요).
> - **내부 점검/오프라인 자동검증 시에는 `posting-audit`만 사용**(나머지는 외부 호출·credentials 필요).

### 이미지 (Stage 3)
| 라우트 | 메서드 | 입력 | 출력 책임 | 외부의존 |
|---|---|---|---|---|
| `image/prompts` | POST | shopId, title, article | 이미지 프롬프트 생성(`ai/claude`) | **AI** |
| `image/generate` | POST,GET | sessionId, shopId, title, article | 이미지 생성(`ai/claude`→gti) | **AI** |
| `image/one` | POST | sessionId, shopId, imageId | 단일 이미지 생성(`ai/imageGen`) | **AI** |
| `image/regenerate` | POST | sessionId, shopId, imageId | 이미지 재생성(`ai/imageGen`) | **AI** |
| `image/session` | POST | sessionId, title, article | 이미지 세션 관리(`storage/imageStore`) | 로컬(파일) |
| `image/file/[imageId]` | GET | imageId | 저장 이미지 반환(`storage/imageStore`) | 로컬(파일) |

### 세션·매장·문서·인증
| 라우트 | 메서드 | 입력 | 출력 책임 | 외부의존 |
|---|---|---|---|---|
| `sessions` | GET,POST,DELETE | title, topic, article | 세션 저장/조회/삭제 + BlogOps 글 기록(`blogops/client`) | BlogOps/DB |
| `shops` | GET,POST | — | 매장 목록/등록(`data/shops`) | DB |
| `shops/[shopId]` | PUT,DELETE | shopId | 매장 수정/삭제(`data/shops`) | DB |
| `document/upload` | POST | (file) | 참고문서 업로드/파싱(`documents/referenceFormatter`) | 로컬 |
| `auth` | POST,DELETE | (creds) | 로그인/로그아웃 | 로컬(세션) |

### BlogOps 성과측정 (읽기/분석)
| 라우트 | 메서드 | 입력 | 출력 책임 | 외부의존 |
|---|---|---|---|---|
| `blogops/cadence` | GET | shopId | 발행 케이던스 조회(`blogops/cadence`) | BlogOps |
| `blogops/exposure` | POST | shopId, keyword | 노출 순위 추적(`blogops/exposure`) | BlogOps |
| `blogops/backfill` | POST | shopId | 발행글 백필(`blogops/backfill`) | BlogOps |

### 비고
- **발행 라우트 없음**: writePost.json(2020 종료) — 최종 산출물은 붙여넣기 export(`lib/naver/contentFormatter`, API 아님·클라이언트). export 흐름 검증 완료(PASS).
- **AI 라우트 9개**(keywords·article*·image*)는 로컬 구독 CLI 위임 → 내부 점검 시 비용 주의.
- 입력 키는 정적 추출(요청 본문 파싱 기준). 상세 스키마는 각 route.ts + `src/types/` 참조.
- 다음: T2(화면 흐름) · T3(파이프라인 데이터 흐름)에서 본 맵과 연결.

## 명령어 (AGENCY AI OS)
- `docs/ai/COMMANDS.md` — 표준 슬래시 명령 사용법(/agency-run-local, /agency-next-task, /agency-improve-ui, /agency-improve-feature, /agency-quality-sweep, /agency-external-review, /agency-auto-improve).
