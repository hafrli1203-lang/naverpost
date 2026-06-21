// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowStepper } from "./WorkflowStepper";

/**
 * 워크플로 단계 표시기 컴포넌트 테스트(첫 jsdom 컴포넌트 테스트).
 * 4단계 렌더 + 도달 가능한 단계만 클릭 가능 동작을 검증한다.
 */

describe("WorkflowStepper", () => {
  it("4개 단계 라벨을 모두 렌더한다", () => {
    render(<WorkflowStepper currentStage={1} />);
    expect(screen.getByText("키워드 선택")).toBeInTheDocument();
    expect(screen.getByText("본문 확인")).toBeInTheDocument();
    expect(screen.getByText("이미지 확인")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
  });

  it("현재 단계 라벨을 강조(파란색·semibold)한다", () => {
    render(<WorkflowStepper currentStage={2} />);
    const active = screen.getByText("본문 확인");
    expect(active.className).toContain("text-blue-600");
    expect(active.className).toContain("font-semibold");
  });

  it("도달한 이전 단계를 클릭하면 onStageClick이 호출된다", () => {
    const onStageClick = vi.fn();
    render(<WorkflowStepper currentStage={3} maxStageReached={3} onStageClick={onStageClick} />);
    // 1단계(키워드 선택)는 현재(3)보다 이전 + 도달 → 클릭 가능
    fireEvent.click(screen.getByText("키워드 선택"));
    expect(onStageClick).toHaveBeenCalledWith(1);
  });

  it("현재 단계 자신을 클릭해도 onStageClick은 호출되지 않는다", () => {
    const onStageClick = vi.fn();
    render(<WorkflowStepper currentStage={2} maxStageReached={3} onStageClick={onStageClick} />);
    fireEvent.click(screen.getByText("본문 확인"));
    expect(onStageClick).not.toHaveBeenCalled();
  });

  it("아직 도달하지 못한 단계는 클릭해도 호출되지 않는다", () => {
    const onStageClick = vi.fn();
    render(<WorkflowStepper currentStage={1} maxStageReached={1} onStageClick={onStageClick} />);
    // 3단계(이미지 확인)는 maxReached(1)보다 뒤 → 클릭 불가
    fireEvent.click(screen.getByText("이미지 확인"));
    expect(onStageClick).not.toHaveBeenCalled();
  });
});
