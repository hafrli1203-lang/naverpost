# BlogOps 연동 v1.1 — 2단계: 키워드 노출 추적

## 목적
등록된 글의 메인 키워드로 네이버 블로그 검색을 돌려 "내 블로그가 몇 위에 노출되는지"를
측정하고 BlogOps exposure-runs에 시계열로 적재한다. 사용자 가설("헤드 볼륨 높은
롱테일이 전환이 높다") 검증과 3단계 가중치 역주입의 원천 데이터.

## 트리거 조건
- 수동: POST /api/blogops/exposure { shopId? } — shopId 없으면 6개 매장 전체.
- (이후) 주간 스케줄로 승격 가능. 측정 자체는 멱등이라 반복 호출 안전.

## 동작
1. BLOGOPS_API_URL 미설정 시 즉시 OFF 응답.
2. 매장별: BlogOps GET /posts에서 해당 client의 글 목록 → 메인 키워드 수집
   (최근 20개, 중복 제거).
3. 키워드마다 네이버 블로그 검색(공식 OpenAPI, display=30) →
   결과의 link/bloggerlink에 blog.naver.com/{blogId} 매칭 → 순위(1-base) 또는 null.
4. POST /exposure-runs { client_id, ran_at, entries:[{keyword, my_rank}] }.
   BlogOps가 클라이언트당 최근 12회 보관(자체 정책).

## 호출량/속도
- 키워드당 검색 1회, 매장당 ≤20회, 6매장 전체 ≤120회/실행 (일 한도 25,000 대비 무시 가능).
- 키워드 간 150ms 지연. 매장당 ~4초, 전체 ~25초.

## 실패 복구
- 키워드 1개 검색 실패 → 해당 키워드 my_rank=null로 계속.
- BlogOps 기록 실패/매장 미매핑 → 해당 매장 결과에 reason 표면화, 다른 매장은 계속.
- 등록된 글이 없는 매장 → entries 없이 스킵(기록 안 함).

## 상태 경계
- 소유 상태: 없음 (모든 저장은 BlogOps 쪽).
- 공유 인터페이스: `trackExposureForShops(shopIds?)` — src/lib/blogops/exposure.ts.
- searchSignals.fetchBlogSearch를 display 파라미터와 함께 export로 승격(기존 호출 영향 없음).

## 아웃풋 정의
- BlogOps exposure_runs 행: { client_id, ran_at(ISO), entries }.
- API 응답: 매장별 { shopId, clientId, measured(키워드 수), ranked(순위 잡힌 수), reason? }.
