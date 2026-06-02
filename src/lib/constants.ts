import type { Category } from "@/types";

export const CATEGORIES: Category[] = [
  {
    id: "frames",
    name: "안경테",
    subcategories: ["착용감", "피팅", "얼굴형", "무게", "소재", "코패드", "흘러내림", "사이즈", "장시간착용"],
  },
  {
    id: "lenses",
    name: "안경렌즈",
    subcategories: ["교체", "도수", "압축", "굴절률", "코팅", "눈피로", "야간운전", "블루라이트", "어린이근시"],
  },
  {
    id: "contacts",
    name: "콘택트렌즈",
    subcategories: ["건조", "충혈", "이물감", "착용시간", "검사", "난시", "원데이", "교체주기", "관리"],
  },
  {
    id: "eye-info",
    name: "눈정보",
    subcategories: ["눈피로", "안구건조", "시력검사", "근시", "난시", "노안", "야간시야", "어린이시력", "생활습관"],
  },
  {
    id: "progressive",
    name: "누진다초점",
    subcategories: ["적응", "울렁임", "시야", "도수", "피팅", "생활거리", "운전", "업무", "돋보기차이"],
  },
  {
    id: "glasses-story",
    name: "안경이야기",
    subcategories: ["흘러내림", "세척", "수리", "피팅", "코패드", "김서림", "스크래치", "보관", "착용감"],
  },
];
