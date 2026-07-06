"use client";

import { useCallback, type KeyboardEvent, type RefObject } from "react";

/**
 * Shared dialog-form keyboard behavior:
 * - Ctrl+Enter anywhere submits the form (unless a submit is in flight).
 * - Plain Enter in a textarea inserts a newline as usual.
 * - Plain Enter on text/number inputs is blocked so it never accidentally
 *   submits. Buttons, Select triggers, and other interactive controls are
 *   left unaffected so keyboard users can activate them normally.
 */
export function useCtrlEnterSubmit(
  formRef: RefObject<HTMLFormElement | null>,
  submitting: boolean,
): (e: KeyboardEvent<HTMLFormElement>) => void {
  return useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.key !== "Enter") return;

      if ((e.target as HTMLElement).tagName === "TEXTAREA" && !e.ctrlKey) return;

      if (e.ctrlKey && !e.shiftKey && !e.metaKey) {
        if (submitting) return;
        e.preventDefault();
        formRef.current?.requestSubmit();
        return;
      }

      if ((e.target as HTMLElement).tagName === "INPUT") {
        e.preventDefault();
      }
    },
    [formRef, submitting],
  );
}
