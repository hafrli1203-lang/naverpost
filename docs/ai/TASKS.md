# TASKS — naverpost

> 현재 코드 구조 기준 TASK 후보. 작은 단위. 상태: [ ] 대기 · [~] 진행 · [x] 완료
> ※ 루트 `TASKS.md`(프로젝트 자체 백로그)와 별개. 이 파일은 운영구조 관점 TASK.

## 기능 TASK 후보
- [ ] T1. `src/app/api/` 라우트별 입력/출력 책임 정리 → `WIKI_INDEX.md`
- [ ] T2. `operations`/`admin`/`login` 화면의 단계별 흐름·상태 처리 현황 문서화
- [ ] T3. 3단계 파이프라인(keywords→article→image→export) 데이터 흐름 정리
- [ ] T4. validation(금지어/키워드 규칙/반복 검사) 적용 지점 점검
- [ ] T5. BlogOps/Supabase 연동 경로와 실패 복구 동작 확인

## 메모
- 1차는 파악/문서 중심. 기능 변경은 `docs/designs/` 설계 후 5단계 플로우.
- 모듈 상태 경계(`CLAUDE.md`) 침범 금지. 발행 금지. 민감정보 열람 금지.
