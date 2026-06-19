# PROJECT_BRIEF — naverpost

## 한 줄 요약
6개 안경원 네이버 블로그용 콘텐츠 자동 작성 시스템(Next.js App Router + pnpm). 3단계 파이프라인을 Human-in-the-loop 대시보드로 운영. 최종 산출물은 붙여넣기용 export(발행 금지).

## 감지된 스택 (실제 파일 근거)
- 프레임워크: Next.js 16(App Router) + React 19, TypeScript. `next.config.ts`.
- 패키지 매니저: pnpm(`pnpm-lock.yaml`). 포트 **3100**(`pnpm dev`/`pnpm start`).
- UI: Tailwind CSS v4 + shadcn/ui(@base-ui/react), lucide-react, next-themes, sonner.
- 데이터/외부: Supabase(`@supabase/supabase-js`), googleapis(Sheets), rss-parser, openai, mammoth/pdf-parse(문서 파싱), zod(검증).
- 테스트: vitest(`pnpm test`, `vitest.config.ts`).
- AI 실행: CLI 위임(claude / codex / gti) — `src/lib/ai/cli/`.

## 구조 메모 (`src/`)
- `app/` — App Router. 화면: `operations`, `admin`, `login`. API: `api/{keywords,article,image,sessions,blogops,topics,analysis,document,shops,title-similarity,auth}`.
- `lib/` — `ai`(CLI 래퍼·클라이언트), `naver`(contentFormatter/rss/searchSignals), `blogops`, `validation`, `keywords`, `prompts`, `nlp`, `analysis`, `topics`, `briefs`, `documents`, `domain`, `wash`, `storage`, `data`, `utils`.
- `components/`(+`ui/`), `hooks/`, `types/`, `data/`(writingPlaybook/washingPlaybook).
- 문서: `docs/designs/`(기능별 설계 20+), `docs/research/`, `CHANGELOG.md`, `bot_created_rule.md`, 스펙 `.md`(74KB).

## 핵심 제약
- 네이버 글쓰기 API(`writePost.json`) 2020 종료 → 자동 발행 없음. export로 대체, 사람이 임시저장.
- 한국어 전용. 본문 ~2000자, 제목 12~32자. 이모지/번호목록 금지. 금지어 100+ 필터.

## 아직 모르는 것 (확인 필요)
- `operations`/`admin` 화면의 실제 단계별 UI 흐름
- auth(로그인)·세션 처리 방식, Supabase 데이터 경로
- BlogOps 연동 런타임 동작

## 다음 행동
`TASKS.md`의 최우선 1개부터. 기존 `CLAUDE.md`·`bot_created_rule.md` 규칙 우선, 코드 전 `docs/designs/` 설계.
