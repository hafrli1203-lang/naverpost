"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { WorkflowState } from "@/types";

const STORAGE_KEY = "naverpost_workflow_state";

type SetStateAction = WorkflowState | ((prev: WorkflowState) => WorkflowState);

export function usePersistedWorkflow(
  initialState: WorkflowState
): [WorkflowState, (action: SetStateAction) => void, () => void] {
  const [state, setStateInternal] = useState<WorkflowState>(initialState);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMount = useRef(true);

  // Load from localStorage on mount
  useEffect(() => {
    if (!isFirstMount.current) return;
    isFirstMount.current = false;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed: WorkflowState = JSON.parse(stored);

      // Only recover if the session is incomplete (not fully done)
      if (parsed && !parsed.naverDraftSaved && parsed.currentStage >= 1) {
        const confirmed = window.confirm(
          "이전에 진행 중이던 작업이 있습니다. 이어서 진행하시겠습니까?\n\n취소하면 새로 시작합니다."
        );
        if (confirmed) {
          setStateInternal(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((newState: WorkflowState) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      try {
        if (newState.naverDraftSaved) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
        }
      } catch {
        // Ignore storage errors (e.g., quota exceeded)
      }
    }, 500);
  }, []);

  // Supports both direct value and functional updater
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

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return [state, setState, clearPersistedState];
}
