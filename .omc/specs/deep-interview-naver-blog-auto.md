# Deep Interview Spec: 네이버 블로그 자동 작성 프로그램 (안경원)

## Metadata
- Interview ID: naver-blog-auto-2026-03-14
- Rounds: 7
- Final Ambiguity Score: 15.3%
- Type: brownfield (스펙 문서 존재, 코드 미구현)
- Generated: 2026-03-14
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 35% | 0.315 |
| Constraint Clarity | 0.85 | 25% | 0.213 |
| Success Criteria | 0.80 | 25% | 0.200 |
| Context Clarity | 0.80 | 15% | 0.120 |
| **Total Clarity** | | | **0.847** |
| **Ambiguity** | | | **15.3%** |

## Goal
6개 안경원 네이버 블로그의 자동 콘텐츠 작성 시스템을 구축한다. 기존 n8n 워크플로우를 TypeScript + Next.js 기반 웹 대시보드로 마이그레이션하며, 3단계 파이프라인(제목/키워드 생성 → 본문 작성/검증 → 이미지 생성)을 Human-in-the-loop 방식으로 구현한다. 최종 결과물은 네이버 블로그에 **임시저장**(발행 아님)까지 자동으로 수행한다.

## 기술 스택
- **프론트엔드 + 백엔드**: TypeScript + Next.js (App Router)
- **UI 프레임워크**: Tailwind CSS + shadcn/ui
- **AI 본문 작성**: Claude API (Claude Max 구독 크레딧 활용)
- **AI 리서치**: Perplexity API (Pro 구독)
- **이미지 생성**: Google AI Studio API (나노바나나 Pro)
- **블로그 발행**: Naver OpenAPI (writePost.json - 임시저장)
- **데이터 입력**: Google Sheets API (기존 입력 시트 유지)
- **미래 확장**: Electron/Tauri로 데스크톱 앱 전환 가능

## 3단계 워크플로우 + Human-in-the-loop

### Stage 1: 제목/키워드 생성
- 입력: 매장 선택, 카테고리 선택, 주제 입력 (Google Sheets 또는 웹 UI)
- 처리: 6개 블로그 RSS 피드에서 기존 제목 수집 → 금지/참고 목록 분리 → Claude API로 3개 키워드 옵션 생성
- 검증: 7개 키워드 무결성 규칙 자동 검증
- **사용자 확인**: 3개 옵션 중 선택 → 다음 단계 진행

### Stage 2: 본문 작성 + 검증
- 입력: 선택된 제목/키워드 + 매장 정보
- 처리: Perplexity로 리서치 → Claude로 본문 작성(~2000자) → 금지어 100+ 자동 검사 → 반복어 20회+ 검사 → Claude로 수정
- **사용자 확인**: 본문 미리보기 → 승인 또는 재작성 요청

### Stage 3: 이미지 생성
- 입력: 본문 내용 + 키워드
- 처리: Google AI Studio API로 블로그 이미지 생성
- **사용자 확인**: 이미지 미리보기 → 승인 또는 재생성

### Stage 4: 네이버 연동
- 입력: 승인된 제목 + 본문 + 이미지
- 처리: Naver OpenAPI writePost.json으로 **임시저장** (발행 아님)
- **사용자 확인**: 저장 완료 알림

## Constraints
- 네이버 블로그에 "발행"하지 않음 - 반드시 임시저장만
- 한국어 전용 콘텐츠
- 광고법/의료법 준수 (금지어 100+ 필터링)
- 6개 매장 간 콘텐츠 중복 방지 (RSS 기반 deduplication)
- 본문 ~2000자 (공백 포함)
- 제목 15~30자
- 키워드는 반드시 2단어 조합
- 쉼표 사용 금지, 이모지 사용 금지, 번호 목록 금지
- 웹 대시보드 먼저 개발 → 나중에 데스크톱 앱 전환

## Non-Goals
- 블로그 자동 "발행" (임시저장만 허용)
- n8n 코드 직접 재사용 (로직만 참고)
- 모바일 앱 개발
- 실시간 SEO 순위 추적
- 댓글 자동 관리
- 다국어 지원

## Acceptance Criteria
- [ ] 웹 대시보드에서 매장/카테고리/주제 입력 가능
- [ ] 6개 블로그 RSS 피드 파싱 및 금지/참고 목록 자동 생성
- [ ] Claude API로 3개 제목/키워드 옵션 생성 (7개 규칙 검증 통과)
- [ ] 사용자가 3개 옵션 중 1개 선택 가능
- [ ] Perplexity API로 키워드 리서치 수행
- [ ] Claude API로 ~2000자 본문 작성 (스펙 문서의 글쓰기 공식 적용)
- [ ] 금지어 100+ 자동 필터링 + 반복어 검사 + 자동 수정
- [ ] 사용자 본문 미리보기 및 승인/재작성 UI
- [ ] Google AI Studio API로 이미지 생성
- [ ] 사용자 이미지 확인 및 재생성 UI
- [ ] Naver OpenAPI로 임시저장 (발행 아님)
- [ ] 전체 워크플로우 단계별 진행 상태 표시
- [ ] 다른 PC에서 npm install → npm run dev로 실행 가능

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| n8n JS 코드를 재활용해야 한다 | n8n 코드 재사용이 필수인가? | 필수 아님. 로직만 참고, TypeScript로 새로 구현 |
| 웹 자동화가 API보다 비용 절감 | Claude Max는 API 크레딧 포함인데 왜 웹 자동화? | API 우선. 품질+안정성이 우선 |
| 모든 API 키가 필요하다 | 웹 정액제로 대체 가능? | API 키 사용. Claude Max, Perplexity Pro, Google AI Studio 모두 API 제공 |
| 한 번에 전체 시스템 구현 | 3단계 전체를 한 번에? | 점진적 배포. Stage 1 → 2 → 3 → 4 순서 |
| GUI 형태 결정 | 웹? 데스크톱? CLI? | 웹 대시보드 먼저 → 나중에 Electron/Tauri로 앱 전환 |

