# RAG-Anything Inspired Reference Ingestion

## 왜 보완했는가

기존 참고자료 업로드는 파일에서 텍스트만 뽑아 한 덩어리 문자열로 프롬프트에 붙였다.

이 방식의 문제:

- 섹션 구조가 사라진다.
- 표와 비교 정보가 평문으로 뭉개진다.
- 핵심 사실과 근거 문장이 분리되지 않는다.
- 긴 자료일수록 모델이 중요 포인트를 놓치기 쉽다.

## 참고한 RAG-Anything 핵심

`RAG-Anything`은 문서를 단순 텍스트가 아니라 멀티모달 문서로 보고, 파싱 이후에 구조화된 retrieval 대상으로 다룬다.

이번 프로젝트에는 전체 프레임워크를 넣지 않고, 아래 4가지만 경량 적용했다.

- 문서 구조 분해
- 표 후보 추출
- 키 팩트 추출
- 원문 스니펫 유지

출처:

- GitHub README: https://github.com/HKUDS/RAG-Anything
- 핵심 설명: multimodal content processing, table/image/equation-aware retrieval, direct content list insertion

## 현재 적용 방식

파일: [referenceFormatter.ts](C:\project\naverpost\src\lib\documents\referenceFormatter.ts)

업로드 파일을 읽은 뒤 다음 형식으로 재구성한다.

- `[문서 메타]`
- `[핵심 요약]`
- `[키 팩트]`
- `[표/비교 후보]`
- `[원문 스니펫]`

파일: [route.ts](C:\project\naverpost\src\app\api\document\upload\route.ts)

API 응답은 이제 단순 `text`만이 아니라 구조화된 요약 텍스트를 반환한다.

## 기대 효과

- 블로그 생성 프롬프트가 업로드 자료의 핵심 비교 포인트를 더 잘 반영
- 상담 기준, 기간, 비용, 구성 같은 명시 정보 누락 감소
- 표 삽입이 필요한 글에서 비교 구조를 더 쉽게 반영
- 긴 문서에서도 초반 핵심 요약과 근거 스니펫이 같이 남아 품질 안정화

## 아직 안 넣은 것

이번 변경은 `RAG-Anything` 전체 도입이 아니다.

아직 제외한 것:

- 이미지/도표 OCR 후 시각 설명 생성
- cross-modal retrieval 인덱스
- 문서별 벡터 검색
- 다문서 질의응답

이건 다음 단계에서 넣을 수 있다.
