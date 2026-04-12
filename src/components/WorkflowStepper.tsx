"use client";

import { Check, CheckCheck, FileText, Image, Search } from "lucide-react";

interface WorkflowStepperProps {
  currentStage: 1 | 2 | 3 | 4;
  maxStageReached?: number;
  onStageClick?: (stage: number) => void;
}

const STAGES = [
  { id: 1, label: "키워드 선택", icon: Search },
  { id: 2, label: "본문 확인", icon: FileText },
  { id: 3, label: "이미지 확인", icon: Image },
  { id: 4, label: "완료", icon: CheckCheck },
] as const;

export function WorkflowStepper({
  currentStage,
  maxStageReached,
  onStageClick,
}: WorkflowStepperProps) {
  return (
    <div className="w-full px-4 py-6">
      <div className="relative flex items-center justify-between">
        <div className="absolute left-0 right-0 top-5 z-0 h-0.5 bg-gray-200" />
        <div
          className="absolute left-0 top-5 z-0 h-0.5 bg-green-500 transition-all duration-500"
          style={{
            width: `${((currentStage - 1) / (STAGES.length - 1)) * 100}%`,
          }}
        />

        {STAGES.map((stage) => {
          const Icon = stage.icon;
          const maxReached = maxStageReached ?? currentStage;
          const isCompleted = stage.id < currentStage;
          const isActive = stage.id === currentStage;
          const isPending = stage.id > currentStage;
          const isReachable = stage.id <= maxReached && stage.id !== currentStage;
          const isClickable = isReachable && onStageClick != null;

          return (
            <div
              key={stage.id}
              className={`z-10 flex flex-col items-center gap-2 ${isClickable ? "cursor-pointer" : ""}`}
              onClick={() => isClickable && onStageClick(stage.id)}
            >
              <div
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                  isCompleted ? "border-green-500 bg-green-500 text-white" : "",
                  isClickable ? "hover:border-green-600 hover:bg-green-600" : "",
                  isActive ? "border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-200" : "",
                  isPending && !isReachable ? "border-gray-300 bg-white text-gray-400" : "",
                  isPending && isReachable ? "border-green-400 bg-green-100 text-green-600" : "",
                ].join(" ")}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={[
                  "whitespace-nowrap text-xs font-medium",
                  isCompleted ? "text-green-600" : "",
                  isActive ? "font-semibold text-blue-600" : "",
                  isPending && !isReachable ? "text-gray-400" : "",
                  isPending && isReachable ? "text-green-600" : "",
                ].join(" ")}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
