import { describe, it, expect } from "vitest";
import { appendReferenceAdherence } from "./imageRefPrompt";

describe("appendReferenceAdherence", () => {
  it("returns the prompt unchanged when there is no reference image", () => {
    const p = "Candid photo of a Korean person at home";
    expect(appendReferenceAdherence(p, 0)).toBe(p);
  });

  it("appends a reference-adherence + anti-duplication instruction when references exist", () => {
    const out = appendReferenceAdherence("A fitting scene in an optical shop", 2);
    expect(out).toContain("2 photo(s) of THIS actual store");
    expect(out).toContain("Reproduce that real environment faithfully");
    expect(out.toLowerCase()).toContain("do not duplicate or multiply fixtures");
  });

  it("keeps the original prompt text at the start", () => {
    const out = appendReferenceAdherence("FITTING_SCENE_PROMPT", 1);
    expect(out.startsWith("FITTING_SCENE_PROMPT")).toBe(true);
  });
});
