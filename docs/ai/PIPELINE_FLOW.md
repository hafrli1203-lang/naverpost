# PIPELINE_FLOW — 키워드→본문→이미지→export (T3, 2026-06-19)

> 정적 분석 + export 흐름 실행검증 기반. 코드 변경 0. 라우트 상세는 `WIKI_INDEX.md` 입출력 맵 참조.

## 전체 흐름
```
[매장/카테고리 선택] → [키워드 생성] → [사용자 선택]
   → [본문 작성] → [자동 검증] → [본문 수정] → [사용자 확인]
   → [이미지 프롬프트→생성] → [사용자 확인/재생성]
   → [최종 컨펌] → [붙여넣기 export] → [사람이 네이버 임시저장]
```

## 단계별 정리
| 단계 | 입력 | 처리(라우트/모듈) | 출력 | 외부의존 | mock/demo | 비용 | 사람 확인 |
|---|---|---|---|---|---|---|---|
| 0. 매장·카테고리 | shopId, category | `shops`,`data/shops` | 매장 컨텍스트 | DB | △(로컬 shopRefs) | 0 | 선택 |
| 1. 키워드 생성 | shopId, topic | `keywords`→`ai/claude` | 제목·키워드 옵션 3 | **AI CLI** | ✕(실호출) | **유** | ✅ 옵션 선택 |
| 2. 본문 작성 | 선택 키워드/제목 | `article`→`ai/claude` | 본문 초안 | **AI CLI** | ✕ | **유** | ✅ |
| 2b. 검증 | content | `article/validate`→`validation/contentValidator` | 금지어·규칙 위반 목록 | 로컬(순수) | ✅ | 0 | ✅ 위반 확인 |
| 2c. 수정/정제 | content | `article/chat`,`article/wash`→`ai/claude` | 수정 본문 | **AI CLI** | ✕ | **유** | ✅ |
| 3. 이미지 프롬프트 | title, article | `image/prompts`→`ai/claude` | 이미지 프롬프트 | **AI CLI** | ✕ | **유** | — |
| 3b. 이미지 생성 | prompt, sessionId | `image/generate`,`image/one`,`image/regenerate`→gti | 이미지 파일 | **AI CLI(gti)** | ✕ | **유** | ✅ 확인/재생성 |
| 3c. 이미지 세션 | sessionId | `image/session`,`image/file/[id]`→`storage/imageStore` | 저장/반환 | 로컬(파일) | ✅ | 0 | — |
| 4. export | title, content, imageCount | `lib/naver/contentFormatter`(클라이언트) | rich HTML + 평문(이미지 마커) | 로컬(순수) | ✅ | **0** | ✅ 붙여넣기 |
| 5. 기록 | 세션/글 | `sessions`→`blogops/client` | 세션 저장 + BlogOps 글 기록 | BlogOps/DB | △ | 0 | — |

## 비용 발생 지점 (요약)
- **AI CLI 호출**: 1·2·2c·3·3b (키워드/본문/이미지). 그 외(검증·export·세션 파일)는 무비용.

## mock/demo 가능 영역
- ✅ 무비용 검증 가능: 검증(validate)·export(contentFormatter)·유사도(title-similarity)·분석(analysis)·이미지 파일 저장/조회.
- ✕ 실호출 필요: AI 생성 단계 → 내부 점검에서는 미트리거(사람 승인 시만).

## 사람이 반드시 확인하는 지점 (Human-in-the-loop)
- 키워드 옵션 선택 / 본문 검증 결과(금지어·의료법) / 이미지 확인 / **최종 export 붙여넣기 전**.
- 발행은 사람이 네이버에서 수동 임시저장(자동 발행 없음).

## AX 연결
- export 엔진·검증 필터·AI 어댑터는 가로 재사용 후보(`AX_CANDIDATE.md`).
