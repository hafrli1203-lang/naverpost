# BlogOps 연동 v1.2 — 기발행 글 백필 + 운영 자동화

## 목적
6개 매장 RSS의 기발행 글을 BlogOps posts에 일괄 등록해 노출 추적 모수를 즉시 확보한다.
재실행 안전(멱등)해야 하며, 주기 운영(주간 측정)을 사용자가 쉽게 돌릴 수 있어야 한다.

## 트리거 조건
- 수동: POST /api/blogops/backfill { shopId? } — 미지정 시 전체 매장.
- 신규 발행이 쌓이면 재실행해도 안전 (BlogOps가 매장+제목 멱등).

## 동작
1. 매장별 RSS(shops.json rssUrl) 파싱 — CDATA 제목/링크/pubDate.
2. 제목 정규화: "지역 안경점 | 키워드 문장" 형식이면 마지막 '|' 뒤를 본 제목으로.
   main_keyword 추정 = 본 제목의 앞 2단어 (생성기가 키워드 선행 설계라 대부분 정확).
   category = "발행글(RSS)" — BlogOps 화면에서 수정 가능함을 표시.
3. POST /posts (url + published_at 포함).

## 실패 복구
- RSS 실패/매장 미매핑 → 해당 매장 reason 표면화, 나머지 계속.
- 항목 등록 실패 → 건너뛰고 집계에 반영.

## 운영 자동화 (scripts/)
- `start-blogops.bat`: BlogOps API(:8002) 기동 (이미 떠 있으면 안내 후 종료).
- `blogops-weekly.ps1`: API 기동 확인 → 백필 → 노출 측정 → 로그 저장.
  Windows 작업 스케줄러 등록 명령을 스크립트 머리말에 문서화.

## 상태 경계
- 소유 상태: 없음. 공유 인터페이스: `backfillPublishedPosts(shopIds?)` — src/lib/blogops/backfill.ts.
