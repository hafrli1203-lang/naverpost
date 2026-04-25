# Changelog

버전은 소수점으로 관리한다 (v1.0 → v1.1 → v2.0).
버그 발견 시 번호 부여 후 버전 올려서 수정 기록한다.

---

## v1.5 (2026-04-25)

### 외부 API → 로컬 CLI 마이그레이션 (구독제 활용)

**변경사항:**
- `lib/ai/cli/{spawnCli,claudeCli,codexCli,gtiCli}.ts` 신규: 자식 프로세스로 CLI 호출하는 통합 어댑터 레이어 (Windows .cmd 자동 처리, stdin 주입, AbortController 타임아웃, 정규화된 `CliError`)
- `lib/ai/claude.ts`: Anthropic SDK 제거 → `runClaude` 위임. 모델/시그니처/호출처 모두 무수정. `--system-prompt` 사용으로 프로젝트 CLAUDE.md 자동 주입 차단
- `lib/ai/imageGen.ts`: Google AI Studio REST 제거 → `runGti` 위임. `generateBlogImage(prompt)` 시그니처 단순화 (apiKey 매개변수 제거)
- `lib/nlp/nounExtractor.ts`: Anthropic SDK 직접 호출 → `runClaude({ model: "claude-haiku-4-5-20251001" })` 위임
- `lib/ai/gemini.ts`: 삭제 (`generateImagePrompts` dead code, `generateTopicSuggestions`는 `runCodex`로 이전)
- `app/api/topics/suggest/route.ts`: `gemini-2.5-flash` → `codex exec`
- `app/api/image/{generate,one,regenerate}/route.ts`: `GOOGLE_AI_API_KEY` 가드 3곳 제거, 호출 시그니처 정리, `image/generate/route.ts:67` 잘못된 `promptModel: gemini-2.0-flash` 로그 정정 (`claude-sonnet-4-6`)
- `lib/analysis/competitorMorphology.ts`, `app/api/article/geo/route.ts`: `process.env.ANTHROPIC_API_KEY` 가드 제거 (CLI가 OAuth로 자체 인증)
- `src/env.ts`: `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` zod 검증 제거. `.env.local`에서 두 키 삭제 가능
- `src/app/icon.png`, `src/app/apple-icon.png`: 안경+N 모티브 favicon (gti로 생성, 인디고 단색)
- `public/app.ico`: Windows 바탕화면 바로가기용 다중해상도 ICO (16/32/48/64/128/256). `pnpm build:icon` 으로 재생성 (`scripts/build-icon.cjs`)
- `devDependencies` 추가: `sharp`, `png-to-ico` (아이콘 빌드 전용)

**이유:**
- 로컬 단일 사용자 운영으로 전환하면서 SaaS API 비용을 0원화
- 이미 결제 중인 Claude Pro/Max + ChatGPT 구독을 재사용
- 호출 시그니처를 100% 보존해 라우트·컴포넌트·검증 모듈 무수정

**의존:**
- `claude` CLI 2.1.119+ (OAuth 로그인 필요, `~/.claude/.credentials.json`)
- `codex` CLI 0.124.0+ (ChatGPT 로그인 필요, `~/.codex/auth.json`)
- `gti` CLI (`npm i -g god-tibo-imagen`, ChatGPT 구독 백엔드 사용)

**알려진 제약:**
- Vercel/원격 배포 동작 불가 (로컬 전용)
- `gti`는 비공식 private 백엔드 사용 — OpenAI 측에서 차단 시 기능 정지
- `gti --provider auto`는 Windows에서 내부 codex spawn ENOENT 발생 → `private-codex`로 강제 (gtiCli 디폴트)
- `scripts/geo-ai-eval.cjs` (오프라인 평가 스크립트)는 여전히 `ANTHROPIC_API_KEY` 환경변수를 직접 요구. 평가 실행 시에만 일시적으로 설정 필요

**설계 문서:** `docs/designs/cli-migration.md`

---

## v1.4 (2026-04-13)

### ETRI 종료 대응: Claude Haiku로 경쟁 명사 추출 전환

**변경사항:**
- ETRI 공공 API 서비스 종료로 `lib/nlp/etri.ts` 제거
- `lib/nlp/nounExtractor.ts` 신규: `claude-haiku-4-5-20251001` 단일 호출로 상위 블로그 제목+요약의 제목/본문 명사 및 빈도/blogCount 추출
- `competitorMorphology.ts`가 새 추출기를 사용하도록 교체. 호출 실패/API 키 없음 시 기존과 동일하게 자동 unavailable 처리
- Vercel 서버리스에서 그대로 동작 (외부 의존 0, 기존 Anthropic SDK 재사용)

**이유:**
- ETRI 접속 불가 및 공식 종료
- Node 용 한국어 형태소 라이브러리 대안은 번들 크기 / Windows 네이티브 빌드 이슈로 Vercel 배포 난항
- 이미 쓰는 Claude 인프라 활용이 가장 안정적이고 도메인 복합명사 정확도도 충분

---

## v1.3 (2026-04-13)

### ETRI 형태소 분석 + 경쟁 상위 블로그 공통 명사 주입

