"use client";

import { Search, FileText, Image, Save, Check } from "lucide-react";

interface WorkflowStepperProps {
  currentStage: 1 | 2 | 3 | 4;
}

const STAGES = [
  { id: 1, label: "키워드 생성", icon: Search },
  { id: 2, label: "본문 작성", icon: FileText },
  { id: 3, label: "이미지 생성", icon: Image },
  { id: 4, label: "임시저장", icon: Save },
];

export function WorkflowStepper({ currentStage }: WorkflowStepperProps) {
  return (
    <div className="w-full py-6 px-4">
      <div className="flex items-center justify-between relative">
        {/* Connector line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 z-0" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-green-500 z-0 transition-all duration-500"
          style={{
            width: `${((currentStage - 1) / (STAGES.length - 1)) * 100}%`,
          }}
        />

        {STAGES.map((stage) => {
          const Icon = stage.icon;
          const isCompleted = stage.id < currentStage;
          const isActive = stage.id === currentStage;
          const isPending = stage.id > currentStage;

          return (
            <div
              key={stage.id}
              className="flex flex-col items-center gap-2 z-10"
            >
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCompleted ? "bg-green-500 border-green-500 text-white" : ""}
                  ${isActive ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-200" : ""}
                  ${isPending ? "bg-white border-gray-300 text-gray-400" : ""}
                `}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <span
                className={`
                  text-xs font-medium whitespace-nowrap
                  ${isCompleted ? "text-green-600" : ""}
                  ${isActive ? "text-blue-600 font-semibold" : ""}
                  ${isPending ? "text-gray-400" : ""}
                `}
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
