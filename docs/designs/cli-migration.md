# CLI Migration — Claude API → Claude Code CLI / Gemini → ChatGPT CLI

v1.4 까지는 모든 LLM·이미지 호출을 SaaS API(Anthropic, Google AI Studio)로 처리했다. 로컬 전용 운영으로 전환하면서 API 사용료 부담이 커져, 이미 결제 중인 Claude / ChatGPT **구독제**를 재사용하도록 호출 경로를 CLI로 옮긴다.

## 목적

- 모든 LLM·이미지 외부 호출을 **사용자 PC의 CLI 자식 프로세스**로 처리해 추가 API 비용을 0원으로 만든다
- Claude API는 `claude -p` (Claude Code CLI, OAuth 구독), Gemini 텍스트는 `codex exec` (Codex CLI, ChatGPT 구독), 나노바나나 프로 이미지는 `gti` (god-tibo-imagen, ChatGPT 구독)로 대체
- 기존 함수 시그니처는 **무수정**, 호출처(라우트, 컴포넌트, validator)는 영향 받지 않게 한다

## 트리거 조건

기존 워크플로우와 동일하다. 내부 호출 경로만 바뀐다.

| 단계 | 트리거 | 호출 함수 (시그니처 무변경) |
|---|---|---|
| 카테고리 주제 추천 | 매장·카테고리 선택 후 자동 | `generateTopicSuggestions(prompt)` |
| 키워드/제목 10개 | "키워드 생성" 버튼 | `generateKeywords(prompt)` |
| 본문 작성 | "본문 작성" 버튼 | `writeArticle(prompt)` |
| 본문 수정 | 검증 실패 시 자동 | `reviseArticle(prompt)` |
| GEO 재작성 | "GEO 최적화" 버튼 | `rewriteArticleForGeo(prompt, timeoutMs)` |
| 이미지 프롬프트 10개 | 이미지 생성 시작 시 | `generateImagePrompts(prompt)` |
| 이미지 생성 | 위에 이어서 자동 | `generateBlogImage(prompt)` |

## 아웃풋 정의

CLI 어댑터는 기존 SDK 호출과 **동일한 타입**을 반환한다. 호출처 입장에서는 백엔드가 바뀐 줄 모른다.

| 함수 | 반환 타입 | 형식 |
|---|---|---|
| `generateKeywords` | `KeywordOption[]` | JSON 배열, 코드펜스 또는 plain JSON 양쪽 허용 |
| `writeArticle / reviseArticle / rewriteArticleForGeo / generateImagePrompts` | `string` | 단일 텍스트 본문 |
| `generateTopicSuggestions` | `string` | 줄바꿈으로 구분된 3개 주제 |
| `generateBlogImage` | `{ base64Data, mimeType }` | PNG (또는 JPEG) base64, 4:3 강제 |

## 실패 복구

| 시나리오 | 처리 |
|---|---|
| CLI 실행 파일 미설치 (`ENOENT`) | `Error: <claude\|codex\|gti> CLI not found in PATH` 명시. 설치 명령 안내 메시지 포함 |
| 인증 만료 (Claude `Not authenticated` / Codex `auth.json missing`) | 동일 메시지로 정규화. `claude /login` 또는 `codex login` 안내 |
| stdout 빈 응답 | `Error: <name> CLI returned empty output` |
| JSON 파싱 실패 (`generateKeywords`) | 기존과 동일하게 `Error: Keyword generation returned an unexpected response shape.` |
| 타임아웃 | `AbortController` + `child.kill('SIGKILL')`. Claude/Codex 기본 60s, GEO 호출자가 90s 지정, 이미지 1장당 120s |
| 동시 호출 | 자식 프로세스는 OS가 직렬화 ↔ 부담 없음. 하지만 Codex/Claude 같은 사용자 OAuth 토큰 동시 사용은 rate limit 가능. 로컬 1인 사용 전제로 큐는 두지 않음 |
| `gti` private 백엔드 차단 | 차단 응답 감지 시 명시적 에러. 폴백은 두지 않음 (사용자가 환경에서 키 다시 발급할 때까지 기능 정지) |

## 상태 경계 (CLAUDE.md 모듈 표 갱신 사항)

