# Codex 작업 지시서 — 키워드/제목/본문 생성 고도화

> 목적: 부스트리 매뉴얼(키워드사운드 조합 → 블랙키위 검색량/발행량 체크 → 선별)의 워크플로우를
> 우리 실데이터(네이버 검색광고 API) 위에 재현하고, 본문 프롬프트를 dry-run에서 발견한 문제대로 수정한다.
> 외부 사이트(블랙키위/키워드사운드) 스크래핑·API 연동은 하지 않는다. 근거는 §1.

---

## 0. 현재 상태 (이미 반영됨 — 중복 작업 금지)

이번 세션에서 아래는 이미 수정/생성되었다. Codex는 이걸 다시 만들지 말고 **그 위에 이어서** 작업한다.

- `src/app/api/keywords/route.ts`
  - `isAwkwardGeneratedTitle` 를 진짜 기계적/스팸 패턴만 잡도록 축소.
  - `alignTitleWithKeywords` 가 LLM 제목을 그대로 유지(서브키워드만 보정).
  - `normalizeGeneratedOptions` 가 망가진 제목을 템플릿으로 덮어쓰지 않고 `isUsableLlmTitle`로 **드롭**.
  - `composeAlignedTitle`, `polishGeneratedTitle` 는 `@deprecated`(호출 안 됨, 삭제 가능).
- `src/lib/prompts/articlePrompt.ts`
  - `competitorSection`: 상위 글 공통 형태소를 "질의 의도 핵심 형태소"로 강제 + 비중 분산 + 질의의도 역전 방지.
  - `topicThesisSection`: 전체 주제(논지)를 글 전체 관통 축으로 주입 + 체크리스트 13번.
- 신규 분석 모듈(모두 graceful fallback 포함):
  - `src/lib/analysis/smartBlock.ts` — `inferSmartBlockSubKeywords(mainKeyword)`
  - `src/lib/analysis/autocompleteIndex.ts` — `analyzeAutocompleteIndex({title, mainKeyword, body, ...})`
  - `src/lib/analysis/postingAudit.ts` — `auditPosting({title, body, mainKeyword, ...})`
  - `src/app/api/analysis/route.ts` — `mode: smart-block | autocomplete-index | posting-audit` 디스패처

---

## 1. 키워드 선정을 "실제 검색량" 기반으로 (키워드사운드 + 블랙키위 전략)

### 1.0 전략 결론 (반드시 준수)
- 블랙키위/키워드사운드를 **스크래핑하거나 연동하지 않는다.**
  - 블랙키위는 공개 API 없는 유료 SaaS이며, 그 검색량 수치의 원천은 **네이버 검색광고 키워드도구**다.
  - 우리는 `src/lib/naver/searchSignals.ts`에서 이미 그 검색광고 API(`fetchSearchAdKeywordStats`)와 블로그 문서수(`fetchBlogSearch.total`)를 직접 호출한다 → 같은 데이터를 더 안정적으로 확보 가능.
  - 키워드사운드 "조합기"는 단어 데카르트 조합 알고리즘일 뿐이므로 코드로 재현한다.
- 따라서 "두 도구 접목"의 올바른 구현 = **조합기 + 실검색량 게이트를 우리 코드에 만든다.**

### 1.1 [신규] 키워드 조합기 — `src/lib/keywords/keywordCombiner.ts`
부스트리 공식(지역×시술×병원×효과×롱테일 1+2,1+3,2+3…)을 안경원 도메인으로 구현.

- export `combineKeywords(params)`:
  - 입력: `{ categoryId: string; region?: string; coreHeads: string[]; modifiers?: string[] }`
  - `coreHeads`: 카테고리별 시술/제품 축 단어. **하드코딩 신규 생성 금지** — `route.ts`의 기존 `BROAD_KEYWORD_HEADS[categoryId]`를 재사용(import 또는 동일 데이터 공유).
  - `modifiers`: 효과/상황/롱테일 수식어. 카테고리별 기본 세트 제공(예: 적응, 울렁임, 시야, 도수, 관리, 착용감, 원인, 검사 등). 기존 `DEFAULT_CORES_BY_HEAD` 재사용 가능.
  - 출력: `KeywordOption[]` 형태의 2단어 조합 후보. `mainKeyword = "{head} {modifier}"`, `subKeyword1/2`도 같은 head 기반.
  - 규칙: 정확히 2단어, 중복 제거, 지역어는 방문전환형에만(모든 후보에 강제 금지).
