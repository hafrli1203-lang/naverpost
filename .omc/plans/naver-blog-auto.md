# Implementation Plan: Naver Blog Auto-Writer (Optical Shop)

**Plan ID:** naver-blog-auto-2026-03-14
**Status:** REVISED (Critic Round 1) - Awaiting Confirmation
**Complexity:** HIGH (4-phase progressive deployment, 5 external API integrations, ~39 files)

---

## 1. RALPLAN-DR Summary

### Principles (5)

1. **Progressive Delivery**: Build and validate one pipeline stage at a time (Phase 0 -> 1 -> 2 -> 3 -> 4). Each phase must be independently usable before proceeding.
2. **Human-in-the-Loop First**: Every AI-generated output requires explicit user approval before advancing. Never auto-advance pipeline stages.
3. **Validation as Core Logic**: Prohibited word filtering, keyword rules, and content validation are first-class concerns, not afterthoughts. Build validation before building generation.
4. **Draft-Only Safety**: The system must NEVER publish to Naver Blog. All API calls use draft/temporary save mode. This constraint must be enforced at the API layer with no UI bypass.
5. **Portability**: `pnpm install && pnpm dev` must work on any PC. All configuration via `.env.local`, no hardcoded secrets, no OS-specific dependencies.

### Decision Drivers (Top 3)

1. **Content Quality**: Claude Opus 4.6 for writing, multi-stage validation (prohibited words + repetition + auto-revision), Perplexity for research -- quality is the primary differentiator.
2. **Legal Compliance**: Korean advertising law and medical law require strict prohibited word filtering (100+ words). Failure means legal risk for the 6 optical shops.
3. **Operator Simplicity**: Single-user web dashboard, no auth needed, minimal clicks per blog post. The operator manages 6 shops sequentially.

### Viable Options

#### Option A: Monolithic Next.js App (RECOMMENDED)

All 4 stages in a single Next.js application with API routes and React UI.

| Pros | Cons |
|------|------|
| Single deployment, single codebase | All stages coupled in one process |
| Shared state management via React context | Longer initial load if app grows |
| Simpler for single operator | Harder to scale to multiple operators |
| pnpm dev starts everything | API routes share Node.js process |

#### Option B: Separate Backend + Frontend

Express/Fastify backend API + Next.js frontend (SPA mode).

| Pros | Cons |
|------|------|
| Clean API/UI separation | Two processes to manage |
| Backend reusable for future desktop app | More complex local setup |
| Independent scaling | Over-engineered for single-user tool |
| Easier to add WebSocket for progress | Double the configuration |

**Decision:** Option A. This is a single-operator tool. Monolithic Next.js with API routes provides the simplest developer experience and meets the portability requirement (`pnpm dev` starts everything). Future Electron/Tauri migration is equally viable from either option.

**Invalidation rationale for Option B:** The requirement explicitly states single-user web dashboard. No concurrent users, no scaling needs. The added complexity of managing two processes directly contradicts the portability principle. Electron/Tauri wrapping works identically with a monolithic Next.js app.

---

## 2. Implementation Plan

---

### Phase 0: Project Setup & Foundation

**Goal:** Bootstrapped Next.js 15 project with all dependencies, types, configuration, shared utilities, and base UI layout ready for Phase 1.

#### Step 0.1: Initialize Next.js Project

**Files to create:**
- `package.json` (via `pnpm create next-app`)
- `tsconfig.json` (auto-generated, verify strict mode)
- `next.config.ts`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `.env.local.example` (template for API keys)
- `.gitignore`

**Actions:**
```
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**Dependencies to install:**
```
pnpm add @anthropic-ai/sdk           # Claude API
pnpm add openai                       # Perplexity API (OpenAI-compatible)
pnpm add @google/generative-ai        # Google AI Studio (image gen)
pnpm add rss-parser                   # RSS feed parsing
pnpm add googleapis                   # Google Sheets API
pnpm add zod                          # Runtime validation
pnpm add lucide-react                 # Icons
```

**shadcn/ui setup:**
```
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card select input textarea badge tabs progress alert dialog separator label radio-group toast
```

**Acceptance Criteria:**
- `pnpm dev` starts successfully on http://localhost:3000
- TypeScript strict mode enabled
- shadcn/ui components available
- `.env.local.example` documents all required API keys

#### Step 0.2: Environment Configuration

**File:** `src/env.ts`
```
Create a Zod-validated environment schema for:
- ANTHROPIC_API_KEY
- PERPLEXITY_API_KEY
- GOOGLE_AI_API_KEY
- NAVER_CLIENT_ID
- NAVER_CLIENT_SECRET
- NAVER_BLOG_TOKENS_JSON (JSON string mapping blogId -> { accessToken, refreshToken, expiresAt })
- GOOGLE_SHEETS_ID (optional)
```

**File:** `.env.local.example`
```
Document every env var with comments in Korean explaining where to obtain each key.
Include NAVER_BLOG_TOKENS_JSON example structure with all 6 blog IDs.
```

**Acceptance Criteria:**
- Server startup fails with clear error if required env vars missing
- `.env.local.example` is self-documenting
- NAVER_BLOG_TOKENS_JSON validates as proper JSON with required fields per blog

#### Step 0.3: Type Definitions

**File:** `src/types/index.ts`

Define all core types based on the spec ontology:

```typescript
// Shop (6 optical stores)
interface Shop {
  id: string;            // e.g., "top50jn"
  name: string;          // display name
  blogId: string;        // Naver blog ID
  rssUrl: string;        // https://rss.blog.naver.com/{id}.xml
}

// Category (6 categories)
interface Category {
  id: string;
  name: string;          // e.g., "안경테"
  subcategories: string[]; // e.g., ["소재", "디자인", "선택", "관리", "특징"]
}

// KeywordOption (3 options generated per request)
interface KeywordOption {
  title: string;           // 15-30 chars
  mainKeyword: string;     // 2-word combination
  subKeyword1: string;     // shares first word with main
  subKeyword2: string;     // shares first word with main
}

// KeywordGenerationResult
interface KeywordGenerationResult {
  results: KeywordOption[];  // always 3
  forbiddenList: string[];   // target shop's existing titles
  referenceList: string[];   // other shops' titles
}

// ValidationResult
// NOTE: Use `needsRevision` (not `isValid`) to match the validation domain semantics.
// needsRevision = true when any prohibited words, caution phrases, or overused words are found.
interface ValidationResult {
  needsRevision: boolean;
  prohibitedWords: string[];    // found prohibited words
  cautionPhrases: string[];     // found caution phrases
  overusedWords: { word: string; count: number }[];  // 20+ repetitions
  revisionReasons: string[];
}

// ArticleContent
interface ArticleContent {
  title: string;
  content: string;         // ~2000 chars
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  shopName: string;
  validation: ValidationResult;
}

// BlogImage
// Images stored server-side in temp directory via imageStore.ts, NOT in React state.
// imageUrl points to /api/image/file/{id} which serves from temp storage.
interface BlogImage {
  index: number;
  imageId: string;        // unique ID for temp file lookup
  imageUrl: string;       // URL to serve image from temp storage (e.g., /api/image/file/{imageId})
  prompt: string;
  section: string;
  status: 'pending' | 'generating' | 'success' | 'failed' | 'retrying';
}

