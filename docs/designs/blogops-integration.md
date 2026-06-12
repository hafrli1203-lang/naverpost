# BlogOps(blogoperator) 연동 v1.0 — 1단계: 글 기록

## 목적
naverpost가 생성·확정한 글을 성과 측정 SaaS(BlogOps, :8001 FastAPI)에 자동 등록해
피드백 루프(생성→측정→가중치 조정)의 기록 반쪽을 만든다.

## 트리거 조건
- POST /api/sessions (워크플로 완료 후 사용자가 세션 저장) 성공 직후.

## 동작
1. `BLOGOPS_API_URL` 미설정 시 아무것도 하지 않음 (연동 OFF가 기본).
2. shopName → data/shops.json에서 blogId 해석 → BlogOps GET /clients의 blog_url과 매칭해
   client_id 해석 (5분 인메모리 캐시).
3. POST /posts { client_id, title, category, main_keyword, sub_keywords }.
   BlogOps 쪽은 (client_id, title) 멱등 — 재저장 시 같은 행 갱신.

## 실패 복구
- BlogOps 다운/매칭 실패/타임아웃(4s) → 세션 저장은 정상 응답, 응답 data.blogops에
  { registered: false, reason } 표면화. 절대 세션 저장을 막지 않는다 (graceful).

## 상태 경계
- 소유 상태: 없음 (클라이언트 캐시는 인메모리 5분).
- 공유 인터페이스: `registerPostToBlogOps(params)` — src/lib/blogops/client.ts.
- BlogOps 쪽 선행 구현: POST /posts (blogoperator repo, 완료) + 6개 매장 clients 등록(완료).

## 아웃풋 정의
- BlogOps posts 테이블에 글 1행 (제목/카테고리/메인·서브 키워드, 메트릭 0).
- 이후 단계: 사용자가 발행 후 URL·발행일 입력(또는 2단계 노출 추적이 자동 갱신),
  월간 지표는 BlogOps 화면에서 입력 → 3단계에서 naverpost가 읽어 가중치 조정.
