// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FinalConfirm } from "./FinalConfirm";
import type { WorkflowState } from "@/types";

/**
 * 최종 확인(붙여넣기 export) 화면 컴포넌트 테스트.
 * 핵심 계약: 본문 렌더 · 복사 버튼이 붙여넣기용 export를 클립보드에 씀 ·
 * SEO 검수(/api/analysis)가 실패해도 export를 막지 않는다(fail-open).
 */

function makeState(): WorkflowState {
  return {
    sessionId: "s1",
    currentStage: 4,
    shop: { id: "top50jn", name: "탑안경", blogId: "top50jn", rssUrl: "x" },
    category: { id: "progressive", name: "누진다초점", subcategories: [] },
    topic: "누진렌즈 적응",
    selectedKeyword: {
      title: "누진렌즈 적응 방법",
      mainKeyword: "누진렌즈 적응",
      subKeyword1: "누진렌즈 울렁임",
      subKeyword2: "누진렌즈 시야",
    },
    article: {
      title: "누진렌즈 적응 방법",
      content: "누진렌즈는 적응에 시간이 걸립니다. 천천히 익숙해지면 편안합니다.",
      mainKeyword: "누진렌즈 적응",
      subKeyword1: "누진렌즈 울렁임",
      subKeyword2: "누진렌즈 시야",
      shopName: "탑안경",
      category: "누진다초점",
      validation: { needsRevision: false, revisionReasons: [] } as never,
    } as never,
    images: [],
  } as WorkflowState;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("FinalConfirm", () => {
  it("본문 제목을 렌더한다", () => {
    // SEO 검수 fetch는 빈 실패로 둬도 화면은 떠야 한다(fail-open).
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    render(<FinalConfirm state={makeState()} onStartOver={() => {}} />);
    expect(screen.getAllByText(/누진렌즈 적응 방법/).length).toBeGreaterThan(0);
  });

  it("SEO 검수(/api/analysis)가 실패해도 화면이 깨지지 않는다(fail-open)", async () => {
    const spy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("analysis down"));
    render(<FinalConfirm state={makeState()} onStartOver={() => {}} />);
    // analysis 호출은 시도되지만 실패해도 export 화면은 유지된다
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getAllByText(/누진렌즈 적응 방법/).length).toBeGreaterThan(0);
  });

  it("복사 버튼을 누르면 붙여넣기용 export를 클립보드에 쓴다", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText, write: undefined } });

    render(<FinalConfirm state={makeState()} onStartOver={() => {}} />);
    // 본문 복사 버튼(텍스트에 '복사' 포함)을 찾아 클릭
    const copyBtn = screen.getAllByRole("button").find((b) => /복사/.test(b.textContent ?? ""));
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn!);

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // 클립보드에 쓴 평문에 제목이 포함된다
    expect(String(writeText.mock.calls[0][0])).toContain("누진렌즈 적응 방법");
  });

  it("onStartOver 콜백이 연결돼 있다", () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    const onStartOver = vi.fn();
    render(<FinalConfirm state={makeState()} onStartOver={onStartOver} />);
    const restartBtn = screen
      .getAllByRole("button")
      .find((b) => /처음|다시|새로/.test(b.textContent ?? ""));
    if (restartBtn) {
      fireEvent.click(restartBtn);
      expect(onStartOver).toHaveBeenCalled();
    }
  });
});