// WorkflowState (tracks pipeline progress)
// Persisted to localStorage via usePersistedWorkflow hook for session recovery.
interface WorkflowState {
  sessionId: string;       // unique per workflow run, used for temp file cleanup
  currentStage: 1 | 2 | 3 | 4;
  shop: Shop | null;
  category: Category | null;
  topic: string;
  selectedKeyword: KeywordOption | null;
  article: ArticleContent | null;
  images: BlogImage[];     // imageUrl references, NOT base64 blobs
  naverDraftSaved: boolean;
}
```

**Acceptance Criteria:**
- All types compile without errors
- Types cover every entity from the spec ontology
- Exported and importable from any file via `@/types`

#### Step 0.4: Constants & Static Data

**File:** `src/lib/constants.ts`

```typescript
// 6 shops with blog IDs
export const SHOPS: Shop[] = [
  { id: 'top50jn', name: '매장1', blogId: 'top50jn', rssUrl: 'https://rss.blog.naver.com/top50jn.xml' },
  { id: 'jinysgongju', name: '매장2', blogId: 'jinysgongju', rssUrl: 'https://rss.blog.naver.com/jinysgongju.xml' },
  { id: 'attractiger', name: '매장3', blogId: 'attractiger', rssUrl: 'https://rss.blog.naver.com/attractiger.xml' },
  { id: 'leesi7007', name: '매장4', blogId: 'leesi7007', rssUrl: 'https://rss.blog.naver.com/leesi7007.xml' },
  { id: 'kl1854', name: '매장5', blogId: 'kl1854', rssUrl: 'https://rss.blog.naver.com/kl1854.xml' },
  { id: 'peace9486', name: '매장6', blogId: 'peace9486', rssUrl: 'https://rss.blog.naver.com/peace9486.xml' },
];

// 6 categories with subcategories (from spec lines 139-156)
export const CATEGORIES: Category[] = [
  { id: 'frames', name: '안경테', subcategories: ['소재', '디자인', '선택', '관리', '특징'] },
  { id: 'lenses', name: '안경렌즈', subcategories: ['종류', '코팅', '굴절률', '기능', '선택'] },
  { id: 'contacts', name: '콘택트렌즈', subcategories: ['종류', '관리', '착용', '문제', '선택'] },
  { id: 'eye-info', name: '눈정보', subcategories: ['시력', '눈건강', '검사', '생활', '연령'] },
  { id: 'progressive', name: '누진다초점', subcategories: ['적응', '피팅', '종류', '선택', '대상'] },
  { id: 'glasses-story', name: '안경이야기', subcategories: ['관리', '문제해결', '수리', '서비스', '생활', '상황'] },
];
```

**File:** `src/lib/validation/prohibitedWords.ts`

```
Contains the full 100+ prohibited words list from spec (lines 352-359):
- prohibitedWords array: 시술, 치료, 무절개, 최소절개, 무통증, 임플란트, 질환, 질병, 의료, 예방, 내원, 의사, 의료기기, 병원, 수술, 성형, 의약품, 완치, 확실, 가장, 제일, 최신의, 최고의, 최상의, 최소한, 부작용없이, 안전한, 보장, 정확, 치료경험담, 시술후기, 추천, 선정의료기관, 전문가, 최고, 최초, 최대, 최상, 강추, 1등, 정답, 100%, 0%, 할인, 무료, 공짜, 대박, 최저가, 상담
- cautionPhrases array: 치료 효과, 100% 효과, 의학적으로 입증, 부작용 없는, 만병통치, 즉시효과
- wordReplacements map (from spec lines 426-445):
  가장/최고/최상/제일 -> 돋보이는/우수한/뛰어난/인기 있는
  최초/유일 -> 차별화된/특별한
  완벽/확실/정확 -> 꼼꼼한/세심한/정밀한/만족스러운
  보장/약속 -> 기대할 수 있는/도움이 될 수 있는
  전문가 -> 경험 많은 안경사/숙련된 안경사
  추천 -> 안내/소개/제안
  상담 -> 문의/방문/확인/이야기
  효과/효능 -> 도움/변화/장점
  치료/시술 -> 관리/케어/서비스
  안전한 -> 편안한/부담 없는
  무료/공짜 -> 추가 비용 없이/서비스로 제공
  최저가 -> 합리적인 가격/부담 없는 가격
  할인 -> 혜택/특별 가격
  강추/대박 -> 만족도 높은/호평받는
```

**Acceptance Criteria:**
- All 100+ prohibited words from spec are included
- All replacement mappings from spec lines 426-445 are included
- Constants importable and type-safe

#### Step 0.5: Base Layout & Dashboard Shell

**File:** `src/app/layout.tsx`
- Root layout with Korean font support, Tailwind, shadcn/ui Toaster

**File:** `src/app/page.tsx`
- Dashboard main page with:
  - WorkflowStepper component (shows stages 1-4)
  - Content area that renders current stage component
  - Uses React state (useState/useReducer) to manage WorkflowState

**File:** `src/components/WorkflowStepper.tsx`
- Horizontal stepper showing 4 stages with icons
- Active/completed/pending states
- Stage labels: "키워드 생성", "본문 작성", "이미지 생성", "임시저장"

**File:** `src/components/ShopSelector.tsx`
- Dropdown for shop selection (6 shops)
- Dropdown for category selection (6 categories)
- Text input for topic/subject
- "시작" (Start) button

**Acceptance Criteria:**
- Dashboard renders with stepper and shop selector
- Shop/category/topic selection works
- Stage navigation structure in place (even if stages 1-4 are placeholder)

#### Step 0.6: Naver OAuth2 Token Manager

**File:** `src/lib/naver/tokenManager.ts`

```typescript
// Manages Naver OAuth2 token lifecycle for all 6 blogs.
// Tokens stored in NAVER_BLOG_TOKENS_JSON env var (JSON string).

interface BlogToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // Unix timestamp in ms
}

// On startup: validate all 6 tokens, warn about expired ones
function validateTokensOnStartup(): { blogId: string; status: 'valid' | 'expired' | 'missing' }[]

// Before any Naver API call: check expiry with 5-min buffer
function getValidToken(blogId: string): Promise<string>
// If expired: attempt refresh via Naver OAuth2 refresh endpoint
// POST https://nid.naver.com/oauth2.0/token?grant_type=refresh_token&...
// On refresh success: update in-memory token cache
// On refresh failure: throw clear error with instructions to re-authenticate

// Graceful 401 handling: if API returns 401, attempt one token refresh, then retry
function withTokenRetry<T>(blogId: string, apiCall: (token: string) => Promise<T>): Promise<T>
```

**Acceptance Criteria:**
- Token validation runs at server startup, logs status per blog
- Expired tokens are auto-refreshed before API calls
- 401 responses trigger one refresh+retry cycle
- Clear error messages guide user to re-authenticate when refresh fails
- Token cache is in-memory (no file writes for secrets)

#### Step 0.7: Server-Side Image Storage

**File:** `src/lib/storage/imageStore.ts`

```typescript
// Stores generated images in OS temp directory, NOT in React state or base64 strings.
// Prevents 10-20MB of base64 data from living in browser memory.

