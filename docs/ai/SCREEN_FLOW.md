# SCREEN_FLOW — 화면 흐름 (T2, 2026-06-19)

> 정적 분석(페이지/컴포넌트) + dev 실행(4화면 200) 기반. 코드 변경 0.

## 화면 목록 / 접근 상태
| 경로 | 역할 | HTTP(이번 점검) | 핵심 컴포넌트 |
|---|---|---|---|
| `/` | **메인 생성 워크플로우** | 200 | WorkflowStepper, ShopSelector, KeywordOptions, ArticleOptions/ArticlePreview, ArticleChat, ImagePreview, FinalConfirm |
| `/operations` | 기획/운영 허브 | 200 | SeriesPlanner(시리즈 기획), CadenceTracker(발행 케이던스), 매장 링크 |
| `/login` | 인증 | 200 | 로그인 폼(`auth` 라우트) |
| `/admin` | 관리 | 200 | 관리 화면 |

## 메인 워크플로우(/) 사용자 클릭 순서
```
WorkflowStepper(단계 표시)
1) ShopSelector      → 매장/카테고리 선택
2) KeywordOptions    → 제목·키워드 옵션 선택      (생성=AI 버튼, 비용)
3) ArticlePreview    → 본문 미리보기 + 검증 표시   (수정=ArticleChat, AI 비용)
4) ImagePreview      → 이미지 확인/재생성          (생성=AI 버튼, 비용)
5) FinalConfirm      → 최종 컨펌 → 붙여넣기 export (비용 0)
```

## 오늘 업무 기준 핵심 화면
- **/** (메인 워크플로우) — 초안 작성 → export. 무비용 사용: 이미 있는 초안 붙여넣어 export만.
- **/operations** — 시리즈 기획·발행 케이던스 점검(콘텐츠 운영 관점).

## 주요 버튼 / 상태 주의
- "생성/작성/이미지 생성/재생성" = **AI CLI 호출(비용)** → 내부 점검 중 누르지 않음.
- "검증/미리보기/export/복사" = 무비용.
- 로딩/빈/오류 상태는 UI 점검 시 `ux-harness-reviewer`로 별도 확인(이번 범위 밖).

## 나중에 AX로 가져갈 UI
- **WorkflowStepper**(단계형 파이프라인 셸) — AX 공통 "생성 워크플로우" 키트 1순위.
- **ShopSelector**(운영 대상 선택), **KeywordOptions**(옵션 선택), **ArticlePreview/ImagePreview**(미리보기/승인), **FinalConfirm**(최종 컨펌·export 진입).
- **CadenceTracker / SeriesPlanner**(운영/기획 위젯) — AX 운영 콘솔 후보.
- 상세는 `AX_CANDIDATE.md` 참조.

## 미검증
- 버튼 단위 클릭 경로(브라우저 자동화 미사용) · 반응형/접근성(ux-harness-reviewer 별도) · Supabase 의존 화면 런타임 데이터.
