# NAVERPOST_RUNBOOK — 오늘 바로 쓰는 법

> 내부 사용 런북. 갱신: 2026-06-19. 기준: `OPERATING_STANDARD.md`.

## 실행
```bash
cd C:\project\naverpost
npm run dev        # next dev -p 3100
```
- **접속 URL**: http://localhost:3100
- 빌드 `npm run build` · 타입 `npm run type-check` · 테스트 `npm test`(vitest)

## operations 사용 순서 (오늘 업무 기준)
1. http://localhost:3100/ (메인 워크플로우) 접속 → WorkflowStepper로 단계 진행.
2. **ShopSelector**: 6개 안경원 매장 + 카테고리(안경테/안경렌즈/콘택트렌즈/눈정보/누진다초점/안경이야기) 선택.
3. **KeywordOptions**: 제목·키워드 옵션 확인/선택. (⚠ 생성은 AI 호출 — 아래 비용 주의)
4. **ArticlePreview**: 본문 미리보기/검증(금지어·키워드 규칙). 필요 시 ArticleChat으로 수정.
5. **ImagePreview**: 이미지 확인/재생성. (⚠ AI 호출)
6. **FinalConfirm → export**: 붙여넣기용 결과 생성.
- `/operations` = 기획/운영 허브(SeriesPlanner 시리즈 기획, CadenceTracker 발행 케이던스).

## export 사용법 (핵심 산출물 — 비용 0)
- 최종 단계에서 **붙여넣기용 export** 생성:
  - **rich HTML**: 네이버 스마트에디터에 서식 유지 붙여넣기(제목 H1 + 본문 + `[사진 N]` 자리).
  - **평문 폴백**: 리치 복사 안 되는 환경용(제목/불릿/표 `셀 / 셀`/`[사진]`).
- 사람이 네이버에 붙여넣어 **임시저장만**(자동 발행 없음 — writePost.json 2020 종료).
- export·검증은 순수함수 → **외부 호출/비용 0**. (`lib/naver/contentFormatter`, `lib/validation`)

## AI CLI 호출 버튼 주의 (비용 발생 지점)
- 비용 발생: **키워드 생성 / 본문 작성·수정·정제 / 이미지 프롬프트·생성·재생성** (로컬 claude/codex/gti 구독 CLI).
- 내부 점검·문서 작업 중에는 이 버튼들을 누르지 않는다. 실제 콘텐츠를 만들 때만 사람이 의도적으로.

## 비용 없이 쓰는 방법
- export/검증/유사도/분석(smartBlock, titleSimilarity, validate)만 사용 → AI 호출 0.
- 이미 작성된 초안을 붙여넣어 export만 뽑는 흐름은 완전 무비용.

## 멈췄을 때 확인할 것
1. 서버 살아있나: `curl http://localhost:3100/` → 200 기대.
2. 포트 충돌(3100 점유): 기존 dev 프로세스 종료 후 재기동.
3. `.env.local` 로드 여부(Next 자동) — 값은 열람 금지.
4. AI 버튼이 멈춤: 로컬 CLI(claude/codex/gti) 구독/로그인 상태 문제일 수 있음(외부).
5. Supabase 의존 화면(sessions/매장) 오류: DB 연결 환경 문제 → 내부 점검은 export 흐름으로 우회.
6. 로그/오류는 `docs/ai/ERROR_LOG.md`에 증상/원인 후보 기록.
