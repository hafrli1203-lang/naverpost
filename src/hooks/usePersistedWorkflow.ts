"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkflowState } from "@/types";

const STORAGE_KEY = "naverpost_workflow_state";
// 저장된 워크플로 상태의 스키마 버전. 키워드/제목 생성 로직이 바뀌어 옛 결과를
// 더 이상 보여주면 안 될 때 이 숫자를 올린다. 버전이 다르거나 옛 포맷(버전 없음)이면
// 진입 시 묻지 않고 자동 폐기해, 구버전 코드로 만든 결과가 화면에 되살아나지 않게 한다.
const WORKFLOW_STATE_VERSION = 2;

type PersistedEnvelope = {
  version: number;
  state: WorkflowState;
};

type SetStateAction = WorkflowState | ((prev: WorkflowState) => WorkflowState);

// 버전 봉투만 유효한 저장본으로 인정한다. 옛 포맷(봉투 없이 state를 통째로 저장하던 것)은
// version이 없으므로 자동으로 무효 처리된다.
function readValidPersistedState(raw: string): WorkflowState | null {
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as PersistedEnvelope).version !== WORKFLOW_STATE_VERSION ||
    typeof (parsed as PersistedEnvelope).state !== "object"
  ) {
    return null;
  }
  return (parsed as PersistedEnvelope).state;
}

export function usePersistedWorkflow(
  initialState: WorkflowState
): [WorkflowState, (action: SetStateAction) => void, () => void] {
  const [state, setStateInternal] = useState<WorkflowState>(initialState);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (!isFirstMount.current) return;
    isFirstMount.current = false;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = readValidPersistedState(stored);
      // 버전 불일치/옛 포맷이면 구버전 결과이므로 묻지 않고 폐기한다.
      if (!parsed) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (parsed.currentStage >= 1) {
        const confirmed = window.confirm(
          "이전에 진행하던 작업이 있습니다. 이어서 작업하시겠습니까?\n\n취소를 누르면 저장된 진행 상태가 삭제됩니다."
        );

        if (confirmed) {
          setTimeout(() => {
            setStateInternal(parsed);
          }, 0);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const persist = useCallback((newState: WorkflowState) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      try {
        const envelope: PersistedEnvelope = {
          version: WORKFLOW_STATE_VERSION,
          state: newState,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      } catch {
        // Ignore storage errors such as quota exceeded.
      }
    }, 500);
  }, []);

  const setState = useCallback(
    (action: SetStateAction) => {
      setStateInternal((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearPersistedState = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return [state, setState, clearPersistedState];
}
