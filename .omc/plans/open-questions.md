# Open Questions

## naver-blog-auto - 2026-03-14

### Resolved by Revision 1 (Critic Round 1)
- [x] Naver OAuth2 token management -- RESOLVED: `tokenManager.ts` added to Phase 0 with full lifecycle (startup validation, auto-refresh, 401 retry).
- [x] Image prompt model decision -- RESOLVED: Claude chosen for prompt generation (quality, single dependency, negligible cost difference).
- [x] Image memory bloat -- RESOLVED: `imageStore.ts` stores images server-side in temp directory. React state holds only URL references.
- [x] Image generation timeout -- RESOLVED: SSE streaming via `sse.ts`. Progressive delivery, no batch timeout risk.

### Still Open
- [ ] Naver writePost.json draft parameter: What is the exact API parameter name to force draft/temporary save mode? Need to verify against current Naver OpenAPI documentation. -- Critical for the "NEVER publish" safety constraint. (Addressed by Step 4.0 research gate)
- [ ] Naver image upload strategy: Does writePost.json accept inline base64 images, hosted image URLs, or require a separate upload API? -- BLOCKING for Phase 4 implementation. (Step 4.0 research gate must be completed before Phase 4 coding begins)
- [ ] Google AI Studio model availability: Is `gemini-3-pro-image-preview` still the correct model name, or has it been updated? The spec references a specific model version. -- Determines image generation API call parameters.
- [ ] Shop display names: The spec uses "매장1" through "매장6" as placeholders. What are the actual shop names for each blog ID? -- Affects UI display in ShopSelector.
- [ ] Google Sheets integration scope: The spec mentions Google Sheets API for input data but the web dashboard also has direct input. Is Sheets integration needed in Phase 1 or can it be deferred? -- Classified as P2/Future in the plan, confirm this is acceptable.
- [ ] Image count per article: The spec's HTML tool generates 10 images. Is 10 the correct target, or would fewer (e.g., 3-5) be sufficient for blog posts? -- Affects API costs and generation time.
- [ ] Naver blog category mapping: Each of the 6 blogs may have different category IDs in Naver. Do we need to fetch and map categories dynamically per blog, or are category IDs known and static? -- Determines whether Stage 4 needs a category lookup step.
- [ ] SSE runtime compatibility: Does the Next.js production build (especially on Vercel) support long-lived SSE connections from API routes? May need Node.js runtime instead of Edge. -- Affects deployment configuration.
- [ ] Temp directory permissions: Will the OS temp directory be writable in all deployment environments? Local dev is fine, but production hosting may restrict filesystem writes. -- Currently only targeting local use, so LOW risk.
