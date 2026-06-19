# DECISIONS — naverpost

> 의사결정 기록. 왜 그렇게 했는지 남긴다.

## 형식
```
### [날짜] 결정 제목
- 배경:
- 결정:
- 이유:
- 영향:
```

## 기록
### [2026-06-18] 운영 문서 구조 도입(기존 규칙 보존)
- 배경: 워크스페이스 전체 LLM Wiki/Workflow/Loop 구조 적용.
- 결정: 기존 `CLAUDE.md`는 백업(`CLAUDE.md.bak`) 후 원문 보존 + 끝에 연결 섹션만 추가. AGENTS/PRODUCT/DESIGN + `docs/ai/` 12종 + `.claude/skills/agency-ui-ux` 신규 생성.
- 이유: 기존 핵심 규칙(발행 금지·export, 모듈 상태 경계, 5단계 플로우, 콘텐츠 정책) 손실 없이 운영구조 표준화.
- 영향: 코드 변경 없음. 기존 파이프라인/정책 우선 유지. 상위 규칙은 `_AGENCY_OS/MASTER_RULES.md`.
