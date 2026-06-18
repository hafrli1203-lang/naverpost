# PRODUCT.md — naverpost

> 기존 `CLAUDE.md`·`docs/` 기준 정리.

## 무엇인가
- 6개 안경원 네이버 블로그용 **콘텐츠 자동 작성 시스템**. Next.js(App Router) + pnpm.
- 3단계 파이프라인: (1) 제목/키워드 → (2) 본문 작성·검증 → (3) 이미지 생성.
- Human-in-the-loop 웹 대시보드. 단계마다 사람이 확인/선택한다.

## 누구를 위한 것인가
- 안경원 블로그를 운영하는 마케팅 담당자(내부 운영자).

## 핵심 가치
- 광고법/의료법 안전(금지어 100+ 필터), 6개 매장 콘텐츠 중복 방지, SEO·검색 노출 최적화, 사람이 최종 검수하는 안전한 흐름.

## 핵심 화면(앱 라우트)
- 대시보드/운영 화면(`src/app/operations`), 관리(`src/app/admin`), 로그인(`src/app/login`).
- API 라우트(`src/app/api/`): keywords, article, image, sessions, blogops, topics, analysis, document, shops, title-similarity, auth.

## 산출물/자산
- 붙여넣기용 export(서식 유지 복사 + 이미지 일괄 저장). 사람이 네이버에 붙여넣어 **임시저장만**.
- 성과 측정: BlogOps 연동(발행 글 기록 + 키워드 노출 순위 추적).

## 핵심 제약 (반드시 인지)
- 네이버 글쓰기 API(`writePost.json`)는 **2020 종료** → 자동 발행/임시저장 불가. export로 대체.
- 본문 ~2000자, 제목 12~32자, 키워드 2단어 조합. 이모지/번호목록 금지.

## 확인 필요 항목
- `operations`/`admin` 화면의 실제 단계별 UI 흐름과 상태 처리
- auth(로그인) 경로와 세션 처리 방식
- BlogOps/Supabase 연동 데이터 경로

## 비고
고객·매장 자격증명·개인정보 열람 금지.