import { tmpdir } from 'os';
import { join } from 'path';

const IMAGE_DIR = join(tmpdir(), 'naverpost-images');

// Save base64 image data to temp file, return unique imageId
function saveImage(base64Data: string, sessionId: string): Promise<{ imageId: string; filePath: string }>

// Read image file by imageId
function getImage(imageId: string): Promise<Buffer | null>

// Delete all images for a session (cleanup on workflow reset)
function cleanupSession(sessionId: string): Promise<void>

// Cleanup images older than 24 hours (call on server startup)
function cleanupStale(): Promise<void>
```

**File:** `src/app/api/image/file/[imageId]/route.ts`

```typescript
// GET /api/image/file/{imageId}
// Serves stored images from temp directory
// Returns image/png with proper headers
// 404 if imageId not found
```

**Acceptance Criteria:**
- Images saved to OS temp directory, not held in memory
- imageId is URL-safe and unique
- Session cleanup removes all images for that session
- Stale cleanup runs on startup (removes files > 24 hours old)
- File serving route returns proper content-type headers
- 404 for missing images

#### Step 0.8: SSE (Server-Sent Events) Helper

**File:** `src/lib/utils/sse.ts`

```typescript
// Server-Sent Events helper for streaming long-running operations.
// Used by image generation (Phase 3) to avoid 45-65 second timeout risk.

// Server-side: create SSE response stream
function createSSEStream(): { stream: ReadableStream; send: (event: string, data: any) => void; close: () => void }

// Event types for image generation:
// - 'progress': { index: number, total: number, status: 'generating' }
// - 'image-ready': { index: number, imageId: string, imageUrl: string }
// - 'image-failed': { index: number, error: string }
// - 'complete': { successCount: number, failCount: number }
// - 'error': { message: string }

// Client-side: hook for consuming SSE streams
// Returns: { data, error, isConnected }
function useSSEStream<T>(url: string, options?: { onEvent?: (event: string, data: T) => void }): SSEHookResult
```

**Acceptance Criteria:**
- SSE stream creates valid text/event-stream response
- Events are properly formatted (data: JSON\n\n)
- Client hook handles connection, reconnection, and cleanup
- Works with Next.js API routes (App Router)

#### Step 0.9: Persisted Workflow State Hook

**File:** `src/hooks/usePersistedWorkflow.ts`

```typescript
// Custom hook that wraps useReducer with localStorage persistence.
// Enables session recovery if the browser tab is accidentally closed.

function usePersistedWorkflow(): {
  state: WorkflowState;
  dispatch: (action: WorkflowAction) => void;
  resetWorkflow: () => void;  // clears state + calls imageStore cleanup
  hasRecoverableSession: boolean;  // true if localStorage has a previous session
  recoverSession: () => void;
  discardSession: () => void;
}

// On mount: check localStorage for existing session
// If found: prompt user "이전 작업을 이어서 진행하시겠습니까?" (Resume previous work?)
// On state change: debounced save to localStorage (300ms)
// On reset: clear localStorage + call /api/image/cleanup/{sessionId}
// Excludes: large data fields are NOT stored in localStorage (images store only metadata, not data)
```

**Acceptance Criteria:**
- Workflow state persists across page refreshes
- Recovery prompt shown when previous session exists
- Debounced writes prevent performance issues
- Reset cleans up both localStorage and server-side temp files
- Only metadata stored (imageUrl references, not image data)

---

### Phase 1: Title/Keyword Generation + Selection UI

**Goal:** User selects shop + category + topic, system fetches RSS from all 6 blogs, separates forbidden/reference lists, Claude generates 3 keyword options with 7-rule validation, user selects 1. (6 files)

#### Step 1.1: RSS Feed Parser

**File:** `src/lib/naver/rssParser.ts`

**Logic (from spec lines 31-88):**
1. Take all 6 blog IDs and the target shop ID
2. For each blog, fetch RSS from `https://rss.blog.naver.com/{blogId}.xml`
3. Parse XML, extract all `<title>` elements using regex: `/<title><!\[CDATA\[(.*?)\]\]><\/title>/g`
4. If blogId === targetShop -> add titles to `forbiddenList` (these titles must NOT be duplicated)
5. If blogId !== targetShop -> add titles to `referenceList` (these titles should avoid same perspective)
6. Return `{ forbiddenList: string[], referenceList: string[] }`

**Important:** Use `rss-parser` npm package for robust parsing, but also handle CDATA extraction as fallback per the spec's regex pattern.

**Acceptance Criteria:**
- Fetches RSS from all 6 blogs in parallel
- Correctly separates forbidden (target) vs reference (others) lists
- Handles network errors gracefully (skip failed feeds, continue)
- Returns deduplicated title lists

#### Step 1.2: Keyword Validation Rules

**File:** `src/lib/validation/keywordRules.ts`

Implement the 7 keyword validation rules from spec (lines 173-265):

```typescript
function validateKeywordOption(option: KeywordOption, forbiddenList: string[], referenceList: string[]): ValidationResult

Rules:
1. All keywords must be exactly 2-word combinations (no 3+ words)
2. Main keyword's first word must appear in both sub keywords
3. Main keyword must appear verbatim in the title (원형 그대로)
4. Both sub keywords' meanings must be clearly reflected in the title
5. Title length must be 15-30 characters
6. Title must not overlap with forbiddenList subjects
7. Title must not share the same perspective as referenceList titles
```

Also implement the title structure rules:
- Title must start with main keyword
- No vague meanings, no keyword-listing style
- Allowed endings: ~알아보기 / ~정리 / ~안내 / ~확인하기 / ~방법 / ~이유
- Forbidden: exclamations, slang, rankings, recommendations, comparisons, superlatives

**Acceptance Criteria:**
- Each rule returns pass/fail with specific reason
- All 7 rules from spec implemented
- Title pattern validation (length, starting word, forbidden endings)
- Returns structured ValidationResult

#### Step 1.3: Title Generation Prompt

**File:** `src/lib/prompts/titlePrompt.ts`

Build the Claude prompt template from spec (lines 107-302). This is a large, precise prompt that must be reproduced exactly:

```typescript
function buildTitleGenerationPrompt(params: {
  targetStore: string;
  category: string;
  forbiddenList: string[];
  referenceList: string[];
}): string
```

