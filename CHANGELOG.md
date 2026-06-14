# Changelog

버전은 소수점으로 관리한다 (v1.0 → v1.1 → v2.0).
버그 발견 시 번호 부여 후 버전 올려서 수정 기록한다.

---

## v2.1 (2026-06-15)

### BUG-001 깨진 옛 제목이 화면에 되살아남 (stale localStorage)
증상: 매장(top50jn)·안경이야기 키워드 화면에 `작용감`(→착용감), `코팅칠`(→코받침), `다음 도구`(→더운 곳) 등 깨진 제목 노출. 조사 결과 서버 캐시/라이브 재생성은 정상이었고(라이브 `refresh:true` 실측 — 모두 자연스러운 제목), 깨진 제목은 **현재 코드가 만든 게 아니라** `usePersistedWorkflow`가 버전 체크 없이 복원한 **구버전 localStorage 결과**였다.

- **원인**: `usePersistedWorkflow.ts`가 저장 상태에 스키마 버전이 없어, 코드가 바뀌어도 옛 결과를 그대로 복원했다.
- **수정**: 저장 포맷을 `{version, state}` 봉투로 변경. `WORKFLOW_STATE_VERSION` 상수 추가(현재 2). 진입 시 버전 불일치/옛 포맷(버전 없음)은 **묻지 않고 자동 폐기**, 버전이 같을 때만 기존 "이어서 작업?" 팝업 유지.
- **검증(Playwright 실측, :3100)**: ① 옛 포맷+깨진 제목 심고 새로고침 → 팝업 없이 자동 폐기, 화면에서 깨진 단어 사라짐. ② v2 봉투 → "이어서?" 팝업 정상 표시 → 수락 시 stage 복원(회귀 없음). `tsc --noEmit` 0 에러.
- **재발 방지**: 키워드/제목 결과 스키마가 바뀌면 `WORKFLOW_STATE_VERSION`을 올리면 옛 결과가 자동으로 폐기된다.

## v2.0 (2026-06-14)

### 장면 매칭 (scene-aware reference) — 상황에 맞는 실제 매장 사진 사용
사용자 요구: 실제 매장 사진을 넣되 "검안 장면엔 검안실 사진, 피팅엔 피팅 사진"을 골라 쓰고, 합성이 아니라 참조로 활용. 검안기 정위치·피팅 착석 동작 교정. 설계: `docs/designs/image-realism.md` (v2.0).

- **사진 장면 인덱스**: `data/shop-refs/_scene-index.json` — 6개 매장 전 사진을 육안 분류(외관/내부/검안/피팅/디테일) + 매장별 `interiorDescription`·`brand`. (서브에이전트 생성)
- **프롬프트 장면 태그 세분화**: `[STORE]` 단일 마커 → `[SCENE:exterior|interior|exam|fitting|detail]`. 매장 밖(집·사무실·야외)·개념 이미지는 무태그. 구버전 `[STORE]`는 interior로 흡수(하위호환).
  - 신규 `parseScenePrompt()` (`imagePrompt.ts`), `getSceneReferenceImages(shopId, scene)` (`shopRefs.ts`, 최대 2장 + 폴백 체인 exam/fitting/detail→interior).
- **검안 동작 교정**: 손님이 검안의자에 앉은 장면은 검안기/포롭터가 환자 정면 정위치(옆으로 빠지거나 앞이 비면 안 됨) — 사용자가 지적한 "테이블 옆으로 빠짐" 해결.
- **피팅 동작 교정**: 피팅·상담은 카운터/테이블 착석 진행. 피팅 테이블 사진 없으면 매장 톤에 맞게 임의 생성 허용.
- **interiorDescription 출처**: `_scene-index.json` 우선(profile.json 폴백).
- **배선 변경**: `{prompt,isStore}` → `{prompt,scene}`. `BlogImage.isStore` → `BlogImage.scene`. `/api/image/{prompts,one,regenerate,generate}` 전부 scene 기반으로 전환.
- 보안: `shopRefDir` 경로 트래버설 차단 유지. 한글/공백 파일명 참조 경로 정상 처리(실측 검증).

## v1.9 (2026-06-14)

### 이미지 사실성 개편 (실사 + 실제 매장 반영 + 동작 사실성)
사용자 피드백: "90년대 필름톤·망한 안경원·피팅 동작 오류·후진국 모습". 설계: `docs/designs/image-realism.md`.