**새 기능:**
- `lib/nlp/etri.ts`: ETRI 공공 형태소 분석 API 클라이언트 (`ETRI_API_KEY` 필요)
- `lib/analysis/competitorMorphology.ts`: 메인 키워드로 네이버 블로그 검색 상위 10건 수집 후 제목+요약을 ETRI로 분석, 2건 이상 블로그에 공통 출현한 명사를 빈도순 집계
- 결과를 `ArticleBrief.competitorMorphology`에 실어 `articlePrompt` / `promoPrompt`의 내부 브리프 블록에 주입

**이유:**
- 상위 노출 블로그의 주제 정합 명사를 본문에 반영해야 검색 엔진 유사도·적합도 신호에서 동등 이상 전개 가능
- 표면 토큰 기반 분석으로는 "티타늄" / "안경테" 같은 복합명사 분리가 부정확

**동작:**
- `ETRI_API_KEY` 미설정 시 해당 블록 자동 생략 (다른 파이프라인은 정상 동작)
- 네이버 블로그 검색 실패 / ETRI 실패 시 본문 생성은 계속 진행
- 프롬프트에 주입된 공통 명사는 "문장 그대로 복제 금지" 규칙과 함께 전달

**변경 파일:**
- `src/lib/nlp/etri.ts` (신규)
- `src/lib/analysis/competitorMorphology.ts` (신규)
- `src/types/index.ts`
- `src/lib/briefs/articleBrief.ts`
- `src/lib/prompts/articlePrompt.ts`
- `src/lib/prompts/promoPrompt.ts`
- `src/app/api/article/route.ts`

---

## v1.2 (2026-04-13)

### 네이버 자동완성 기반 연관 키워드 실연결

**변경사항:**
- `lib/naver/searchSignals.ts`: `buildRelatedFromBlogItems`(블로그 검색 결과 토큰 재추출 방식) 제거
- `ac.search.naver.com/nx/ac` 자동완성 엔드포인트 연동 (`fetchAutocomplete`)
- 메인/서브 키워드 3종을 시드로 병렬 호출 후 중복 제거해 최대 15개 연관 신호 생성
- `RelatedKeywordSignal.relationType`이 `autocomplete`로 정확히 표시됨
- `externalSignals.notes`에 자동완성 수집 사실 반영

**이유:**
- 기존 연관 키워드는 블로그 검색 결과 제목/본문에서 뽑은 표면 토큰이라 추측성이었음
- `blai-implementation-plan.md`의 "추측값 금지 / 실데이터만 허용" 원칙 준수

---

## v1.1 (2026-03-14)

### 안경원 관리 + AI 자동 주제 추천

**새 기능:**
- `/admin` 관리 페이지: 안경원 추가/수정/삭제 (블로그 ID 등록)
- 파일 기반 매장 저장 (`data/shops.json`) — 하드코딩 제거
- AI 자동 주제 추천: 매장 + 카테고리 선택 시 3개 주제 자동 제안 (`/api/topics/suggest`)
- 추천 주제 클릭으로 바로 선택 가능 (수동 입력도 유지)
- RSS 중복 방지가 등록된 매장 데이터 기반으로 동작

**변경사항:**
- `constants.ts`에서 SHOPS 배열 제거, 동적 조회(`lib/data/shops.ts`)로 전환
- 모든 API 라우트가 `getShopById()`로 매장 조회
- `rssParser.ts`가 `getShops()`로 동적 매장 목록 사용
- `ShopSelector`에 관리 페이지 링크 + AI 추천 주제 UI 추가

**새 파일:**
- `data/shops.json`, `src/lib/data/shops.ts`
- `src/app/admin/page.tsx`
- `src/app/api/shops/route.ts`, `src/app/api/shops/[shopId]/route.ts`
- `src/app/api/topics/suggest/route.ts`

---

## v1.0 (2026-03-14)

### 최초 구현 — 4단계 파이프라인 대시보드

**새 기능:**
- 매장/카테고리/주제 선택 UI (`ShopSelector`)
- Claude API 기반 키워드 3개 생성 (`/api/keywords`)
- Perplexity 리서치 + Claude 본문 작성 (`/api/article`)
- 본문 자동 검증: 금지어 100+, 반복어 20회 체크 (`/api/article/validate`)
- Google AI Studio 이미지 10장 SSE 스트리밍 생성 (`/api/image/generate`)
- 개별 이미지 재생성 (`/api/image/regenerate`)
- 파일 기반 이미지 저장/서빙 (`/api/image/file/[imageId]`)
- 네이버 블로그 임시저장 (발행 금지) (`/api/publish`)
- OAuth2 토큰 자동 갱신 (`tokenManager`)
- localStorage 워크플로우 세션 복구
- 4단계 워크플로우 스테퍼 UI

**모듈 구성:**
- AI 클라이언트: `claude.ts`, `perplexity.ts`, `imageGen.ts`
- 네이버 연동: `blogApi.ts`, `tokenManager.ts`, `rssParser.ts`, `contentFormatter.ts`
- 검증: `prohibitedWords.ts`, `keywordRules.ts`, `repetitionCheck.ts`, `contentValidator.ts`
- 프롬프트: `titlePrompt.ts`, `articlePrompt.ts`, `revisionPrompt.ts`, `imagePrompt.ts`
- UI: `ShopSelector`, `KeywordOptions`, `ArticlePreview`, `ImagePreview`, `FinalConfirm`, `WorkflowStepper`