- 조합 폭발 방지: head당 modifier 상위 N개(예: 6)로 제한, 카테고리당 총 후보 ≤ 60.

### 1.2 [신규] 검색량 게이트 — `src/lib/keywords/volumeGate.ts` (또는 opportunityScoring 확장)
부스트리 "검색량 많고 발행량 적은 것" 규칙을 함수화.

- export `applyVolumeGate(candidates, signals)`:
  - `signals`: `fetchKeywordOpportunitySignals()`가 주는 `SearchVolumeSignal[]`(월간검색량 + blogDocumentCount + opportunityScore).
  - 각 후보 mainKeyword를 검색량 신호와 매칭(`normalizeKeywordKey` 동일 방식).
  - 분류:
    - `pass`: 월간검색량 ≥ `MIN_VOLUME`(기본 30, env로 조정) **그리고** 포화도(blogDoc/volume)가 낮은 편.
    - `weak`: 검색량은 있으나 포화도 높음(발행량 과다) → 후순위.
    - `unknown`: 검색량 신호 없음(검색광고 키 미설정 시 전부 여기) → LLM 판단에 위임.
  - 반환: 후보에 `_volumeTier: "pass"|"weak"|"unknown"` 부착 + pass 우선 정렬.
- **검색광고 자격증명 없을 때**(`NAVER_SEARCHAD_*` 미설정): 게이트를 끄고 전부 `unknown` 처리 + 응답 notes에 "실검색량 미사용(검색광고 키 필요)" 명시. 절대 빈 결과로 죽지 않게.

### 1.3 [수정] `src/app/api/keywords/route.ts` 연결
- 후보 생성 순서를 바꾼다: 현재 LLM(GPT/Claude)이 주도 → **조합기 후보를 1차 시드로** `baseCandidates`에 합류(기존 `buildFallbackKeywordOptions`와 병합).
- 최종 선별 단계(`rankedPool`/`pickIntentBalancedKeywordResults` 부근)에서 `applyVolumeGate` 결과의 `_volumeTier`를 점수에 반영: `pass` 가산, `weak` 감산. 실검색량이 있는 후보가 상위로 올라오게.
- 각 결과 항목에 검색량/발행량/포화도 수치를 그대로 실어 응답(이미 `analysis.externalSignals`에 일부 있음 — 누락 필드 보강).

### 1.4 수용 기준
- 검색광고 키가 있으면: 반환된 10개 후보 중 다수가 월간검색량 > 0이고, 검색량 대비 발행량 낮은 후보가 상위.
- 키가 없으면: 죽지 않고 `unknown`으로 동작 + notes 경고.

---

## 2. 제목 선정에 스마트블록 하위키워드 반영

부스트리/블라이 핵심: 스마트블록 키워드는 제목에 상위어가 아니라 하위키워드가 들어가야 노출.

- `src/app/api/keywords/route.ts`에서 최종 후보의 `mainKeyword`에 대해 `inferSmartBlockSubKeywords()`(이미 구현됨, `src/lib/analysis/smartBlock.ts`) 호출.
  - 성능: 최종 상위 후보(예: 10개)에만, `Promise.all`로 병렬, 실패 graceful.
- `recommendedTitleKeyword`가 메인키워드와 다르고 `titleHits >= 2`면:
  - 해당 후보의 제목 생성/표시에 하위키워드를 제목용 메인키워드로 승격(또는 결과에 `suggestedTitleKeyword` 필드로 동봉해 UI가 보여주게).
- 자동 치환이 위험하면 최소한 `analysis`에 `smartBlock` 결과를 실어 UI에서 사용자가 선택하게 한다.

---

## 3. 본문 프롬프트 수정 — `src/lib/prompts/articlePrompt.ts` (dry-run 결과 반영)

### 3-1. 쉼표 정책 — **사용자 결정 필요 (Codex는 둘 중 지시된 쪽만 실행)**
- 현재 `CLAUDE.md` 핵심 규칙과 프롬프트가 쉼표를 전면 금지한다. dry-run에서 문장이 "~고 ~서 ~데"로 길게 늘어져 가독성이 떨어졌다.
- 옵션 A(완화): 프롬프트의 "쉼표(,) 절대 금지" → "쉼표 남용 자제 + 한 문장 한 메시지(50자 내외)"로 바꾸고, 체크리스트의 쉼표 항목 삭제, `CLAUDE.md`의 쉼표 금지 규칙도 동기화.
- 옵션 B(유지): 그대로 둔다.
- **기본값: 사용자가 A를 지시하지 않으면 건드리지 않는다.**

