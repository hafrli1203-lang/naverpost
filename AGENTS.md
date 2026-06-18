# AGENTS.md — naverpost (네이버 블로그 자동 작성 프로그램 / 안경원)

이 프로젝트는 **LLM Wiki / Workflow / Loop Pattern** 방식으로 운영한다.
워크스페이스 공통 규칙은 `C:\project\_AGENCY_OS\MASTER_RULES.md`를 따른다(충돌 시 그 문서가 우선).

## 가장 먼저 읽을 것 (우선순위)
1. **기존 `CLAUDE.md`** — 이 프로젝트의 핵심 규칙(3단계 파이프라인, 발행 금지·붙여넣기 export, 한국어 전용, 금지어 필터, 쉼표 정책, 모듈 상태 경계). **최우선.**
2. `bot_created_rule.md` — 봇/기능 개발 5단계 플로우(설계→스펙 테스트→아웃풋 체크→인풋 체크→모듈화).
3. `docs/ai/` — 운영 문서(아래 WIKI_INDEX 참조).
4. `docs/designs/` — 기능별 설계 문서. 새 기능 추가 시 여기에 먼저 작성.

## 작업 원칙
- TASK 하나씩만 처리한다. 첫 세션은 구조 파악/문서만.
- 코드 작성 전 `docs/designs/`에 설계 문서를 먼저 쓴다(5단계 플로우 STEP 1).
- 테스트(`pnpm test` / `pnpm dev` 실행 + 화면·출력 확인) 없이 완료라고 말하지 않는다. 증거를 남긴다.
- 민감정보(`.env.local`, API 키·토큰·쿠키, 네이버 계정/블로그 자격증명, 고객·매장 정보)를 읽거나 출력하지 않는다. 보이면 마스킹.
- 기존 기능·API 라우트·모듈을 삭제하지 않는다. `CLAUDE.md`의 "현재 모듈 상태 경계"를 침범하지 않는다.
- 네이버 블로그에 절대 "발행"하지 않는다(자동 발행 API 없음). 산출물은 붙여넣기용 export까지만.
- UI 작업이면 `docs/ai/UIUX_RULES.md`·`DESIGN_AUDIT.md`·`UI_TASKS.md`를 읽고 **한 화면씩** 수정한다.

## 작업 후
`docs/ai/TASKS.md`, `ERROR_LOG.md`, `DECISIONS.md`(+ UI면 `DESIGN_AUDIT.md`)와 `CHANGELOG.md`를 갱신하고 결과를 보고한다.


<!-- ===== 검수 구조 연결 (2026-06-18 추가) ===== -->

## 내부 검수 + 외부 리뷰 (Workflow의 검수 단계)

구현 후 아래 검수를 거친다. 자세한 운영: `C:\project\_AGENCY_OS\SUBAGENT_GUIDE.md`.

- **test-runner subagent**: 빌드/테스트/실행을 안전하게 확인(파일 수정·삭제·배포·DB 마이그레이션·패키지 설치 금지).
- **code-reviewer subagent**: 코드 품질/보안 회귀/기존 기능 회귀/데이터 흐름/리포트 오류/테스트 누락/UI 영향을 **읽기 전용**으로 검수, P0~P3 리포트(코드 수정 금지).
- **P0/P1은 반드시 수정** 후 재검수. 테스트 통과 전 "완료"라고 하지 않는다.
- **Codex 외부 리뷰(GitHub PR)**: `docs/ai/CODE_REVIEW.md` + `_AGENCY_OS/CODEX_REVIEW.md` 참조(Claude 내부 자동 실행 아님).
- 공통 리뷰 기준: `_AGENCY_OS/CODE_REVIEW_STANDARD.md`(6대 항목 + P0~P3).