- **필름톤 제거**: `imagePrompt.ts`에서 `shot on 35mm film`·`soft natural color` 삭제 → 현대 스마트폰/미러리스 실사 톤(clean/sharp/bright/true-to-life color).
- **시대 고정(전역)**: present-day 2020s Korea 강제. vintage/retro/1990s/faded/run-down/developing-country 금지어 추가.
- **현대 안경원 인테리어 강제**: 밝고 깔끔한 매장, 벽면 백라이트 진열장. 오픈장·먼지·낡음 금지.
- **동작 사실성 규칙 신설**: 피팅은 안경테를 손에 들고 얼굴에서 떨어뜨려 조정(공구는 테에만). 쓴 안경 얼굴에 공구 들이대는 장면 금지. 검안 자세 명시.
- **실제 매장 참조사진 파이프라인**: `gti --image`로 매장별 실제 사진 첨부. `data/shop-refs/<blogId>/`(사진 + profile.json). `[STORE]` 태그 프롬프트(매장 장면)에만 첨부, 정보/개념 이미지엔 미첨부.
  - 신규: `lib/data/shopRefs.ts`(`getShopRefImages`/`getShopProfile`), `gtiCli` `images?` 옵션, `generateBlogImage(prompt, refImages?)`.
  - shopId 배선: 프론트 → `/api/image/{prompts,one,regenerate,generate}`. 프롬프트 반환을 `{prompt,isStore}[]`로 객체화. `BlogImage.isStore` 추가.
  - 폴백: 사진 없으면 profile.json 인테리어 설명(또는 기본 묘사)만으로 생성. 매장 미지정도 정상 동작.

## v1.8 (2026-06-13)

### C-Rank 보강 4종 (사진 제외)

C-Rank/DIA 점수를 끌어올리는 in-system 레버를 묶어 추가. 실매장 사진 보강은 운영 영역이라 제외.

**1. C-Rank 사전 점검 패널 (UI 연결)**
- 이미 구현돼 있었지만 UI에 연결 안 된 `/api/analysis` `posting-audit`를 본문 미리보기 화면에 노출.
- 신규 `components/CRankAudit.tsx`: 질의 의도 집중도(제목 형태소 본문 활성화율)·상위 반복 형태소·과다반복(스팸 신호)·주의 표현·글자수/형태소 종류/쉼표를 점수로 표시. `ArticlePreview` 우측 패널에 마운트.
- 이미지 마커가 본문에 없다는 경고는 이 앱이 이미지를 별도 단계로 처리하므로 UI에서 숨김.
- 추가형이라 본문 생성 규칙은 미변경(무회귀).

**2. AI 상투어 워싱 결정론적 치환 보강**
- 신규 `lib/wash/aiClicheSanitizer.ts`: `contentSignalAnalyzer`가 "약한 AI 상투어"로 검출만 하고 강제 재작성은 안 하던 표현 중, 문법·어미 레지스터를 깨지 않는 안전한 1:1 치환만 적용(예: 차근차근→하나씩, 살펴볼게요→짚어볼게요, 도움이 돼요→도움이 될 수 있어요). 문장 끝을 깨는 구조형 상투어는 의도적으로 제외(LLM 워싱에 위임).
- `api/article/wash`의 Pass 1·3 결정론 단계에 연결. `washReport.aiClicheReplacements` 집계 추가. 워싱 클릭 시에만 적용돼 기본 생성 경로 무회귀.

**3. 시리즈 발행 플래너 (설계: docs/designs/series-planner.md)**
- 신규 `lib/topics/seriesPlanner.ts` + `POST /api/topics/series` + `components/SeriesPlanner.tsx`.
- 한 헤드 키워드를 여러 검색 의도 축(문제·비교·검사·생활·방문·상품)으로 나눠 N편 시리즈를 제안 → 주제 권위(C-Rank 맥락) 누적. `topicPlanner` 축 순환 재사용, BlogOps 노출 1~3위 키워드는 자기잠식 가드로 제외. 매장 미등록 상품 시 카테고리 표준 헤드(누진렌즈 등) 폴백.

