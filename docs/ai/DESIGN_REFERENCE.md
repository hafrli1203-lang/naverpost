# DESIGN_REFERENCE — naverpost

기준: `C:\project\_AGENCY_OS\DESIGN_SYSTEM.md` + 프로젝트 `DESIGN.md`.

## 방향성
- 신뢰감 있는 내부 업무 대시보드 톤(전문성 + 절제). 정보 위계가 핵심.
- 한전ON형 서비스 포털 골격 + rightpeople형 행동 중심 진입.

## 스택 기준 (실제)
- Tailwind CSS v4 + shadcn/ui(@base-ui/react), lucide-react 아이콘, next-themes 다크모드, sonner 토스트.
- 기존 `src/components/ui/` 컴포넌트와 토큰을 우선 재사용(임의 신규 스타일 남발 금지).

## 이 프로젝트에서 중점
- 워크플로우 스테퍼: 현재/완료 단계 명확.
- 키워드 옵션 비교·선택, 본문 미리보기(검증 결과 가시화), 이미지 확인/재생성.
- export 화면: 복사/이미지 저장 + "네이버 임시저장" 안내(발행 아님 강조).

## 톤
절제된 업무용. AI Tells(흔한 그라데이션/제네릭 패턴/이모지) 회피. 다크/라이트 모두 대비 확보.
