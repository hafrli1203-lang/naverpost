# 네이버 블로그 자동 작성 프로그램 (안경원)

## 프로젝트 개요
6개 안경원 네이버 블로그의 자동 콘텐츠 작성 시스템. 3단계 파이프라인(제목/키워드 → 본문 작성/검증 → 이미지 생성)을 Human-in-the-loop 웹 대시보드로 구현한다. 최종 결과는 사람이 네이버 스마트에디터에 직접 붙여넣어 **임시저장만** 한다 (발행 금지).

> ⚠ 네이버 블로그 글쓰기 API(`writePost.json`)는 **2020-05-06자로 종료**되어 자동 발행/임시저장은 불가능하다. 대체 공식 API도 없다. 따라서 최종 산출물은 자동 업로드가 아니라 "붙여넣기용 export"(서식 유지 복사 + 이미지 일괄 저장)로 제공하고, 사람이 네이버에 붙여넣어 임시저장한다. 브라우저 자동화는 계정 제재 리스크로 채택하지 않음. (조사: docs/designs/naver-export.md)

## 기술 스택
- **Framework**: TypeScript + Next.js 15 (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **AI 본문 작성**: Claude Code CLI (`claude -p`, Claude Pro/Max OAuth 구독)
- **AI 리서치**: Perplexity API
- **AI 주제 추천**: Codex CLI (`codex exec`, ChatGPT 구독)
- **이미지 생성**: god-tibo-imagen CLI (`gti`, gpt-image-2, ChatGPT 구독)
- **블로그 연동**: 붙여넣기용 export (서식 유지 복사 + 이미지 일괄 저장). ※ writePost.json API는 2020 종료
- **성과 측정**: BlogOps(blogoperator) 연동 — 발행 글 기록 + 키워드 노출 순위 추적
- **데이터 입력**: Google Sheets API
- **패키지 매니저**: pnpm
- **미래 확장**: Electron/Tauri 데스크톱 앱

## 핵심 규칙
- 네이버 블로그에 절대 "발행"하지 않음. 사람이 직접 임시저장만 (자동 발행 API 없음)
- 한국어 전용 콘텐츠
- 광고법/의료법 준수: 금지어 100+ 자동 필터링
- 6개 매장 간 콘텐츠 중복 방지 (RSS deduplication)
- 본문 ~2000자, 제목 12~32자, 키워드 2단어 조합
- 이모지/번호목록 사용 금지. 쉼표는 **본문은 제한적 허용**(호흡에 필요한 곳만, 한 문장 1~2개 이내·남발 금지), **제목은 무콤마 유지**. (v2.8 정책 변경 — 전면 금지가 문장 흐름을 죽여 완화)

## 프로젝트 구조 (목표)
```
naverpost/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # 대시보드 메인
│   │   ├── api/                # API Routes
│   │   │   ├── keywords/       # Stage 1: 제목/키워드 생성
│   │   │   ├── article/        # Stage 2: 본문 작성/검증
│   │   │   ├── image/          # Stage 3: 이미지 생성
│   │   │   ├── sessions/       # 세션 저장 + BlogOps 글 기록
│   │   │   └── blogops/        # 성과 측정 연동(노출 추적·백필). ※ publish/ 없음(API 종료)
│   │   └── layout.tsx
│   ├── components/             # UI 컴포넌트
│   │   ├── ShopSelector.tsx    # 매장/카테고리 선택
│   │   ├── KeywordOptions.tsx  # 3개 키워드 옵션 표시/선택
│   │   ├── ArticlePreview.tsx  # 본문 미리보기/승인
│   │   ├── ImagePreview.tsx    # 이미지 확인/재생성
│   │   └── WorkflowStepper.tsx # 단계별 진행 상태
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── claude.ts       # Claude API 클라이언트
│   │   │   ├── perplexity.ts   # Perplexity API 클라이언트
│   │   │   └── imageGen.ts     # Google AI Studio 이미지 생성
│   │   ├── naver/
│   │   │   ├── (blogApi.ts)    # ※ 미구현 — writePost.json 2020 종료. export로 대체
│   │   │   ├── contentFormatter.ts # 붙여넣기용 export(서식 복사·평문·이미지 마커)
│   │   │   ├── searchSignals.ts # 검색량·블로그검색(노출 추적)
│   │   │   └── rssParser.ts    # RSS 피드 파싱 (중복 방지)
│   │   ├── blogops/            # BlogOps 성과 측정 연동 (글 기록·노출 추적·백필)
│   │   ├── validation/
│   │   │   ├── prohibitedWords.ts  # 금지어 필터
│   │   │   ├── keywordRules.ts     # 키워드 7대 규칙 검증
│   │   │   └── repetitionCheck.ts  # 반복어 검사
│   │   ├── prompts/
│   │   │   ├── titlePrompt.ts      # 제목 생성 프롬프트
│   │   │   └── articlePrompt.ts    # 본문 작성 프롬프트
│   │   └── google/
│   │       └── sheets.ts       # Google Sheets 연동
│   └── types/
│       └── index.ts            # 타입 정의
├── public/
├── .env.local                  # API 키 (gitignore)
├── package.json
├── tsconfig.json
├── next.config.ts
└── CLAUDE.md
```

## 워크플로우 파이프라인
```
[매장/카테고리 선택] → [RSS 수집] → [Claude: 키워드 3개 생성]
     ↓                                      ↓
[사용자 선택] ← ────────────────── [키워드 옵션 표시]
     ↓
[Perplexity 리서치] → [Claude: 본문 작성] → [자동 검증] → [Claude: 수정]
     ↓                                                        ↓
[사용자 확인] ← ──────────────────────────────── [본문 미리보기]
     ↓
[Google AI Studio: 이미지 생성]
     ↓
[사용자 확인/재생성] ← ─────────────── [이미지 미리보기]
     ↓
[최종 컨펌] → [붙여넣기용 export: 서식 복사 + 이미지 저장] → [사람이 네이버 임시저장] → [완료]
```

## 6개 블로그 매장
| 매장 | 블로그 ID |
|------|----------|
| 매장1 | top50jn |
| 매장2 | jinysgongju |
| 매장3 | attractiger |
| 매장4 | leesi7007 |
| 매장5 | kl1854 |
| 매장6 | peace9486 |

## 6개 카테고리
안경테, 안경렌즈, 콘택트렌즈, 눈정보, 누진다초점, 안경이야기

## API 엔드포인트
- **Naver Blog Write**: ~~POST `writePost.json`~~ **2020 종료 — 사용 불가** (자동 발행/임시저장 없음, 붙여넣기 export로 대체)
- **Naver Blog Categories**: ~~GET `listCategory.json`~~ 글쓰기 종료로 의존 안 함
- **Naver 검색 OpenAPI**: 블로그 검색(`/v1/search/blog.json`) — 노출 순위 추적·말뭉치 수집에 사용 (읽기 전용, 정상)
- **Naver 검색광고 API**: 키워드 검색량 조회 (볼륨 게이트)
- **Claude**: `claude` CLI (`-p --output-format json`, OAuth 구독)
- **Perplexity**: REST API
- **GPT 텍스트 (주제 추천)**: `codex` CLI (`exec`, ChatGPT 구독)
- **GPT 이미지 (gpt-image-2)**: `gti` CLI (`--provider private-codex`, ChatGPT 구독)

## 점진적 배포 계획
1. **Phase 1**: 제목/키워드 생성 + 사용자 선택 UI
2. **Phase 2**: 본문 작성 + 검증 + 미리보기 UI
3. **Phase 3**: 이미지 생성 + 확인 UI
4. **Phase 4**: ~~네이버 API 연동~~ → 붙여넣기용 export (API 종료로 자동 발행 대신 사람이 임시저장)

## 개발 명령어
```bash
pnpm install          # 의존성 설치
pnpm dev              # 개발 서버 (http://localhost:3000)
pnpm build            # 프로덕션 빌드
pnpm lint             # 린트 검사
pnpm type-check       # 타입 체크
```

---

# Agent Skills 설정

## 이미 설치된 활용 가능 Skills

### 핵심 오케스트레이션
- **oh-my-claudecode**: 멀티 에이전트 오케스트레이션 (autopilot, ralph, team, ultrawork)
- **pumasi**: 병렬 Codex 실행으로 대규모 작업 분배
- **docs-guide**: 라이브러리 공식 문서 조회

### 마케팅 & 콘텐츠 (`~/.claude/skills/marketing-skill`)
> 블로그 콘텐츠 작성 시 자동 활용
- **Content Production Pod**: 블로그 글쓰기, 콘텐츠 캘린더, 랜딩 페이지 카피
- **SEO Pod**: SEO 최적화, 키워드 분석, 메타 설명 생성
- **CRO Pod**: 전환율 최적화, A/B 테스트 설계
- **Intelligence Pod**: 경쟁사 분석, 트렌드 모니터링

### 엔지니어링 (`~/.claude/skills/engineering`)
> 코드 구현 시 자동 활용
- Agent 설계, RAG 아키텍처, MCP 서버, CI/CD
- 데이터베이스 설계, 보안 감사, 릴리즈 관리

### 엔지니어링 팀 (`~/.claude/skills/engineering-team`)
> 프론트엔드/백엔드 구현 시 자동 활용
- Frontend (React/Next.js), Backend (API), Fullstack
- QA, DevOps, Security, AI/ML 전문가

### Vercel & Next.js (`~/.claude/skills/vercel-next-skills`, `vercel-skills`)
> Next.js 프로젝트 구현 시 자동 활용
- Next.js App Router 패턴, Vercel 배포, Edge Functions

### 제품 팀 (`~/.claude/skills/product-team`)
> 기능 기획/우선순위 결정 시 활용
- RICE 우선순위, UX 리서치, UI 디자인 시스템

## 추천 설치 Skills (이 프로젝트 최적화)

### 1. claude-blog (블로그 전용 - 최우선 설치)
> 13개 블로그 특화 스킬. 콘텐츠 작성의 핵심 도구.
```bash
# Windows PowerShell에서 설치
cd $env:USERPROFILE\.claude\skills
git clone https://github.com/AgriciDaniel/claude-blog.git
# 또는 install.ps1 실행
```
**활용 스킬:**
- `/blog-write`: 블로그 포스트 작성 (12개 콘텐츠 템플릿)
- `/blog-rewrite`: 기존 콘텐츠 최적화
- `/blog-analyze`: 품질 감사 (0-100점)
- `/blog-brief`: 콘텐츠 브리프 생성
- `/blog-calendar`: 편집 캘린더 생성
- `/blog-strategy`: 블로그 전략 수립
- `/blog-seo-check`: 작성 후 SEO 검증
- `/blog-outline`: SERP 기반 아웃라인 생성

### 2. claude-seo (SEO 최적화)
> 13개 SEO 스킬. 네이버 검색 노출 최적화에 활용.
```bash
cd $env:USERPROFILE\.claude\skills
git clone --depth 1 https://github.com/AgriciDaniel/claude-seo.git
powershell -ExecutionPolicy Bypass -File claude-seo\install.ps1
```
**활용 스킬:**
- Technical SEO, On-Page 분석, 콘텐츠 품질(E-E-A-T)
- AI 검색 최적화(GEO/AEO), 경쟁사 분석

### 3. naver-search-mcp (네이버 검색 MCP 서버)
> 네이버 블로그/웹/뉴스 검색으로 리서치 강화.
```bash
npx -y @smithery/cli@latest install @isnow890/naver-search-mcp --client claude
```
**기능:** 네이버 웹, 뉴스, 블로그, 카페, 쇼핑, 이미지, 지식인, 트렌드 검색

### 4. firecrawl-cli (웹 스크래핑)
> 경쟁사 블로그 분석, 트렌드 리서치에 활용.
```bash
# Plugin marketplace에서 설치
# Claude Code에서: /plugin marketplace add firecrawl/cli
```

## Skill 자동 트리거 규칙

아래 상황에서 해당 스킬이 자동으로 활성화됩니다:

| 트리거 상황 | 자동 활성화 Skill |
|------------|------------------|
| 블로그 글 작성/생성 요청 | `marketing-skill` Content Pod + `claude-blog` |
| SEO 키워드 분석 | `marketing-skill` SEO Pod + `claude-seo` |
| Next.js 컴포넌트 구현 | `vercel-next-skills` + `engineering-team` Frontend |
| API 라우트 구현 | `engineering-team` Backend + `engineering` |
| 코드 리뷰/품질 검사 | `engineering` + OMC `code-reviewer` |
| 프로젝트 아키텍처 설계 | `engineering` + OMC `architect` |
| 테스트 작성 | `engineering-team` QA + OMC `test-engineer` |
| 네이버 API 연동 | `naver-search-mcp` + `docs-guide` |
| 웹 리서치/스크래핑 | `firecrawl-cli` + OMC `document-specialist` |
| 대규모 병렬 작업 | `pumasi` + OMC `ultrawork` |
| 전체 파이프라인 구현 | OMC `autopilot` 또는 `team` |

---

# 봇/기능 개발 플로우 (필수 준수)

**모든 새 기능·봇·모듈 개발 시 아래 5단계를 순서대로 따른다. 단계를 건너뛰거나 병합하지 않는다.**

## STEP 1. 설계 문서 (코드 작성 전 필수)

코드 작성 전 `docs/designs/` 폴더에 설계 문서를 작성한다. 다음 항목이 모두 정의되어야 다음 단계로 진행 가능:

| 항목 | 설명 |
|------|------|
| 목적 | 이 기능이 해결하는 문제 한 줄 정의 |
| 트리거 조건 | 언제 실행되는가 (시간, 이벤트, 수동 등) |
| 실패 복구 | API 오류, 타임아웃, 예외 발생 시 처리 방법 |
| 상태 경계 | 다른 모듈과 공유하는 상태, 충돌 가능성 |
| 아웃풋 정의 | 최종 결과물의 형태·포맷·전달 경로 |

> ⚠ 설계 문서가 불완전하면 다음 단계로 넘어가지 않는다.

## STEP 2. 스펙 테스트

설계 문서 기준으로 정상 케이스를 검증한다:
- 트리거로 실행 시 의도한 흐름대로 동작하는가
- 아웃풋이 STEP 1 정의와 일치하는가
- **보수적/수동 방법 금지** — 기존 인프라 활용 최단경로로 구현

## STEP 3. 아웃풋 체크

결과물 품질 확인:
- 포맷·구조가 정의와 일치하는가
- 전달 경로가 정상 작동하는가
- 사람이 읽었을 때 즉시 판단 가능한 형태인가

## STEP 4. 인풋 체크

예외 상황 검증:
- 엣지케이스 입력 시 반응 확인
- STEP 1의 실패 복구 로직이 실제로 동작하는가
- 빈 값, 형식 오류, API 무응답 케이스 포함

## STEP 5. 모듈화

검증 완료된 기능을 분리:
- 기능 단위로 독립 모듈 분리
- 타 모듈과의 인터페이스 명확히 정의 (입력/출력 형식, 호출 방식)
- 재사용 가능한 구조로 정리

## 공통 원칙

- **설계 없이 코드 먼저 짜지 않는다**
- **보수적·수동적 방법을 디폴트로 제안하지 않는다**
- 기존 인프라(Claude Code CLI, Codex CLI, gti CLI, Naver API, Perplexity)에 통합 가능한 형태로 구현
- **버전은 소수점으로 관리**: v1.0 → v1.1 → v2.0
- **버그 발견 시**: 번호 부여 후 버전 올려서 수정 기록 (`CHANGELOG.md`)

## 현재 모듈 상태 경계 (충돌 방지)

각 모듈은 독립적으로 동작하며, 아래 경계를 침범하지 않는다:

| 모듈 | 소유 상태 | 공유 인터페이스 |
|------|----------|---------------|
| `lib/ai/cli/spawnCli.ts` | 자식 프로세스 spawn 헬퍼 | `runCli()`, `CliError` |
| `lib/ai/cli/claudeCli.ts` | `claude -p` 호출 (OAuth 구독) | `runClaude({ prompt, model, timeoutMs?, systemPrompt? })` |
| `lib/ai/cli/codexCli.ts` | `codex exec` 호출 (ChatGPT 구독) | `runCodex({ prompt, model?, timeoutMs? })` |
| `lib/ai/cli/gtiCli.ts` | `gti` 호출 (gpt-image-2, ChatGPT 구독) | `runGti({ prompt, timeoutMs?, provider?, model? })` |
| `lib/ai/claude.ts` | (CLI 위임 래퍼, SDK 미사용) | `generateKeywords()`, `reviseKeywordTitles()`, `selectCategoryFitIndices()`, `writeArticle()`, `reviseArticle()`, `generateImagePrompts()` (※ `rewriteArticleForGeo()`는 제거됨 — GEO 재작성이 `articlePrompt.ts`에 내장됨) |
| `lib/ai/imageGen.ts` | (CLI 위임 래퍼) | `generateBlogImage(prompt)` |
| `lib/ai/perplexity.ts` | Perplexity 클라이언트 (REST 직접) | `researchKeyword()` (citations 포함 반환) |
| `lib/ai/citationExtractor.ts` | 없음 (순수함수) | `extractCitationsFromContent()`, `mergeCitations()` — 본문에서 기관·수치 인용 추출(AI 검색 인용 신호). article 라우트에서 `article.citations`로 surface |
| `lib/nlp/nounExtractor.ts` | (CLI 위임 래퍼, Haiku) | `extractContentNouns()`, `generateRelatedKeywords()`, `extractCompetitorNouns()` |
| `lib/keywords/spellingVariants.ts` | 없음 (순수함수) | `expandSpellingVariants()` — 안경 도메인 표기/오타/띄어쓰기 변형 생성. keywords 라우트에서 discoverySeeds에 합류 → 실볼륨 게이트가 거름 |
| `lib/naver/contentFormatter.ts` | 없음 (순수함수) | `formatForNaver()`, `formatForNaverExport()`, `buildNaverPlainText()` (붙여넣기 export) |
| `lib/blogops/*` | 없음 (BlogOps REST 호출) | `registerPostToBlogOps()`, `trackExposureForShops()`, `backfillPublishedPosts()`, `getTopExposedKeywordKeys()` |
| `lib/naver/tokenManager.ts` | (미사용 — writePost.json 종료로 발행 토큰 불필요) | `withTokenRetry()`, `loadTokens()` |
| `lib/storage/imageStore.ts` | 파일시스템 임시 이미지 | `saveImage()`, `getImage()`, `cleanupSession()` |
| `lib/validation/*` | 없음 (순수함수) | `validateContent()` |
| `hooks/usePersistedWorkflow.ts` | localStorage | `[state, setState, clearPersistedState]` |

---

## 참고 문서
- 스펙 문서: `네이버 블로그 자동 작성 프로그램 (안경원).md` (74KB, 전체 워크플로우/프롬프트/검증규칙)
- Deep Interview 스펙: `.omc/specs/deep-interview-naver-blog-auto.md`
- 봇 개발 규칙 원본: `bot_created_rule.md`
- 설계 문서: `docs/designs/` (새 기능 추가 시 필수 작성)
- 변경 이력: `CHANGELOG.md`

---

## 워크스페이스 운영구조 연결 (2026-06-18 추가)

> 위 기존 규칙(3단계 파이프라인, 발행 금지·붙여넣기 export, 한국어 전용, 금지어 필터, 쉼표 정책, 모듈 상태 경계, bot_created_rule 5단계 플로우)은 **그대로 우선 적용**한다. 아래는 충돌 없이 추가되는 워크스페이스 공통 운영 절차다.

- 작업 전 `AGENTS.md`와 `docs/ai/` 문서(`PROJECT_BRIEF`, `RULES`, `WORKFLOW`, `TASKS` 등)를 먼저 읽는다.
- TASK는 **하나씩만** 처리한다. 여러 개를 동시에 벌이지 않는다. 첫 세션은 구조 파악/문서 정리만.
- 테스트(`pnpm test` / `pnpm dev` 실행 + 화면·출력 확인) **없이 "완료"라고 말하지 않는다**. 증거(스크린샷·로그·테스트 출력)를 남긴다.
- 민감정보(`.env.local`, API 키·토큰·쿠키, 네이버 계정/블로그 자격증명, 고객·매장 정보)를 **읽거나 출력하지 않는다**. 보이면 즉시 마스킹한다.
- 기존 기능·모듈·API 라우트를 **삭제하지 않는다**. 위 "현재 모듈 상태 경계"를 침범하지 않는다.
- UI 작업이면 `docs/ai/UIUX_RULES.md`·`DESIGN_AUDIT.md`·`UI_TASKS.md`를 읽고 **한 화면씩** 수정·검수한다.
- 작업 후 `docs/ai/TASKS.md`, `ERROR_LOG.md`, `DECISIONS.md`(+ UI면 `DESIGN_AUDIT.md`)를 갱신하고 결과를 보고한다.
- 워크스페이스 최상위 공통 규칙: **`C:\project\_AGENCY_OS\MASTER_RULES.md`** (프로젝트 문서와 충돌 시 이 문서가 우선).


<!-- ===== 하네스 레이어 연결 (2026-06-18 추가) ===== -->

## 하네스 작업 지침

- 작업 전 `docs/ai/HARNESS.md`, `QUALITY_GATES.md`, `METRICS.md`, `TRIGGERS.md`를 읽어라.
- TASK 하나를 처리한 뒤 `harness-reviewer`와 `metrics-auditor` subagent로 검수해라.
- UI 작업이면 `ux-harness-reviewer`도 사용해라.
- P0/P1 실패는 반드시 수정해라(수정 루프).
- 하네스 통과 전 "완료"라고 하지 마라. 측정 못 한 항목은 "미검증", 숫자로 못 가르는 판단은 "판단 필요"로 표시.
- 결과는 `docs/ai/HARNESS_RESULTS.md`에 기록. PR 직전엔 `docs/ai/CODE_REVIEW.md` 기준 내부 리뷰 후 Codex 준비.