**4. 발행 일관성 트래커 (설계: docs/designs/posting-cadence-tracker.md)**
- 신규 `lib/blogops/cadence.ts` + `GET /api/blogops/cadence` + `components/CadenceTracker.tsx`.
- BlogOps `/posts`의 `published_at`으로 매장별 마지막 발행 경과·평균 간격·상태(good/slowing/stale) 산출(권장 간격 3일). C-Rank 연결(Chain) 축의 꾸준한 발행 점검. 읽기 전용, BlogOps 다운 시 graceful.
- 신규 페이지 `/operations`(콘텐츠 운영)에 3·4 마운트. 메인/admin 헤더에서 상호 링크.

**검증:** `tsc --noEmit` 0 에러, `next build` 0 에러(신규 라우트 `/api/topics/series`·`/api/blogops/cadence`·`/operations` 컴파일 확인). 라이브: cadence 6매장 전부 good, series 축 다양성 5편·headKeyword "누진렌즈", posting-audit coverageRatio 1.0 정상.

---

## v1.7 (2026-06-04)

### 본문이 수정된 제목/키워드를 무시하고 옛 주제로 써지는 버그

**버그(#7):** 사용자가 키워드 후보의 제목/키워드를 수정·저장해도 본문은 기존(원본) 주제로 써짐.

**근본 원인:**
- 본문 프롬프트(`articlePrompt.ts`)에서 `topic`이 "글 전체를 관통하는 논지축"으로 모든 소제목·문단을 지배함
- 그런데 `topic`은 워크플로우 전체가 공유하는 단일 값(`WorkflowState.topic`)으로, 키워드 생성 시 한 번 정해진 뒤 사용자가 제목/키워드를 수정해도 갱신되지 않음 (`KeywordOption`에는 후보별 topic 필드 없음)
- `app/api/article/route.ts`가 `topic: topic || keyword.title`로 stale한 공유 topic을 편집된 제목보다 우선 사용 → 편집값(`keyword.title`/`mainKeyword`)은 전달되지만 본문 논지는 옛 주제를 따라감
- 부수 효과: 화면 제목(후보별 `keyword.title`)과 본문(공유 topic)이 따로 놀아 제목·키워드가 무관해 보임

**변경사항:**
- `app/api/article/route.ts`: `deriveArticleThesis(sharedTopic, keyword)` 헬퍼 신규. 본문 논지축을 선택·편집된 후보에서 도출하고, 공유 topic은 후보의 메인 키워드를 (공백 차이 무관) 담고 있을 때만 보조 논지로 채택. `brief`·`buildArticlePrompt`·`buildPromoPrompt` 3곳의 `topic` 인자를 `effectiveThesis`로 통일

**검증:** `tsc --noEmit` 0 에러.

**남은 작업:** 제목·키워드 의미 일관성 자체(생성 단계, BUG #8)는 키워드 생성 프롬프트 보강으로 별도 진행 예정.

### 실제 상위 노출 제목을 키워드/제목 생성의 '방향 참고'로 활용 (경량)

**문제(#8 일부):** 생성된 제목/키워드가 실제 네이버에 올라온 글들과 동떨어져 이상함.

**근본 원인:**
- 실제 상위 노출 제목(`fetchCompetitorTitles`)을 수집은 하지만 **"피하라(중복 회피)"용으로만** 사용. "독자가 실제로 찾는 소재·의도의 방향 참고"로는 미사용
- 화면에 뜨는 최종 후보는 대부분 GPT 생성 경로(`generateKeywordCandidatesWithGpt`)에서 나오는데(`route.ts:2797` — GPT 성공 시 Claude 편집 프롬프트 건너뜀), **이 GPT 프롬프트에는 경쟁 제목이 전혀 주입되지 않음.** 하드코딩 키워드 조합 + 추상 규칙만으로 생성
- 참고: `titlePrompt.ts:buildTitleGenerationPrompt`는 호출처 없는 죽은 코드(수정 대상 아님)

**변경사항:**
- `lib/ai/openaiKeywords.ts`: `generateKeywordCandidatesWithGpt`에 `competitorTitles` 인자 추가. 실제 상위 제목을 `[독자가 찾는 소재·의도의 지도]` 섹션으로 프롬프트에 주입 — "소재·의도는 겨냥하되 표현·각도·조합은 차별화" 프레이밍
- `app/api/keywords/route.ts`: `generateGptKeywordCandidatePool`에 `competitorTitles` 전달 배선 + 호출처(`competitorList`) 연결. Claude 폴백 프롬프트(`buildCandidateEditingPrompt`)의 경쟁 제목 섹션도 "피하라"에서 "방향 참고 + 차별화"로 재프레이밍

**검증:** `tsc --noEmit` 0 에러. (실제 생성 품질은 라이브 키워드 생성으로 추가 확인 필요 — Naver/Codex CLI 연동)

### 상위 정보성 글 '본문 내용'을 Stage 1 키워드/제목 생성에 grounding (구조화 신호 + 병렬·폴백)

**요청:** 실제 상위노출 정보성 글의 본문 내용을 가져와 키워드/제목 방향을 잡을 것. (지역명 등은 사용자가 최종에 직접 추가)

**근거:** 상위글 본문을 실제로 스크래핑·분석하는 `analyzeCompetitorMorphology()`(상위 3글×1200자 → `bodyHighlights`/`contentBlocks`/`titleAngles` 추출)가 이미 있으나 Stage 2(본문)에서만 사용. Stage 1은 본문 내용 0이었음.

**변경사항:**
- `lib/ai/openaiKeywords.ts`: `generateKeywordCandidatesWithGpt`에 `topPostContent`(bodyHighlights/contentBlocks/titleAngles) 인자 추가. `[실제 상위 정보성 글이 다루는 소재·구조]` 섹션으로 GPT 프롬프트에 주입 — "이 소재 영역을 겨냥하되 표현·각도·조합은 차별화". 원문이 아니라 구조화 신호만 주입(광고·지역명 노이즈/베끼기 방지)
- `app/api/keywords/route.ts`: `analyzeCompetitorMorphology` import. 시드 `effectiveTopic || category.name`로 기존 수집 Promise.all에 **병렬** 추가 + **48초 타임아웃 race** 폴백. `available`일 때만 `topPostContent` 도출 → `generateGptKeywordCandidatePool` 배선. 실패/초과/unavailable 시 null → 제목 방향참고만 남아 속도·생성 회귀 없음 (maxDuration 360s, 병렬이라 +최대 48s)
  - **타임아웃 18→48초 (라이브 검증으로 수정)**: 18초로는 항상 timeout. 내부 Claude 형태소 분석만 35초 + 본문 fetch라 Stage 2와 동일한 ~45초 필요. 격리 측정 결과 `콘택트렌즈` 시드 24.7초/`available`.

**설계 문서:** `docs/designs/stage1-top-post-content-grounding.md`

**검증 (라이브, 매장 top50jn / 카테고리 contacts):**
- 모폴로지 `status: available`, sampleSize 10, bodySampleSize 3, **grounded: true**. 본문 소재(건조·충혈·이물감·적응·착용시간 등 실제 상위글 부작용/착용감 각도) 추출 확인.
- 생성 10개 전부 제목↔메인키워드 의미 연결됨(예: `알콘렌즈 충혈`→"알콘렌즈 충혈이 반복된다면 산소투과율부터 따져봐야 합니다"). 실제 렌즈 브랜드(아큐브·알콘·바슈롬·쿠퍼비전) grounding. 논지 topic도 후보 기반 도출.
- 전체 응답 ~213초(maxDuration 360s 이내). `tsc --noEmit` 0 에러.

**전체 카테고리 라이브 검증 (2026-06-05, 매장 top50jn, 6개 카테고리):**
- grounding **6/6 전부 `available` + `grounded:true`** (각 검색 10건 + 본문 3건 스크래핑). 응답 100~339초로 모두 maxDuration 이내.
- 제목↔메인키워드 의미 연결 6/6 양호. 실제 광학 스펙 grounding 확인: 콘택트=산소투과율·베이스커브·난시축, 안경렌즈=PD위치·동공간거리·블루라이트스펙, 누진=명시야폭·프레임높이, 눈정보=안압·눈물막파괴시간.
- **개수 편차(기존 이슈, 본 변경과 무관)**: frames/lenses/contacts/eye-info/progressive = 각 10개. **glasses-story = 3개**(응답 100초, grounded:true이나 후보가 적게 생성됨). 안경이야기는 이전부터 소재 쏠림으로 개수 편차가 있던 카테고리 — 별도 튜닝 대상.

### rule2(서브 앵커 반복) 제거 — grounding 서브가 대량 무효 처리되던 문제

**버그(#9):** grounding으로 서브 키워드가 전문적·다양해지자(예: 메인 `아큐브렌즈 산소투과율` + 서브 `렌즈 Dk/t`/`각막 산소공급`) rule2 "서브 중 최소 하나에 메인 기준어 포함"에 걸려 대량 무효(contacts 10개 중 7개 X). rule2는 단조로운 `메인+착용감` 반복만 통과시켜 키워드 품질을 떨어뜨림. 또 백필 단계가 `validation.isValid`만 채우므로(route.ts 1790/1817/2030/2065/2099), 제품 카탈로그 없는 glasses-story는 전부 rule2 실패→백필 불가→3개로 마감.

**변경사항:**
- `lib/validation/keywordRules.ts`: rule2(앵커 반복 요구, 88~106행) 삭제. 미사용된 `selectKeywordAnchor` 헬퍼도 제거. 주제 응집성은 rule3(메인 키워드 제목 원형 포함)로 보장. rule1(2단어 체크)·rule3 유지.

**검증 (라이브, rule2 제거 후 재실행):**
- **contacts: 무효 7개 → 0개. 10/10 전부 유효** (함수율·BC·산소투과율·지질침전·축회전·단백질침전 전문 스펙 통과).
- **glasses-story: 3개 → 7개**(유효 0→2). 남은 5개는 **rule3** 실패(메인 `안경힌지 관리`/`코패드 원인` 등이 제목에 원형 분리됨) — rule2와 무관한 별개 생성 품질 이슈. rule3는 SEO 핵심이라 유지. 안경이야기 "명사+관리/원인/방법" 키워드형의 제목 원형 보존은 생성 단계 튜닝 대상(미해결).
- `tsc --noEmit` 0 에러.

### 제목 폴리시 rule3 복구 — 분리된 메인 키워드를 원형으로 자연 복구 (#10)

**버그:** 안경이야기 등에서 메인 키워드가 제목에 분리돼(`안경힌지가...관리`) rule3 탈락. 원인은 두 가지 불일치 — (1) Opus 제목 폴리시 채택 게이트가 "메인 토큰이 흩어져 있어도 통과"(route.ts, 기존 `mainTokens.every(t=>next.includes(t))`)라 분리 제목을 막지 못함. (2) 검증(`validateKeywordOption`)이 폴리시(route.ts ~3006)보다 먼저(~2542) 계산돼, 폴리시가 제목을 고쳐도 `isValid`가 옛 값으로 남음.

**변경사항 (하드코딩/템플릿 없이 모델 기반 복구):**
- `lib/prompts/titlePrompt.ts buildTitlePolishPrompt`: "main 두 단어를 띄어쓰기 그대로 붙여서(인접) 넣고, 분리돼 있으면 자연스럽게 붙도록 다시 쓰되 비문 금지" 지시 추가.
- `app/api/keywords/route.ts` 폴리시 채택부: 게이트를 `next.includes(item.mainKeyword)`(원형 인접 포함)으로 강화 + 제목 교체 시 `validateKeywordOption` **재계산**.

**검증 (라이브 재실행):**
- **glasses-story**: 제목이 메인 키워드 원형 포함으로 복구("안경관리 중성세제가...", "안경세척 초음파를...", "안경김서림 세척 뒤에도..."). 유효 비율 2/7 → **3/4**. 하드코딩 아닌 자연·다양한 문장. (남은 무효 1개는 서브에 금칙어 "예방" — 정상 검증)
- **contacts: 10/10 유효 유지**(회귀 없음).
- `tsc --noEmit` 0 에러.

**남은 이슈(별개, 미해결):** glasses-story 총 개수가 4~7개로 불안정·낮음(목표 10). 제품 카탈로그 없는 카테고리라 후보 풀이 작은 생성 단계 볼륨 문제. 하드코딩 폴백은 사용자가 명시적으로 거부 → 비하드코딩 볼륨 개선(생성 라운드/카테고리-핏 필터 완화)은 별도 검토 필요.

### GPT 수렴 깨기 — avoidKeywords로 좁은 카테고리 볼륨 개선 (#11)

**진단(단계별 깔때기 로그):** glasses-story 개수 부족은 카테고리/매장 로직이 아니라 **GPT 생성 수렴**이 원인. top50jn 안경이야기에서 GPT가 매 라운드 거의 같은 후보(원시 8개)를 뱉어 dedup에 전멸 → 풀이 4개에서 안 늘고 조기 종료(`pool.length===before` break). 반면 jinysgongju는 GPT가 다양하게 나와 풀 20 → **10/10**(즉 카테고리는 정상, 매장별 GPT 출력 다양성 차이).

**변경사항 (하드코딩/dedup완화 없이 다양성 유도):**
- `lib/ai/openaiKeywords.ts`: `avoidKeywords` 인자 + `[이미 만든 키워드 — 절대 겹치지 말 것]` 섹션. GPT에 누적 후보를 알려 새 소재로만 생성하게 유도.
- `app/api/keywords/route.ts` GPT 풀 루프: 매 라운드 현재 풀의 메인 키워드를 `avoidKeywords`로 전달 → 라운드 간 수렴 차단.

**검증 (top50jn glasses-story 재실행):** GPT 정상 동작 시 4개→**10/10**(수렴 해소). 제목 다양·자연(학생 안경수리·안경나사 관리·안경힌지 관리·안경케이스 관리·코패드 관리 등, 반복 아님).

**남은 변동성(별개 인프라):** Codex CLI가 가끔 원시 0개 반환(aiSeed 0, 빠른 102초 실행) → Claude 폴백으로 8개(유효 6) 산출(이전 2~3개보다 개선). 키워드 로직 무관한 Codex 간헐 실패라 하드코딩으로 메우지 않음.

### 다른 매장 검증 (jinysgongju)
- glasses-story·contacts 모두 **10/10 유효**. #7~#11 수정이 두 번째 매장에서 그대로 동작 확인.

### GPT 생성 안정화 — 정체 허용 + 시간 예산 (#12)

**진단(Codex 직접 측정):** "Codex가 0개 반환"은 **현재 재현 안 됨**(~40회 호출 FAIL 0건, 각 46~53초/4개 정상 반환). 과거 aiSeed 0은 일시적 transient였음. 실제 변동 원인은 좁은 카테고리(top50jn 안경이야기)에서 GPT 풀이 라운드별로 정체→조기 break하던 것. (`KEYWORD_FAST_MODE` 기본 ON이지만 생성 개수와 무관 — 외부신호 enrichment TOP_K만 제어.)

**변경사항 (route.ts GPT 풀 루프, 하드코딩 없음):**
- **정체 허용(STALL_LIMIT=2)**: 1라운드 정체로 즉시 멈추지 않고 연속 2회까지 더 시도. 갱신된 `avoidKeywords` 제외목록으로 새 후보를 낼 기회 부여.
- **시간 예산(POOL_TIME_BUDGET_MS=200s)**: 추가 라운드가 maxDuration(360s)을 잠식하지 않도록 생성 단계를 200초로 제한(이후 분석·폴리시·외부신호 ~140s 확보).
- `openaiKeywords.ts` Codex 타임아웃 90→120s(정상 46~53초라 여유, 가끔 느릴 때 흡수).

**검증 (top50jn glasses-story 반복):**
- 시간: 3회 모두 **360초 이내**(283/146/137초). 직전 stall-only 수정에서 370초로 maxDuration 초과하던 회귀 제거.
- 개수: 10/7/8(유효 10/5/6). 원본 2~4개 대비 개선·안정. 단 좁은 카테고리 특성상 항상 10 보장은 불가(GPT가 distinct 소재를 다 못 낼 때 7~8). jinysgongju는 10/10 — 카테고리 자체는 정상, top50jn의 소재 다양성 한계.
- `tsc --noEmit` 0 에러. 임시 진단 전부 제거.

**결론:** "Codex 0 반환"은 인프라 일시 현상으로 현재 미발생. 생성 단계를 정체-허용+시간예산으로 안정화해 안전하게(타임아웃 없이) 더 채우도록 개선. 항상 10개는 하드코딩 없이는 불가(사용자 거부 방침 유지).

---

## v1.6 (2026-05-22)

### 키워드 맥락 조사 강화 + 채팅 기반 재수정

**버그:** 생성 본문이 키워드의 실제 업계 의미와 어긋남 (예: "기능성렌즈"를 코팅 기능으로, "멀티포컬"을 다초점 안경렌즈로 서술).

**근본 원인:**
- `cb4cb18`(5/7)에서 `RESEARCH_TIMEOUT_MS` 45s → 12s로 축소 → Perplexity sonar가 12초 초과 시 조사 자료가 빈 값으로 폴백 → Claude가 일반 지식만으로 작성하며 일반 통념(멀티포컬=다초점안경 등)을 반영 (회귀)
- `researchKeyword(keyword.mainKeyword)` — 메인 키워드 문자열만 검색. 서브 키워드 2개·카테고리 맥락 미전달
- 후속 질문 5개를 응답으로 받기만 하고 재검색하지 않음 (얕은 단발 검색)
- 의미 정합성 검증·사후 채팅 교정 수단 부재

**변경사항:**
- `lib/ai/perplexity.ts`: `researchKeyword` 시그니처 변경 (`ResearchParams` 객체). 메인+서브2+카테고리+용어집 힌트를 1차 동시 검색 → 후속 질문 5개 전부 병렬 재검색해 자료 보강. `{ text, result, status }` 반환 (status="empty"는 조사 실패)
- `data/opticalGlossary.json` + `lib/domain/opticalGlossary.ts` 신규: 안경원 모호 용어 사전(멀티포컬=콘택트렌즈, 기능성렌즈=눈피로감소 안경렌즈). 사용자가 항목 추가 가능. zod 검증, 공백무시 부분일치
- `lib/prompts/articlePrompt.ts`·`promoPrompt.ts`: `[키워드 정확한 의미]` 블록 주입 (`glossaryHint`)
- `app/api/article/route.ts`: 조사 타임아웃 12s→40s, 경쟁분석 12s→25s. 용어집 조회 후 조사·프롬프트에 주입. `researchStatus` 본문에 전달
- `lib/prompts/chatRevisionPrompt.ts` + `app/api/article/chat/route.ts` 신규: 멀티턴 채팅 지시 기반 재수정 (키워드 원형·매장 안내·쉼표금지 보존)
- `components/ArticleChat.tsx` 신규 + `ArticlePreview.tsx` 통합: 본문 미리보기에 채팅 패널, 조사 실패 시 경고 배지
- `app/page.tsx`: `handleArticleChat` + `isChatting` 상태
- `types/index.ts`: `ChatMessage`, `ArticleContent.researchStatus`·`revisionChat` 추가

**검증:** `tsc --noEmit` 0 에러, `eslint` 통과, `pnpm build` 성공(`/api/article/chat` 컴파일 확인), 용어집 매칭 로직 단위 확인(멀티포컬·기능성렌즈 정상 매칭, 무관 키워드 빈 배열).

**설계 문서:** `docs/designs/v1.6-research-context-and-chat-revision.md`

### 성능: 키워드/본문 생성 시간 초과 완화 (병렬화)

**버그:** 키워드/제목 추출·본문 생성이 너무 오래 걸리고 가끔 시간 초과.

**원인:** 독립적인 외부 호출들이 직렬로 실행되며 지연이 합산됨.
- 본문(`api/article`): 조사→RSS→경쟁분석이 직렬. v1.6에서 조사 타임아웃을 40s로 올려 최악 ~340s로 maxDuration 300s 초과 위험 증가
- 키워드(`api/keywords`): 상단 데이터 수집 4건(RSS·세션·경쟁제목·검색량) 직렬 + 후보별 외부신호 조회가 직렬 for 루프

**변경사항 (결과물 동일, 속도만 개선):**
- `api/article/route.ts`: 조사+RSS+경쟁분석을 `Promise.all` 동시 실행. maxDuration 300→360
- `api/keywords/route.ts`: RSS+세션(순차 유지)·경쟁제목·검색량을 `Promise.all` 동시 실행. 후보별 외부신호 조회 for 루프를 `Promise.all`로 병렬화
- 각 작업의 try/catch 폴백은 그대로 보존 (한 신호가 실패해도 나머지로 계속 진행)

**보류:** 키워드 생성의 AI CLI 호출 횟수 축소(Codex+Claude 최대 4회 직렬)는 품질 영향이 있어 별도 논의 예정.

**검증:** `tsc --noEmit` 0 에러, `eslint` 통과, `pnpm build` 성공.

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
