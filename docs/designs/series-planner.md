# 시리즈 발행 플래너 (설계)

## 목적
헤드 키워드(예: "누진렌즈")의 **주제 권위(C-Rank 맥락 축)** 를 누적하기 위해, 같은 헤드
키워드를 **자기잠식 없이 여러 각도로** 다루는 N편 시리즈 주제를 자동 제안한다. 단발 글
대신 한 주제를 시리즈로 쌓으면 네이버가 해당 블로그를 그 주제의 전문 블로그로 인식한다.

## 트리거 조건
- 수동. `POST /api/topics/series` `{ shopId, categoryId, headKeyword?, count? }`
- headKeyword 생략 시 카테고리 대표 헤드(productKeywordCatalog/BROAD_KEYWORD_HEADS)에서 자동 선택.
- count 기본 5, 최대 8.

## 실패 복구
- BlogOps 미설정/다운: 자기잠식 가드(노출 1~3위 제외) 없이 진행(graceful). 외부 의존 실패가
  시리즈 생성을 막지 않는다.
- 템플릿/조합 부족으로 count 미달 시: 가능한 만큼 반환하고 `notes`에 사유 표면화(무음 절단 금지).
- 잘못된 categoryId: 400.

## 상태 경계
- **읽기 전용. 신규 상태 없음.**
- 재사용: `topicPlanner.planBlogTopics`(축 순환 — problem/comparison/verification/lifestyle/visit/product),
  `blogops/insights.getTopExposedKeywordKeys`(자기잠식 가드), `keywords/productKeywordCatalog`(헤드/수식어),
  `naver/rssParser`(기존 제목 중복 회피, best-effort).
- 키워드 생성 캐시·세션 저장·검증 모듈은 건드리지 않는다.

## 아웃풋 정의
```ts
type SeriesPlanItem = {
  order: number;            // 1..N 발행 순서
  axis: TopicIntentAxis;    // problem/comparison/verification/lifestyle/visit/product
  topic: string;            // 글 주제(논지 축)
  thesis: string;           // 한 줄 논지
  titleAngle: string;       // 제목 각도 힌트
  modifiers: string[];      // 본문 소재 수식어
};
type SeriesPlan = {
  shopId: string;
  shopName: string;
  categoryId: string;
  categoryName: string;
  headKeyword: string;
  items: SeriesPlanItem[];
  excludedByCannibalization: string[]; // 노출 1~3위라 시리즈에서 뺀 키워드(정규화 키)
  notes: string[];
};
```
- API 응답: `{ success: true, data: SeriesPlan }`. UI(admin)에서 순서대로 카드 표시, 각 항목을
  키워드 생성/본문 작성의 topic 입력으로 이어쓸 수 있게 한다(후속, 본 설계 범위는 제안까지).
