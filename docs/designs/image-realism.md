# 이미지 사실성 개편 (실사 + 실제 매장 반영 + 동작 사실성)

> 버전: v2.0 (2026-06-14)
> 트리거: 사용자 피드백 — "90년대 필름톤·망한 안경원·피팅 동작 오류·후진국 모습". 실사 + 실제 매장(네이버 플레이스) 반영 요구.
> v2.0 추가: 실제 매장 사진 입수 후 "장면 매칭"(검안 글엔 그 매장 검안실 사진, 진열 글엔 진열 사진) + 검안기 정위치·피팅 착석 동작 교정.

---

## v2.0 — 장면 매칭 (scene-aware reference)

### 배경
6개 매장 실제 사진을 `data/shop-refs/<blogId>/`에 입수. 사진들이 장면별로 나뉜다(외관/내부/검안실/피팅·조제/디테일). 기존 v1.x는 매장 사진을 "정렬 후 앞 3장 블라인드 첨부"라 검안 글에 진열 사진이 붙는 식의 미스매치가 났다. → **프롬프트 장면과 사진 장면을 매칭**한다.

### 핵심 변경
1. **사진 장면 인덱스**: `data/shop-refs/_scene-index.json` — 매장별 `{brand, interiorDescription, photos:{파일명:{scene,desc}}}`. (서브에이전트가 전 사진 육안 분류해 생성)
2. **프롬프트 장면 태그**: `[STORE]` 단일 마커 → `[SCENE:exterior|interior|exam|fitting|detail]` 세분화. 매장 밖(집·사무실·야외) 라이프스타일/개념 이미지는 무태그.
3. **장면별 참조 매칭**: `getSceneReferenceImages(shopId, scene)` — 해당 장면 사진 최대 2장 첨부. 폴백 체인: exam/fitting/detail → interior, interior → detail.
4. **검안 동작 교정**: 사람이 검안의자에 앉은 장면은 검안기/포롭터가 환자 정면 정위치(옆으로 빠지거나 앞이 비면 안 됨). 평소엔 옆 암에 보관되지만 검사 중엔 정면으로 끌어옴.
5. **피팅 동작 교정**: 피팅·상담은 피팅 카운터/테이블에 착석해서 진행. 피팅 테이블 사진 없으면 매장 톤에 맞는 현대식 카운터를 임의 생성 허용(사용자 승인됨).
6. **interiorDescription 출처**: `_scene-index.json`의 매장별 묘사를 우선 사용(profile.json 폴백).

### 합성 방지 (재확인)
gti `--image`는 사진을 그대로 붙여넣지 않고 분위기를 참고해 새 장면을 생성(실측 with_ref.png 검증). 프롬프트에 "single cohesive photograph, not a composite/collage" 유지. 즉 "사진을 읽어서 활용, 떡하니 합성 아님" 요구 충족.

### 아웃풋 정의 (v2.0)
- 프롬프트: `{ prompt: string, scene: SceneTag | null }[]` (기존 `{prompt, isStore}` → scene으로 대체).
- `BlogImage.scene` 추가.

### 실패 복구 (v2.0 추가)
- `_scene-index.json` 없음/파싱 실패 → 장면 매칭 비활성, 기존 묘사 기반 생성으로 폴백.
- 특정 장면 사진 없음 → 폴백 체인(→interior) → 그래도 없으면 무첨부(묘사만).
- 사진 파일 경로 깨짐(한글/공백 파일명) → 해당 `--image` 스킵.

## 목적
이미지 생성을 (1) 현대적 실사 톤으로, (2) 실제 매장 인테리어/분위기를 반영하도록, (3) 사람의 동작이 실제 시술과 일치하도록 개편한다.

## 문제 진단 (현행 `src/lib/prompts/imagePrompt.ts`)
| 증상 | 원인 |
|------|------|
| 90년대 필름톤 | `shot on 35mm film`, `soft natural color` → 필름 입자/색바램 강제 |
| 망한/허름한 안경원 | "동네 안경원에서 실제로 찍힌 사진" + 필름톤. 현대·청결 인테리어 지정 없음 |
| 피팅 동작 오류 | 동작 사실성 규칙 전무 → 쓴 안경에 공구 들이대는 비현실 동작 |
| 시대 미지정 | present-day/2020년대 고정 없음 |
| 실제 매장 미반영 | 매장 식별자(shopId)가 이미지 라우트로 전달되지 않음. 참조 이미지 미사용 |