### 3-2. 표(table) 필수 → 조건부 권장
- 현재 "표가 없는 글은 불합격"으로 강제. 경험형/공감형 주제(적응·울렁임 등)에 표가 어색하게 끼워진다.
- 수정: "비교·스펙·상황 구분이 필요한 주제에 한해 표를 1개 권장. 경험·공감 중심 주제에서는 표가 어색하면 생략 가능." 체크리스트 6번도 "해당 시"로 완화.
- 위치 앵커: "6. 시각적 요소 (표 배치)" 블록과 최종 체크 "6. Markdown 표가 최소 1개 포함되었는가?".

### 3-3. 키워드 vs 보조 형태소 구분 명시
- 현재 5번 "키워드 사용" 규칙(메인≥2, 서브≥1, 합계≤5)과 `competitorSection`의 "형태소 비중 풍부히"가 충돌하는 인상.
- 5번 규칙 끝에 한 문단 추가:
  - "위 횟수 제한은 고정형 '키워드'(메인/서브)에만 적용된다. 상위 글 공통 명사 같은 '보조 형태소'는 키워드가 아니므로 횟수 제한 대상이 아니며, 질의 의도를 위해 본문 전반에 풍부히 분산해 쓴다."

### 3-4 (이미 반영됨) 전체 주제 논지 / 경쟁 형태소 — 재작업 금지.

---

## 4. (선택) 분석 모듈 UI 노출
`/api/analysis` 세 모드 결과를 화면에 패널로:
- 키워드 화면(`src/components/KeywordOptions.tsx`): `smart-block` 추천 하위키워드 칩, `autocomplete-index` 제안 키워드 칩.
- 본문 미리보기(`src/components/ArticlePreview.tsx`): `posting-audit` 리포트(질의의도 커버리지/과다반복/금지어/이미지·글자수 경고).
- UI는 기존 컴포넌트 구조를 따르고, API 실패 시 패널만 숨긴다(페이지 깨짐 금지).

---

## 5. 전체 수용 기준 / 검증
- `pnpm type-check` 및 `pnpm build` 통과.
- 신규/수정 파일에 미사용 import 없음.
- `curl` 스모크:
  - `POST /api/keywords` → 10개 후보, 검색광고 키 있으면 월간검색량/발행량 동봉.
  - `POST /api/analysis {mode:"smart-block", mainKeyword:"누진렌즈"}` → 하위키워드 후보.
- 회귀: 제목이 다시 "관리 습관이 흔들릴 때"류 템플릿으로 돌아가지 않는다(§0 보존).

---

## 부록 A. 데이터 출처 매핑 (왜 외부 사이트 연동이 불필요한가)
| 외부 도구 기능 | 데이터 원천 | 우리 대체 |
|---|---|---|
| 키워드사운드 조합기 | (알고리즘) | §1.1 `keywordCombiner.ts` |
| 블랙키위 월간 검색량 | 네이버 검색광고 키워드도구 | `searchSignals.fetchSearchAdKeywordStats` (이미 있음) |
| 블랙키위 발행량(문서수) | 네이버 블로그 검색 total | `searchSignals.fetchBlogSearch.total` (이미 있음) |
| 블랙키위 연관/롱테일 | 네이버 자동완성 | `searchSignals.fetchAutocomplete` / `autocompleteIndex.ts` (이미 있음) |
| 블라이 경쟁 포스팅 공통 형태소 | 상위 블로그 본문 | `competitorMorphology.ts` (이미 있음) |
| 블라이 스마트블록 하위키워드 | 검색결과 구조 | `smartBlock.ts` (상위제목+자동완성 추론, 이미 있음) |

## 부록 B. 필요한 환경변수 (.env.local)
- 실검색량 필수: `NAVER_SEARCHAD_API_KEY`, `NAVER_SEARCHAD_SECRET_KEY`, `NAVER_SEARCHAD_CUSTOMER_ID`
- 검색/자동완성/경쟁분석: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- 위가 없으면 각 기능은 graceful하게 unknown/unavailable 처리(절대 크래시 금지).
