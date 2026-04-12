"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkflowState } from "@/types";

const STORAGE_KEY = "naverpost_workflow_state";

type SetStateAction = WorkflowState | ((prev: WorkflowState) => WorkflowState);

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

      const parsed: WorkflowState = JSON.parse(stored);
      if (parsed && parsed.currentStage >= 1) {
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
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
