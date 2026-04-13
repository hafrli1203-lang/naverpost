# Changelog

버전은 소수점으로 관리한다 (v1.0 → v1.1 → v2.0).
버그 발견 시 번호 부여 후 버전 올려서 수정 기록한다.

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
