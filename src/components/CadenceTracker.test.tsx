// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CadenceTracker } from "./CadenceTracker";

/**
 * 발행 일관성 카드 컴포넌트 테스트(fetch mock).
 * 마운트 시 /api/blogops/cadence를 불러 성공/에러/빈 상태를 렌더하는지 검증한다.
 * (이번 세션에 set-state-in-effect를 고친 컴포넌트 — 동작 회귀 안전망.)
 */

function mockFetchOnce(body: unknown, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 })
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("CadenceTracker", () => {
  it("성공 응답이면 매장 발행 일관성을 렌더한다", async () => {
    mockFetchOnce({
      success: true,
      data: {
        shops: [
          {
            shopId: "top50jn",
            shopName: "탑안경",
            totalPosts: 5,
            lastPublishedAt: "2025-06-15",
            daysSinceLast: 2,
            avgIntervalDays: 7,
            recommendedIntervalDays: 3,
            status: "good",
            recentDates: [],
          },
        ],
      },
    });
    render(<CadenceTracker />);
    await waitFor(() => expect(screen.getByText("탑안경")).toBeInTheDocument());
    expect(screen.getByText("꾸준함")).toBeInTheDocument();
  });

  it("API 실패면 오류 메시지를 보여준다", async () => {
    mockFetchOnce({ success: false, error: "BlogOps 연결 실패" }, false);
    render(<CadenceTracker />);
    await waitFor(() => expect(screen.getByText("BlogOps 연결 실패")).toBeInTheDocument());
  });

  it("빈 결과(reason만)면 안내 문구를 보여준다", async () => {
    mockFetchOnce({
      success: true,
      data: { shops: [], reason: "BLOGOPS_API_URL 미설정(연동 OFF)" },
    });
    render(<CadenceTracker />);
    await waitFor(() =>
      expect(screen.getByText("BLOGOPS_API_URL 미설정(연동 OFF)")).toBeInTheDocument()
    );
  });

  it("새로고침 버튼을 누르면 다시 조회한다", async () => {
    const spy = mockFetchOnce({ success: true, data: { shops: [] } });
    render(<CadenceTracker />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTitle("새로고침"));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