| 모듈 | 소유 상태 | 변경 |
|---|---|---|
| `lib/ai/cli/claudeCli.ts` (신규) | 자식 프로세스 spawn | export `runClaude({ prompt, model, maxTokens?, timeoutMs? })` |
| `lib/ai/cli/codexCli.ts` (신규) | 자식 프로세스 spawn | export `runCodex({ prompt, model?, timeoutMs? })` |
| `lib/ai/cli/gtiCli.ts` (신규) | 자식 프로세스 spawn + 임시 PNG 파일 | export `runGti({ prompt, aspectRatio? })` |
| `lib/ai/claude.ts` | Anthropic SDK → **CLI 위임 래퍼** | export 시그니처 그대로 |
| `lib/ai/imageGen.ts` | Google AI Studio REST → **CLI 위임 래퍼** | `generateBlogImage(prompt)` 시그니처 그대로 (apiKey 매개변수 제거) |
| `lib/ai/gemini.ts` | — | **삭제** |
| `src/env.ts` | Zod schema | `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` 제거 |
| `src/app/api/image/generate/route.ts` | SSE 스트림 | `apiKey` 가드 제거, log 정정 |
| `src/app/api/image/prompts/route.ts` | — | 영향 없음 (claude.ts 시그니처 유지) |

호출 인자 / 반환 타입은 기존과 동일하므로 라우트·컴포넌트·검증 모듈은 모두 무수정.

## 호출 명세

### `claude` CLI

```
claude -p \
  --model claude-sonnet-4-6 \
  --output-format json \
  --no-session-persistence \
  --disable-slash-commands \
  --system-prompt "You are a content assistant. Reply only with the requested output." \
  --tools "" \
  < <stdin: prompt>
```

- `--bare`는 사용 금지. `--bare`는 OAuth(구독)을 끄고 ANTHROPIC_API_KEY만 받기 때문에 비용 절감 목적과 정반대
- `--system-prompt` 로 프로젝트 CLAUDE.md 자동 주입을 차단해 토큰 폭증 방지
- `--output-format json` 의 `result` 필드를 추출하여 호출자에게 반환

### `codex` CLI

```
codex exec \
  --skip-git-repo-check \
  - \
  < <stdin: prompt>
```

- `--skip-git-repo-check`로 cwd 제약 회피
- 출력에서 마지막 turn 텍스트만 발췌

### `gti` CLI

```
gti \
  --prompt <prompt> \
  --output <tmpdir>/<uuid>.png \
  --provider auto
```

- 결과 PNG를 `fs.readFile`로 읽고, `sharp`로 4:3 리사이즈 후 base64 변환
- `tmpdir` 정리는 `imageStore.cleanupSession`에 위임 (이미 존재)

## 보안·운영 메모

- `~/.claude/.credentials.json`, `~/.codex/auth.json`은 사용자 홈 디렉터리 내부에만 존재. 본 코드는 **읽지 않는다** (CLI가 알아서 읽음)
- CLI stdout/stderr는 그대로 로그에 노출되므로, 프롬프트에 비밀(예: Naver Client Secret) 포함 금지
- 자식 프로세스 spawn 시 `shell: false` 강제, prompt는 stdin으로만 주입해 인젝션 차단
- `gti`는 비공식 백엔드 경고를 띄운다. 차단 시 사용자가 직접 인증 재발급 또는 정식 OpenAI API로 전환 결정

## 검증 (STEP 2~4 사전 정의)

| 단계 | 케이스 | 기대 결과 |
|---|---|---|
| 정상 | 키워드 생성 1회 | 10개 후보, 기존 응답과 구조 동일 |
| 정상 | 본문 생성 1회 | ~2000자 본문 |
| 정상 | 이미지 생성 1장 | 4:3 PNG 1장, 100KB 이상 |
| 엣지 | CLI 미설치 | `<name> CLI not found in PATH` |
| 엣지 | OAuth 만료 | 명확한 재로그인 안내 |
| 엣지 | stdout 빈 응답 | `empty output` 에러 |
| 엣지 | gti 차단 | private 백엔드 에러 메시지 그대로 노출 |

## Out of scope

- 멀티유저 동시성·큐잉 (로컬 1인 전제)
- Vercel/원격 배포 (이번 마이그레이션으로 더 이상 동작 안 함)
- gti 차단 시 정식 OpenAI gpt-image-1 폴백 (차단되면 그때 별도 결정)