The prompt includes:
- Role: "안경원 브랜드 블로그의 수석 에디터"
- Target store and category info
- Forbidden list (target shop's existing titles)
- Reference list (other shops' titles)
- Category-specific topic ranges (6 categories, each with 5-6 subcategories)
- 6-shop deduplication rules (4 rules)
- Keyword writing rules (2-word combinations, first-word sharing)
- Title-keyword alignment rules (mandatory, pass/fail)
- Fixed writing order: main keyword -> sub1 -> sub2 -> title
- Title structure patterns (A, B, C)
- Title writing rules (start with main keyword, 15-30 chars, forbidden expressions)
- Failure criteria (4 conditions for immediate rewrite)
- Final verification checklist (4 ALL-YES conditions)
- Output format: JSON only, raw JSON (no markdown code blocks)

**Critical:** The prompt must request `response_format` as JSON and specify the exact output schema:
```json
{
  "results": [
    { "title": "", "main_keyword": "", "sub_keyword_1": "", "sub_keyword_2": "" },
    { "title": "", "main_keyword": "", "sub_keyword_1": "", "sub_keyword_2": "" },
    { "title": "", "main_keyword": "", "sub_keyword_1": "", "sub_keyword_2": "" }
  ]
}
```

**Acceptance Criteria:**
- Prompt template matches spec exactly (lines 107-302)
- All category subcategories included
- All deduplication rules included
- JSON output format enforced

#### Step 1.4: Claude API Client

**File:** `src/lib/ai/claude.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

// Initialize with ANTHROPIC_API_KEY from env
// Model: claude-opus-4-6-20250219 (or latest opus)

async function generateKeywords(prompt: string): Promise<KeywordOption[]>
- Call Claude API with the title generation prompt
- Parse JSON response (handle potential markdown wrapping)
- Validate response structure matches expected schema
- Return 3 KeywordOption objects

async function writeArticle(prompt: string): Promise<string>
- (Used in Phase 2)

async function reviseArticle(prompt: string): Promise<string>
- (Used in Phase 2)
```

**Acceptance Criteria:**
- Claude API client initializes correctly
- JSON response parsing handles edge cases (markdown wrapping, malformed JSON)
- Returns typed KeywordOption array
- Error handling with meaningful messages

#### Step 1.5: Keywords API Route

**File:** `src/app/api/keywords/route.ts`

```typescript
POST /api/keywords
Body: { shopId: string, categoryId: string, topic?: string }

Flow:
1. Validate input with Zod
2. Fetch RSS from all 6 blogs (rssParser.ts)
3. Separate forbidden/reference lists
4. Build title generation prompt (titlePrompt.ts)
5. Call Claude API (claude.ts)
6. Parse 3 keyword options
7. Validate each option against 7 rules (keywordRules.ts)
8. If any option fails validation, retry Claude once with failure feedback
9. Return { results: KeywordOption[], forbiddenList, referenceList }
```

**Acceptance Criteria:**
- Returns 3 validated keyword options
- RSS deduplication works across 6 blogs
- Validation failures trigger one retry
- Proper error responses (400 for bad input, 500 for API failures)

#### Step 1.6: Keyword Selection UI

**File:** `src/components/KeywordOptions.tsx`

Display 3 keyword options as cards:
- Each card shows: title, main keyword, sub keyword 1, sub keyword 2
- Radio button or click to select one option
- Validation status badges (pass/fail per rule)
- "선택" (Select) button to confirm and advance to Stage 2
- "다시 생성" (Regenerate) button to request new options

**Integration with `src/app/page.tsx`:**
- After shop/category/topic selected and "시작" clicked -> show loading -> show 3 options
- User selects 1 -> WorkflowState updates -> advance to Stage 2

**Acceptance Criteria:**
- 3 keyword option cards render correctly
- Validation results visible per option
- Selection persists in workflow state
- Regenerate triggers new API call
- Loading state shown during generation

---

### Phase 2: Article Writing + Validation + Preview UI

**Goal:** Selected keyword feeds into Perplexity research -> Claude writes ~2000 char article -> auto-validate prohibited words + repetition -> Claude revises -> user previews and approves.

#### Step 2.1: Perplexity API Client

**File:** `src/lib/ai/perplexity.ts`

```typescript
// Perplexity uses OpenAI-compatible API
// Model: "sonar" (from spec line 319)
// Endpoint: https://api.perplexity.ai

async function researchKeyword(keyword: string): Promise<string>

Prompt (from spec lines 319-321):
"키워드: {keyword} 에 대해 조사하고 블로그 질문 5개 뽑아줘

요구사항:
1. 위 키워드와 직접적으로 관련된 핵심 정보, 개념, 트렌드를 요약해 주세요.
2. 블로그 독자가 궁금해할 만한 검색용 질문 5개를 생성해 주세요.
3. 각 질문은 실제로 검색에 사용할 수 있도록 구체적이고 명확한 문장으로 작성해 주세요.
4. 질문은 서로 중복되지 않도록 다양한 관점(개념, 방법, 사례, 장단점, 최신 동향 등)을 반영해 주세요.
5. 가능하다면 신뢰할 수 있는 출처 유형(블로그, 리서치, 공식 문서 등)을 함께 고려해 주세요.

출력 형식:
- [자료 요약]
- [후속 검색 질문 5개 목록]"
```

**Acceptance Criteria:**
- Perplexity API call succeeds with sonar model
- Returns research summary + 5 follow-up questions
- Error handling for API failures

#### Step 2.2: Article Writing Prompt

**File:** `src/lib/prompts/articlePrompt.ts`

Build the Claude article writing prompt from spec (lines 501-603):

```typescript
function buildArticlePrompt(params: {
  topic: string;
  title: string;
  shopName: string;
  mainKeyword: string;
  subKeywords: string;
  perplexityResearch: string;
}): string
```

The prompt includes the full writing guide from spec:
- Role: "대학병원 검안팀 출신 이웃집 전문 안경사"
- Input fields: topic, title, shop name, main keyword, sub keywords
- Writing guidelines:
  1. Target ~2000 chars with 3-4 subheadings
  2. Subheading style: noun-form or plain descriptive (NOT question-form)
  3. Paragraph breaks every 3-4 lines for mobile readability
  4. Tone: body uses conversational "~해요/~하거든요/~한답니다", headers use professional tone
  5. NO commas allowed -- use conjunctions and connecting endings instead
  6. Translate technical optical terms with everyday analogies
  7. 3-stage expert explanation: Principle -> Translation -> Benefit
  8. 1-2 markdown tables at natural comparison/summary points
  9. Bold key terms
  10. Prohibited words/expressions from the full list
  11. No emojis, no numbered lists
- Output format: Title, Introduction, Body (4 subheadings), Conclusion, Shop info

**Acceptance Criteria:**
- Prompt template matches spec writing formula exactly
- All writing rules embedded in prompt
- Perplexity research data injected as context
- All prohibited expressions listed in prompt

#### Step 2.3: Content Validation Engine

**File:** `src/lib/validation/contentValidator.ts`

```typescript
function validateContent(content: string): ValidationResult

Checks (from spec lines 352-411):
1. Prohibited words scan: Check content against 100+ prohibited words list
2. Caution phrases scan: Check against caution phrases list
3. Repetition check: Find any Korean word (2+ chars) repeated 20+ times
4. Return: { needsRevision, prohibitedWords[], cautionPhrases[], overusedWords[], revisionReasons[] }
```

**File:** `src/lib/validation/repetitionCheck.ts`

```typescript
function findOverusedWords(text: string): { word: string; count: number }[]

Logic (from spec lines 368-383):
1. Extract all Korean words using regex /[가-힣]+/g
2. Count occurrences of each word (length >= 2 chars)
3. Return words with count >= 20
```

**Acceptance Criteria:**
- Finds all prohibited words in content
- Repetition detection works for Korean text
- Returns actionable revision reasons
- `needsRevision` is true when any prohibitedWords, cautionPhrases, or overusedWords are found

#### Step 2.4: Article Revision Prompt

**File:** `src/lib/prompts/revisionPrompt.ts`

Build the revision prompt from spec (lines 416-457):

```typescript
function buildRevisionPrompt(params: {
  content: string;
  revisionReasons: string;
}): string
```

Includes:
- Role: "광고법을 준수하는 블로그 에디터"
- Detected problems list
- Full prohibited word -> replacement word mapping table (from spec lines 426-445)
- Revision rules:
  1. Replace prohibited words naturally using the mapping table
  2. Distribute words repeated 20+ times with synonyms (e.g., 안경 -> 아이웨어, 렌즈, 착용)
  3. Maintain ~2000 char length
  4. Maintain natural sentence flow
  5. Replace numbered lists with flowing prose

**Acceptance Criteria:**
- Revision prompt includes full replacement mapping table
- All 5 revision rules embedded
- Original content included for reference

#### Step 2.5: Article API Route

**File:** `src/app/api/article/route.ts`

```typescript
POST /api/article
Body: { keyword: KeywordOption, shopId: string, categoryId: string, topic: string }

Flow:
1. Validate input
2. Call Perplexity research (perplexity.ts) with main keyword
3. Build article prompt with research data (articlePrompt.ts)
4. Call Claude API to write article (claude.ts)
5. Validate content (contentValidator.ts)
6. If validation fails (prohibited words or repetition found):
   a. Build revision prompt with specific problems (revisionPrompt.ts)
   b. Call Claude API to revise (claude.ts)
   c. Re-validate revised content
7. Return { article: ArticleContent, validation: ValidationResult }
```

**File:** `src/app/api/article/validate/route.ts`

```typescript
POST /api/article/validate
Body: { content: string }

Standalone validation endpoint for manual re-checks.
Returns ValidationResult.
```

**Acceptance Criteria:**
- Perplexity research integrated into article generation
- Auto-validation runs after initial generation
- Auto-revision triggered on validation failure
- Re-validation after revision
- Both auto and manual validation endpoints work

#### Step 2.6: Article Preview UI

**File:** `src/components/ArticlePreview.tsx`

- Full article preview with formatted content (markdown rendering)
- Validation status panel:
  - Green checkmarks for passed checks
  - Red warnings for any remaining prohibited words
  - Yellow warnings for high-repetition words
  - Character count display (target ~2000)
- Action buttons:
  - "승인" (Approve) -> advance to Stage 3
  - "재작성" (Rewrite) -> trigger new article generation
  - "수동 수정" (Manual Edit) -> inline textarea editing with live validation

**Acceptance Criteria:**
- Article renders with proper formatting (bold, tables, subheadings)
- Validation results clearly displayed
- Character count visible
- All 3 actions (approve, rewrite, manual edit) functional
- Manual edits trigger live re-validation

---

### Phase 3: Image Generation + Confirm UI

**Goal:** Generate blog images using Google AI Studio API based on article content, user confirms or regenerates individual images.

#### Step 3.1: Google AI Studio Image Client

**File:** `src/lib/ai/imageGen.ts`

```typescript
// Uses Google Generative AI REST API directly
// Model: gemini-3-pro-image-preview (from spec line 1393, or latest available)
// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/...

async function generateBlogImage(prompt: string, apiKey: string): Promise<string | null>

Logic (from spec lines 1392-1427):
1. POST to Google AI Studio with prompt
2. Request responseModalities: ['IMAGE']
3. Set imageConfig: { aspectRatio: '4:3' }
4. Extract base64 image data from response.candidates[0].content.parts[].inlineData.data
5. Return base64 string or null on failure
```

**Acceptance Criteria:**
- Successfully calls Google AI Studio image generation API
- Returns base64 image data
- Handles API errors and rate limits
- Returns null (not throw) on individual image failure

#### Step 3.2: Image Prompt Generator

**File:** `src/lib/prompts/imagePrompt.ts`

```typescript
function buildImagePromptsFromArticle(article: string, sections: string[]): string

Uses the prompt engineering system from spec (lines 1188-1251):
- Role: "안경원 전문 상업 사진 포토그래퍼이자 프롬프트 엔지니어"
- Analyzes article sections/subheadings
- Auto-detects current season for clothing/lighting
- Generates 10 image prompts: 5 portrait + 5 informational
- All subjects must be "Korean"
- "no text, no letters, no words" for informational images
- Output format: structured prompt list
```

**Decision: Use Claude for image prompt generation.**

Rationale: Claude is already integrated as the primary AI client. Using Claude for prompt generation provides (1) better prompt quality for the optical shop domain, (2) one fewer API dependency and billing surface, (3) consistent prompt engineering style across the pipeline. Google AI Studio is used ONLY for the actual image rendering. The cost difference is negligible (10 short prompt generation calls per session vs. the much larger article writing calls already using Claude).

**Acceptance Criteria:**
- Generates 10 structured image prompts from article content
- Season auto-detection works
- Korean ethnicity specified in all portrait prompts
- "no text" specified in informational prompts

#### Step 3.3: Image API Route (SSE Streaming)

**File:** `src/app/api/image/route.ts`

```typescript
GET /api/image/generate?article={encoded}&sessionId={id}
Response: text/event-stream (SSE)

Flow:
1. Generate 10 image prompts from article content using Claude (imagePrompt.ts)
2. Stream results via SSE as each image completes:
   - For each of 10 images (sequential, 1.5s delay between calls):
     a. Send SSE event: { type: 'progress', index, total: 10, status: 'generating' }
     b. Call Google AI Studio (imageGen.ts)
     c. On success: save to temp storage (imageStore.ts), send SSE event:
        { type: 'image-ready', index, imageId, imageUrl: '/api/image/file/{imageId}' }
     d. On failure: send SSE event: { type: 'image-failed', index, error }
        - If fewer than 7 successes after all 10 attempts, auto-retry failed images once
        - Send retrying events: { type: 'retrying', index, attempt: 2 }
3. Send final SSE event: { type: 'complete', successCount, failCount, retryResults }
4. Close stream

Retry mechanism:
- After initial 10 attempts, count successes
- If successCount < 7: auto-retry all failed images once (max 1 retry per image)
- If still < 7 after retry: report to user with option to retry remaining manually
```

**File:** `src/app/api/image/regenerate/route.ts`

```typescript
POST /api/image/regenerate
Body: { prompt: string, index: number, sessionId: string }

Regenerate a single image:
1. Call Google AI Studio with prompt
2. Save to temp storage via imageStore.ts
3. Return { imageId, imageUrl }
```

**Acceptance Criteria:**
- SSE stream delivers progressive results (no 45-65 second timeout risk)
- Each image result is sent as soon as it completes
- Failed images trigger automatic retry if fewer than 7/10 succeed
- Individual regeneration works (non-streaming, single POST)
- Images stored server-side via imageStore.ts, URLs returned to client
- Stream properly closes on completion or client disconnect

#### Step 3.4: Image Preview UI (SSE Consumer)

**File:** `src/components/ImagePreview.tsx`

Consumes SSE stream from `/api/image/generate` via `useSSEStream` hook. Renders images progressively as they arrive.

Grid display of generated images:
- 2-3 column responsive grid
- **Progressive rendering:** Each card starts as "generating..." placeholder, updates to image when SSE `image-ready` event arrives
- Each image card shows:
  - Image preview via `imageUrl` (served from temp storage) or generating/error placeholder
  - Image number and section label
  - Prompt excerpt
  - Status badge: generating / success / failed / retrying
  - Action buttons: "재생성" (Regenerate), "수정" (Edit prompt), "저장" (Download)
- **Live progress:** "3/10 생성 완료" counter updates on each SSE event
- Progress bar fills incrementally (not just spinner)
- Retry status: shows "자동 재시도 중..." when auto-retry is happening for failed images
- Success/fail counter with final summary
- Prompt edit modal for modifying individual image prompts
- "전체 승인" (Approve All) button to advance to Stage 4 (enabled only when stream complete)

**Acceptance Criteria:**
- Images render progressively as SSE events arrive (not all-at-once)
- Progress counter and bar update in real-time
- Failed images show error state with retry option
- Auto-retry events update card status to "retrying"
- Individual image regeneration works (POST, not SSE)
- Prompt editing modal works
- Download individual images works (from imageUrl)
- Approve advances to Stage 4 only after stream completes

---

### Phase 4: Naver API Integration + Draft Save

**Goal:** Save approved title + article + images as a DRAFT (NOT published) to the selected Naver blog using Naver OpenAPI.

#### Step 4.0: Research Gate -- Naver Image Upload Strategy

**BLOCKING PREREQUISITE:** Before implementing Phase 4, the executor MUST research and document how Naver `writePost.json` handles images. This is a research gate -- do not proceed with implementation until this is resolved.

**Research questions:**
1. Does `writePost.json` accept inline base64 images in the HTML `content` field?
2. Does it accept `<img src="data:image/png;base64,...">` tags?
3. Does it require images to be hosted at public URLs (`<img src="https://...">`)?
4. Is there a separate Naver image upload API (e.g., `uploadImage.json`)?
5. What is the maximum content size for `writePost.json`?

**Output:** Document findings in a code comment block at the top of `blogApi.ts`. Based on findings, implement one of:
- **Strategy A (inline base64):** Embed base64 directly in HTML content `<img>` tags
- **Strategy B (hosted URLs):** Upload images to a separate endpoint first, get URLs, embed `<img src="url">`
- **Strategy C (Naver upload API):** Use Naver's dedicated image upload API if available, get hosted URLs
- **Fallback:** If Naver rejects all image approaches, save text-only draft with images available for manual insertion via the image download feature in Step 3.4

#### Step 4.1: Naver Blog API Client

**File:** `src/lib/naver/blogApi.ts`

```typescript
// Naver Blog Write API
// POST https://openapi.naver.com/blog/writePost.json
// Auth: X-Naver-Client-Id + X-Naver-Client-Secret + Authorization: Bearer {access_token}

// Uses tokenManager.ts for token lifecycle management
import { withTokenRetry, getValidToken } from './tokenManager';

async function saveDraft(params: {
  title: string;
  content: string;      // HTML formatted
  blogId: string;
  categoryNo?: string;  // from listCategory.json
}): Promise<{ success: boolean; postId?: string; error?: string }>

// Implementation wraps API call with withTokenRetry for automatic 401 handling:
// withTokenRetry(blogId, async (token) => {
//   // POST to writePost.json with Authorization: Bearer {token}
// })

CRITICAL CONSTRAINT:
- The API call must use the parameter that saves as DRAFT, NOT published
- Verify the writePost.json API parameter for draft mode
- Add explicit safeguard: if any "publish" parameter exists, force it to draft/temporary
- On 401: tokenManager handles refresh+retry automatically

async function getCategories(blogId: string): Promise<Category[]>
- GET https://openapi.naver.com/blog/listCategory.json
- Also wrapped with withTokenRetry
- Returns Naver's blog category list for category mapping
```

**Acceptance Criteria:**
- Draft save works (NOT publish)
- Explicit draft-only safeguard in code
- Content formatted as HTML for Naver blog
- Token lifecycle managed via tokenManager (no raw token handling in this file)
- 401 responses trigger automatic token refresh + retry
- Expired tokens detected before API call (fail-fast with clear error)
- Error handling for auth failures, API limits
- Returns post ID on success

#### Step 4.2: Content Formatter

**File:** `src/lib/naver/contentFormatter.ts`

```typescript
import { getImage } from '@/lib/storage/imageStore';

function formatForNaver(params: {
  article: ArticleContent;
  images: BlogImage[];
}): Promise<string>

Converts markdown article + images into Naver Blog HTML format:
- Markdown headings -> HTML h2/h3 tags
- Bold text -> <b> tags
- Tables -> HTML tables
- Image insertion strategy (determined by Step 4.0 research gate):
  - Reads image data from temp files via imageStore.getImage(imageId)
  - Converts to appropriate format based on research findings (base64 inline, hosted URL, etc.)
  - Places images at section boundaries (after each subheading section)
  - 5 portrait images: after introduction and between body sections
  - 5 informational images: paired with their relevant sections
- Line breaks preserved for mobile readability
- No emojis or special characters
```

**Acceptance Criteria:**
- Valid HTML output for Naver Blog
- Images read from temp storage (not from React state)
- Image placement follows section structure (not random)
- Formatting preserves readability
- No markdown artifacts in output
- Handles missing images gracefully (skips with warning)

#### Step 4.3: Publish (Draft Save) API Route

**File:** `src/app/api/publish/route.ts`

```typescript
POST /api/publish
Body: { shopId: string, article: ArticleContent, images: BlogImage[] }

Flow:
1. Validate all required data present
2. Format content as HTML (contentFormatter.ts)
3. Get Naver access token for selected shop from env
4. Call Naver Blog writePost.json as DRAFT (blogApi.ts)
5. Return { success: boolean, postId: string }

SAFETY CHECK: Log a warning if any publish-related parameter is detected.
Add a "DRAFT_ONLY" constant check before every API call.
```

**Acceptance Criteria:**
- Saves as draft ONLY (never publish)
- Returns success/failure with post ID
- Content properly formatted for Naver
- Auth tokens correctly mapped per shop

#### Step 4.4: Final Confirmation UI

**File:** `src/components/FinalConfirm.tsx`

- Summary view showing:
  - Selected shop and category
  - Title and keywords
  - Article preview (collapsed)
  - Image thumbnails (collapsed)
- "임시저장" (Save Draft) button with confirmation dialog
- After save: success message with Naver blog link
- "처음으로" (Start Over) button to reset workflow

**Acceptance Criteria:**
- Full summary displayed before save
- Confirmation dialog prevents accidental saves
- Success/failure feedback shown
- Workflow reset works cleanly

---

## 3. Requirements Summary

| # | Requirement | Phase | Priority |
|---|-------------|-------|----------|
| R1 | Web dashboard with shop/category/topic input | 0 | P0 |
| R2 | RSS feed parsing from 6 blogs | 1 | P0 |
| R3 | Forbidden/reference list auto-generation | 1 | P0 |
| R4 | Claude API: 3 keyword options with 7-rule validation | 1 | P0 |
| R5 | User selects 1 of 3 keyword options | 1 | P0 |
| R6 | Perplexity API keyword research | 2 | P0 |
| R7 | Claude API ~2000 char article writing | 2 | P0 |
| R8 | 100+ prohibited word filtering | 2 | P0 |
| R9 | Repetition check (20+ occurrences) | 2 | P0 |
| R10 | Auto-revision on validation failure | 2 | P0 |
| R11 | Article preview + approve/rewrite UI | 2 | P0 |
| R12 | Google AI Studio image generation | 3 | P0 |
| R13 | Image confirm + regenerate UI | 3 | P0 |
| R14 | Naver OpenAPI draft save (NOT publish) | 4 | P0 |
| R15 | Workflow stepper progress display | 0 | P1 |
| R16 | Portable: pnpm install -> pnpm dev | 0 | P0 |
| R17 | Google Sheets API input (optional) | Future | P2 |

---

## 4. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Naver API auth tokens expire | Stage 4 fails | HIGH | `tokenManager.ts` handles full OAuth2 lifecycle: startup validation, pre-call expiry check with 5-min buffer, auto-refresh via `grant_type=refresh_token`, 401 retry with `withTokenRetry()`. Clear error messages guide re-authentication. |
| Image generation timeout (45-65s batch) | Stage 3 fails | HIGH | SSE streaming via `sse.ts` -- each image streams as it completes. No single HTTP response waits for all 10. Client renders progressively. |
| Image memory bloat (10-20MB base64 in state) | Browser crash/OOM | HIGH | `imageStore.ts` stores images server-side in temp directory. React state holds only `imageUrl` references. 24-hour stale cleanup on startup. |
| Fewer than 7/10 images succeed | Stage 3 degraded | MEDIUM | Auto-retry mechanism: after initial 10 attempts, if <7 succeed, retry all failed images once. SSE reports retry status. Manual retry available for remaining failures. |
| Claude API produces malformed JSON | Stage 1 fails | MEDIUM | Robust JSON parsing with fallback: strip markdown code fences, attempt `JSON.parse`, regex extraction of JSON object. Retry Claude once on parse failure with explicit "respond with raw JSON only" instruction. |
| RSS feeds unavailable or malformed | Stage 1 degraded | LOW | Graceful fallback: skip failed feeds, continue with available data. Log warnings. Minimum: if target shop RSS fails, block (cannot build forbidden list); if other shops fail, proceed with partial reference list. |
| Prohibited word list incomplete | Legal risk | LOW | `prohibitedWords.ts` is a standalone config file, easily editable. Structure supports runtime additions via future admin UI. |
| Google AI Studio rate limits | Stage 3 slow | MEDIUM | Sequential generation with 1.5s delay between calls. SSE streaming means user sees progress despite slow generation. Individual regeneration for failed images. |
| Naver API accidentally publishes | Legal/trust risk | LOW | Triple safeguard: (1) `DRAFT_ONLY` constant check before every API call, (2) `writePost.json` parameter forced to draft mode, (3) confirmation dialog in UI. Code review flag on any publish-related parameter. |
| Naver image upload strategy unknown | Stage 4 blocked | MEDIUM | Research gate (Step 4.0) blocks implementation until strategy is documented. Fallback: text-only draft with downloadable images for manual insertion. |
| Content exceeds/falls short of 2000 chars | Quality issue | MEDIUM | Char count target embedded in prompt. Post-generation validation displays count (1800-2200 acceptable range). User can manually edit with live char counter. |
| Browser tab closed mid-workflow | Lost work | MEDIUM | `usePersistedWorkflow` hook saves state to localStorage (debounced 300ms). On reload, prompts to resume. Server-side images persist in temp storage. |
| Korean text encoding issues | Display bugs | LOW | Ensure UTF-8 throughout. All API responses use `Content-Type: application/json; charset=utf-8`. Test with Korean content in all components. |

---

## 5. Verification Steps

Each phase has concrete verification:

### Phase 0 Verification
- [ ] `pnpm dev` starts without errors
- [ ] Dashboard page loads at localhost:3000
- [ ] Shop selector shows 6 shops
- [ ] Category selector shows 6 categories
- [ ] WorkflowStepper renders 4 stages
- [ ] TypeScript compilation passes (`pnpm type-check`)
- [ ] Token manager logs validation status for all 6 blogs on startup
- [ ] Image store temp directory created on first use, stale cleanup runs on startup
- [ ] SSE helper creates valid text/event-stream response (unit test)
- [ ] usePersistedWorkflow saves/restores state from localStorage
- [ ] Recovery prompt appears when previous session exists in localStorage

### Phase 1 Verification
- [ ] `POST /api/keywords` with valid shop/category returns 3 keyword options
- [ ] Each option has title (15-30 chars), main keyword (2 words), sub1, sub2
- [ ] Sub keywords share first word with main keyword
- [ ] Main keyword appears in title
- [ ] Forbidden list contains only target shop's titles
- [ ] Reference list contains other shops' titles
- [ ] UI displays 3 cards with validation badges
- [ ] Selection persists and advances to Stage 2

### Phase 2 Verification
- [ ] Perplexity returns research summary for given keyword
- [ ] Article is approximately 2000 chars (1800-2200 range)
- [ ] Article uses conversational tone (~해요 style)
- [ ] No commas in article text
- [ ] No emojis in article text
- [ ] No numbered lists in article text
- [ ] Prohibited word scan catches test prohibited words
- [ ] Repetition check detects words used 20+ times
- [ ] Auto-revision replaces detected prohibited words
- [ ] Article preview renders markdown correctly
- [ ] Approve/rewrite/manual-edit all functional

### Phase 3 Verification
- [ ] SSE stream delivers progressive image results (not batch)
- [ ] Images saved to temp directory via imageStore.ts (not held in memory)
- [ ] `/api/image/file/{imageId}` serves stored images with correct content-type
- [ ] At least 7/10 images generate successfully
- [ ] Auto-retry triggers when fewer than 7/10 succeed (retry failed images once)
- [ ] ImagePreview.tsx renders images progressively as SSE events arrive
- [ ] Progress counter updates in real-time ("3/10 생성 완료")
- [ ] Individual regeneration works (POST to /api/image/regenerate)
- [ ] Prompt editing and re-generation works
- [ ] Image download produces valid PNG file (from imageUrl)
- [ ] Images display in responsive grid
- [ ] Stream closes properly on completion and client disconnect

### Phase 4 Verification
- [ ] Step 4.0 research gate completed: Naver image upload strategy documented in blogApi.ts
- [ ] Token manager provides valid token for selected blog (or clear refresh error)
- [ ] Expired token triggers auto-refresh before API call
- [ ] 401 response triggers one token refresh + retry cycle
- [ ] Naver API call uses draft/temporary save parameter
- [ ] Content is valid HTML (no raw markdown)
- [ ] Images embedded in HTML content (using strategy from research gate)
- [ ] If image embedding fails, text-only draft saved with warning to user
- [ ] Draft save returns success with post ID
- [ ] Saved draft visible in Naver blog admin (as draft, NOT published)
- [ ] Workflow resets cleanly after completion (clears localStorage + temp images)

---

## 6. Acceptance Criteria (Final)

The system is complete when ALL of the following are true:

1. **End-to-end workflow**: User can go from shop selection -> keyword selection -> article approval -> image approval -> Naver draft save in a single session
2. **Content quality**: Generated articles follow the spec writing formula (conversational tone, 3-stage explanation, no commas, no emojis, ~2000 chars)
3. **Legal compliance**: Zero prohibited words in final output (auto-filtered and auto-revised)
4. **Deduplication**: Titles do not overlap with existing titles on the target shop's blog
5. **Draft-only safety**: System NEVER publishes -- all Naver API calls use draft mode
6. **Portability**: Clone repo, create `.env.local`, run `pnpm install && pnpm dev` on any PC
7. **6-shop support**: All 6 blog IDs (top50jn, jinysgongju, attractiger, leesi7007, kl1854, peace9486) are selectable and functional
8. **6-category support**: All 6 categories with correct subcategory ranges
9. **User control**: Every AI-generated output has human approval before advancing
10. **Image generation**: At least 7/10 images generate successfully per session, with auto-retry for failed images (retry once if <7 succeed, then manual retry available)
11. **Image streaming**: Image generation uses SSE -- user sees images appear progressively, no timeout risk
12. **Token lifecycle**: Naver OAuth2 tokens validated on startup, auto-refreshed on expiry, 401 responses handled with retry. Clear error when refresh fails.
13. **Session recovery**: Workflow state persisted to localStorage. Browser refresh or accidental tab close does not lose progress. User prompted to resume on return.
14. **No memory bloat**: Images stored server-side in temp directory, not in browser state. Stale files cleaned up after 24 hours.

---

## ADR: Architecture Decision Record

**Decision:** Monolithic Next.js 15 App Router with API Routes

**Drivers:**
1. Single-operator tool requiring minimal setup complexity
2. Portability requirement (single `pnpm dev` command)
3. Progressive deployment (phases can be added incrementally)

**Alternatives Considered:**
- Separate Express backend + Next.js frontend (rejected: over-engineered for single-user, two processes violates portability)
- Electron app from start (rejected: spec says web first, desktop later)

**Why Chosen:** Minimal complexity, meets all requirements, easiest progressive deployment, straightforward Electron/Tauri migration path later.

**Consequences:**
- All API logic runs in Next.js API routes (Node.js process)
- SSE streaming adopted for image generation to avoid API route timeouts (45-65s for 10 images)
- Images stored server-side in temp directory to prevent browser memory bloat (10-20MB base64 in state)
- Naver OAuth2 token lifecycle fully managed (startup validation, auto-refresh, 401 retry)
- Claude used for both article writing AND image prompt generation (single AI provider for text, Google AI Studio for rendering only)
- Workflow state persisted to localStorage for session recovery

**Follow-ups:**
- Validate SSE behavior under Next.js production builds (Vercel edge vs Node.js runtime)
- Monitor temp directory disk usage if many sessions run without cleanup
- Research Naver image upload strategy (Step 4.0 research gate) before Phase 4 implementation
- Consider adding Google Sheets integration for batch input (future phase)

---

## File Inventory (All files to create)

### Phase 0 (15 files)
1. `src/types/index.ts` - All TypeScript type definitions
2. `src/env.ts` - Zod-validated environment configuration
3. `src/lib/constants.ts` - Shops, categories, static data
4. `src/lib/validation/prohibitedWords.ts` - 100+ prohibited words + replacements
5. `src/app/layout.tsx` - Root layout (modify generated)
6. `src/app/page.tsx` - Dashboard main page
7. `src/components/WorkflowStepper.tsx` - 4-stage stepper
8. `src/components/ShopSelector.tsx` - Shop/category/topic selector
9. `.env.local.example` - Environment template
10. `next.config.ts` - Next.js config (modify generated)
11. `tailwind.config.ts` - Tailwind config (modify generated)
12. `src/lib/naver/tokenManager.ts` - Naver OAuth2 token lifecycle management
13. `src/lib/storage/imageStore.ts` - Server-side temp image storage
14. `src/lib/utils/sse.ts` - SSE streaming helper (server + client)
15. `src/hooks/usePersistedWorkflow.ts` - localStorage workflow persistence hook

### Phase 1 (6 files)
16. `src/lib/naver/rssParser.ts` - RSS feed parsing
17. `src/lib/validation/keywordRules.ts` - 7 keyword validation rules
18. `src/lib/prompts/titlePrompt.ts` - Title generation prompt template
19. `src/lib/ai/claude.ts` - Claude API client
20. `src/app/api/keywords/route.ts` - Keywords API endpoint
21. `src/components/KeywordOptions.tsx` - 3-option selection UI

### Phase 2 (8 files)
22. `src/lib/ai/perplexity.ts` - Perplexity API client
23. `src/lib/prompts/articlePrompt.ts` - Article writing prompt
24. `src/lib/validation/contentValidator.ts` - Content validation engine
25. `src/lib/validation/repetitionCheck.ts` - Korean word repetition check
26. `src/lib/prompts/revisionPrompt.ts` - Article revision prompt
27. `src/app/api/article/route.ts` - Article generation API endpoint
28. `src/app/api/article/validate/route.ts` - Standalone validation API endpoint
29. `src/components/ArticlePreview.tsx` - Article preview/approve UI

### Phase 3 (5 files)
30. `src/lib/ai/imageGen.ts` - Google AI Studio image client
31. `src/lib/prompts/imagePrompt.ts` - Image prompt generator (Claude-powered)
32. `src/app/api/image/route.ts` - SSE streaming image generation API
33. `src/app/api/image/regenerate/route.ts` - Single image regeneration API
34. `src/app/api/image/file/[imageId]/route.ts` - Temp image file serving
35. `src/components/ImagePreview.tsx` - SSE-consuming image grid/preview UI

### Phase 4 (4 files)
36. `src/lib/naver/blogApi.ts` - Naver Blog API client (DRAFT ONLY, token-managed)
37. `src/lib/naver/contentFormatter.ts` - Markdown + images -> HTML formatter
38. `src/app/api/publish/route.ts` - Draft save API endpoint
39. `src/components/FinalConfirm.tsx` - Final confirmation UI

**Total: 39 source files across 5 phases** (excluding auto-generated config files)