## 해결 (2-Part)

### Part A — 프롬프트 개편 (`imagePrompt.ts`)
1. **필름톤 제거**: `35mm film`, `soft natural color` 삭제. → 현대 스마트폰/미러리스 실사 톤(`clean, sharp, true-to-life color, bright`).
2. **시대·환경 고정(전역)**: `present-day South Korea, 2020s, modern, clean, well-maintained. NEVER vintage/retro/1990s/faded/run-down/developing-country`.
3. **현대적 안경원 공간 묘사(매장 장면)**: 밝고 깔끔한 한국 안경원 인테리어, 벽면 백라이트 진열장(먼지 쌓인 오픈장 금지), 따뜻한 LED, 현대적 사이니지.
4. **동작 사실성 규칙**: 피팅은 안경테를 **손에 들고 얼굴에서 떨어뜨려** 조정(공구는 테에만, 쓴 안경 얼굴에 공구 금지). 검안은 포롭터/시력표 등 실제 자세.
5. **매장 프로필 주입**: 매장명 + 인테리어 설명을 프롬프트에 삽입.
6. **[STORE] 태그**: 매장 내부/피팅 장면 프롬프트 앞에 `[STORE]` 마커 출력 → 참조사진 첨부 대상 식별.

### Part B — 참조 이미지 파이프라인
- **저장소**: `data/shop-refs/<blogId>/` — 매장별 실제 사진(jpg/png/webp) + 선택적 `profile.json`(`interiorDescription`).
- **shopId 전달**: 프론트(`state.shop.id`) → `/api/image/prompts`, `/api/image/one`, `/api/image/regenerate`, `/api/image/generate`.
- **참조 첨부**: `[STORE]` 태그 프롬프트 + 해당 매장 참조사진 존재 시 → `gti --image`로 첨부(최대 3장). 정보/개념 이미지에는 첨부 안 함.
- **헬퍼**: `getShopRefImages(shopId)`, `getShopProfile(shopId)` (`lib/data/shopRefs.ts`).
- **배선**: `generateBlogImage(prompt, refImagePaths?)` → `runGti({ prompt, images })` → `--image` 반복.

## 트리거 조건
이미지 생성 단계(Stage 3) 실행 시.

## 실패 복구
- 매장 참조사진 없음 → 텍스트 프롬프트만으로 생성(개편된 인테리어 묘사로 폴백). 시스템 정상 동작.
- `profile.json` 없음 → 매장명만 주입, 기본 인테리어 묘사 사용.
- 참조 이미지 경로 오류 → 해당 `--image` 스킵, 프롬프트만으로 생성.
- `gti` 실패 → 기존 재시도(maxAttempts 3) 유지.

## 상태 경계
- `imagePrompt.ts`: 순수함수, shop 프로필 주입만 추가.
- `lib/data/shopRefs.ts`: 신규. 파일시스템 읽기 전용(참조사진 목록/프로필).
- `gtiCli.ts`: `images?: string[]` 옵션 추가(하위호환, 미전달 시 기존 동작).
- 이미지 라우트: shopId/isStore 파라미터 추가(미전달 시 기존 동작).

## 아웃풋 정의
- 프롬프트: `{ prompt: string, isStore: boolean }[]` (기존 string[] → 객체화).
- 이미지: 매장 장면은 실제 매장 톤 반영, 정보 이미지는 현대 실사, 전체적으로 90년대톤·허름함·동작오류 제거.

## 참조사진 수집 가이드 (사람 작업)
각 매장 `data/shops.json`의 `naverPlaceUrl`에서 내부/외관/진열장 사진 2~3장을 받아
`data/shop-refs/<blogId>/`에 저장. 선택적으로 `profile.json`에 인테리어 한 줄 설명 작성.
