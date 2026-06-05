# Stage 1 키워드/제목 생성 — 상위 정보성 글 본문 내용 grounding

## 목적
키워드/제목 생성(Stage 1)이 실제 네이버 상위 노출 정보성 글의 **본문 내용**(소재·구조)을 참고해
현실에 붙는 후보를 만들도록 한다. 기존엔 제목만 보고(이번 턴 추가), 본문 내용은 0이었다.

## 트리거 조건
- `POST /api/keywords` 호출 시 매번. 기존 데이터 수집(RSS·경쟁 제목·검색량)과 **동시 실행**.
- 분석 대상 시드: `effectiveTopic || category.name` 단일 키워드.

## 실패 복구 (graceful)
- `analyzeCompetitorMorphology`는 내부적으로 스크래핑/분석 실패 시 `status:"unavailable"` 반환.
- 추가로 **타임아웃 가드(18s)**: 초과 시 `unavailable` 폴백.
- `unavailable`이면 본문 내용 섹션을 프롬프트에서 생략 → **이번 턴 추가된 "실제 상위 제목" 방향
  참고만으로 정상 동작**(속도 회귀·생성 실패 없음).

## 상태 경계
- 신규 상태 없음. 기존 `analyzeCompetitorMorphology`(읽기 전용 스크래핑) 재사용.
- Stage 2(본문)와 동일 함수를 호출하나 **호출 시점·시드·주입 대상이 독립**(Stage 1은 topic 시드 →
  GPT 키워드 프롬프트, Stage 2는 mainKeyword 시드 → 본문 프롬프트). 공유 상태 충돌 없음.

## 아웃풋 정의
- `CompetitorMorphologyResult`에서 `bodyHighlights`(핵심 각도) · `contentBlocks`(본문 구조) ·
  `titleAngles`(제목 각도) 3개 배열만 추출.
- GPT 키워드 생성 프롬프트(`openaiKeywords.ts`)에 `[실제 상위 정보성 글이 다루는 소재·구조]`
  섹션으로 주입. 프레이밍: "이 소재 영역을 겨냥하되 표현·각도·조합은 차별화."
- 베끼기 방지: 구조화 신호(요약 명사·구절)만 주입하고 원문은 넣지 않음. 광고·지역명·상호명 노이즈는
  형태소 분석 단계에서 이미 제거됨.

## 변경 파일
- `lib/ai/openaiKeywords.ts`: `generateKeywordCandidatesWithGpt`에 `topPostContent` 인자 + 섹션.
- `app/api/keywords/route.ts`: `analyzeCompetitorMorphology` import, Promise.all에 타임아웃 가드로
  병렬 추가, 결과 추출 → `generateGptKeywordCandidatePool` 배선.

## 비범위
- 본문 fetch 한도 상향(현재 3글×1200자)·정보성/홍보성 분류·Stage 2 변경은 이번 범위 아님.
