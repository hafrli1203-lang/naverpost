import { describe, it, expect } from "vitest";
import { detailScenePrompt, pickDetailCategory } from "./shopRefs";

const CATEGORIES = ["nose-pad", "lens", "frame", "contacts", "general"] as const;

describe("detailScenePrompt (Fix B: detail 씬 텍스트↔참조 일치)", () => {
  it("모든 디테일 카테고리에 generation-ready 캡션을 반환한다", () => {
    for (const cat of CATEGORIES) {
      const caption = detailScenePrompt(cat);
      expect(caption.length).toBeGreaterThan(40);
      // 실사진 소진 시 폴백 생성용 — 스타일 가드 포함
      expect(caption).toContain("--ar 4:3");
      expect(caption.toLowerCase()).toContain("no text");
    }
  });

  it("캡션을 pickDetailCategory로 재분류하면 같은 카테고리로 돌아온다(regenerate 일관성)", () => {
    // Fix B 후 detail 프롬프트는 이 캡션으로 교체된다. regenerate는 prompt로 카테고리를
    // 다시 고르므로(pickDetailCategory(prompt)), 캡션↔카테고리가 self-consistent해야
    // 재생성 때도 같은 디테일 풀에서 서빙된다.
    for (const cat of CATEGORIES) {
      expect(pickDetailCategory(detailScenePrompt(cat))).toBe(cat);
    }
  });

  it("'진열대' 같은 일반 묘사가 코받침 캡션과 섞이지 않는다(불일치 회귀 방지)", () => {
    const nosePad = detailScenePrompt("nose-pad");
    expect(nosePad).toContain("nose pad");
    expect(nosePad).not.toMatch(/shelf|display shelf/i);
  });
});
