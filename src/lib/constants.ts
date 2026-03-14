import type { Category } from "@/types";

export const CATEGORIES: Category[] = [
  {
    id: "frames",
    name: "안경테",
    subcategories: ["소재", "디자인", "선택", "관리", "특징"],
  },
  {
    id: "lenses",
    name: "안경렌즈",
    subcategories: ["종류", "코팅", "굴절률", "기능", "선택"],
  },
  {
    id: "contacts",
    name: "콘택트렌즈",
    subcategories: ["종류", "관리", "착용", "문제", "선택"],
  },
  {
    id: "eye-info",
    name: "눈정보",
    subcategories: ["시력", "눈건강", "검사", "생활", "연령"],
  },
  {
    id: "progressive",
    name: "누진다초점",
    subcategories: ["적응", "피팅", "종류", "선택", "대상"],
  },
  {
    id: "glasses-story",
    name: "안경이야기",
    subcategories: ["관리", "문제해결", "수리", "서비스", "생활", "상황"],
  },
];