## Technical Context

### 기존 스펙 문서
- `네이버 블로그 자동 작성 프로그램 (안경원).md` (1,657줄, 74KB)
- 3단계 워크플로우, 프롬프트 템플릿, 금지어 목록, 키워드 규칙 모두 포함
- n8n JavaScript 코드 샘플 포함 (참고용)

### 6개 블로그 계정
- top50jn, jinysgongju, attractiger, leesi7007, kl1854, peace9486

### 6개 카테고리
- 안경테, 안경렌즈, 콘택트렌즈, 눈정보, 누진다초점, 안경이야기

### API 엔드포인트
- Naver Blog Write: POST `https://openapi.naver.com/blog/writePost.json`
- Naver Blog Categories: GET `https://openapi.naver.com/blog/listCategory.json`
- Claude API: Anthropic SDK
- Perplexity API: REST
- Google AI Studio: REST

### 설치된 Skills (활용 가능)
- `oh-my-claudecode` (멀티 에이전트 오케스트레이션)
- `docs-guide` (문서 가이드)
- `pumasi` (병렬 Codex 실행)
- `~/.claude/skills/` 하위 37개 스킬 폴더 (marketing-skill, engineering, engineering-team 등)

### 추천 Agent Skills (설치 권장)
| Skill | 용도 | 설치 방법 |
|-------|------|----------|
| `AgriciDaniel/claude-blog` | 블로그 글쓰기 13개 스킬 | `curl -fsSL install.sh \| bash` |
| `AgriciDaniel/claude-seo` | SEO 최적화 13개 스킬 | `git clone + install.sh` |
| `firecrawl/firecrawl-cli` | 웹 스크래핑/리서치 | Plugin marketplace |
| `alirezarezvani/claude-skills` marketing pack | 마케팅 콘텐츠 | `/plugin marketplace add` |

## Ontology (Key Entities)
| Entity | Fields | Relationships |
|--------|--------|---------------|
| Shop (매장) | name, blogId, rssUrl, location | has many BlogPosts |
| Category (카테고리) | name, subcategories | has many BlogPosts |
| BlogPost (블로그 글) | title, mainKeyword, subKeyword1, subKeyword2, content, images, status | belongs to Shop, Category |
| KeywordOption (키워드 옵션) | title, mainKeyword, subKeyword1, subKeyword2, validationResult | belongs to BlogPost |
| ForbiddenList (금지목록) | titles[], blogId | belongs to Shop |
| ReferenceList (참고목록) | titles[], blogIds[] | references other Shops |
| ProhibitedWord (금지어) | word, category, replacement | used by Validation |
| ValidationResult (검증 결과) | prohibitedWords[], repetitions[], cautionPhrases[] | belongs to BlogPost |

## Interview Transcript
<details>
<summary>Full Q&A (7 rounds)</summary>

### Round 1
**Q:** 이 프로그램의 기술 스택을 어떻게 구성하고 싶으신가요?
**A:** 각 기술스택의 장단점을 알고 싶습니다. 블로그에 자동으로 글을 작성하고 저장까지만(발행금지). AI를 최대한 잘 쓸수 있는 구조. 다른 컴퓨터에서도 쓸수 있게 프로그램으로 만드는것도 좋습니다.
**Ambiguity:** 47.3%

### Round 2
**Q:** 현재 보유하고 있거나 사용 가능한 API 키가 있나요?
**A:** 네이버 블로그글쓰기 api만 있으면 됩니다. (후에 수정: 모든 API 사용 가능)
**Ambiguity:** 43.5%

### Round 3
**Q:** 이 프로그램이 완성되었다고 판단할 수 있는 기준이 뭐인가요?
**A:** 3단계별 점진적 배포. 제목→선택, 본문→확인, 이미지→확인/재생성, 최종 컨펌→네이버 임시저장.
**Ambiguity:** 32.0%

### Round 4
**Q:** 현재 웹 정액제로 사용 중인 AI 서비스가 뭐뭐 있나요?
**A:** GPT Pro, Perplexity Pro, Claude Max, Gemini Pro 모두 구독 중.
**Ambiguity:** 29.5%

### Round 5 [Contrarian Mode]
**Q:** 정말로 웹 자동화가 필요한가요, 아니면 API 키를 쓰는 게 더 안정적인가요?
**A:** 품질이 잘나오는 것으로. API가 품질이 좋다면 그렇게. 나노바나나는 Google AI Studio API 사용 중.
**Ambiguity:** 24.5%

### Round 6
**Q:** 각 단계에서 사용자가 확인/선택하는 UI는 어떤 형태가 좋으신가요?
**A:** 웹 대시보드를 만들고 나중에 앱을 만들고 싶음.
**Ambiguity:** 20.3%

### Round 7 [Simplifier Mode]
**Q:** 웹 대시보드를 만들 때, 백엔드 언어는 어떤 것이 편하신가요?
**A:** 추천하는 것으로. 유지보수가 좋아야하고 n8n JS 코드 재사용 불필요. 최적의 최고의 성능.
**Ambiguity:** 15.3% ✅ PASSED

</details>
