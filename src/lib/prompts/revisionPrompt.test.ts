import { describe, it, expect } from "vitest";
import { buildRevisionPrompt } from "./revisionPrompt";
import type { ValidationResult } from "@/types";

/**
 * 수정 프롬프트 빌더 회귀 테스트(순수 문자열 조립).
 * 검증 결과(금지어/주의표현)를 구체적 대체 지시로 변환하는지 고정한다.
 */

function emptyValidation(over: Partial<ValidationResult> = {}): ValidationResult {
  return {
    needsRevision: false,
    prohibitedWords: [],
    cautionPhrases: [],
    overusedWords: [],
    missingKeywords: [],
    hasTable: true,
    revisionReasons: [],
    ...over,
  } as ValidationResult;
}

describe("buildRevisionPrompt", () => {
  it("원문을 포함한다", () => {
    const p = buildRevisionPrompt({
      originalContent: "원문 내용입니다.",
      validation: emptyValidation(),
    });
    expect(p).toContain("원문 내용입니다.");
  });

  it("금지어가 있으면 대체어 교체 지시를 만든다(매핑 있는 단어)", () => {
    const p = buildRevisionPrompt({
      originalContent: "최고의 렌즈입니다.",
      validation: emptyValidation({ prohibitedWords: ["최고"] }),
    });
    expect(p).toContain("최고");
    expect(p).toMatch(/교체/);
  });

  it("매핑 없는 금지어는 삭제/중립 교체로 안내한다", () => {
    const p = buildRevisionPrompt({
      originalContent: "수술 안내",
      validation: emptyValidation({ prohibitedWords: ["수술"] }),
    });
    expect(p).toContain("수술");
    expect(p).toMatch(/삭제|중립/);
  });

  it("문자열을 반환한다", () => {
    expect(typeof buildRevisionPrompt({ originalContent: "x", validation: emptyValidation() })).toBe(
      "string"
    );
  });
});
