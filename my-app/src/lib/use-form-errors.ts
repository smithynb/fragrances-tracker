"use client";

import { useCallback, useState } from "react";

/**
 * Per-field validation errors plus a form-level error banner message,
 * as used by the add/edit dialogs.
 */
export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const resetErrors = useCallback(() => {
    setErrors({});
    setFormError(null);
  }, []);

  return { errors, setErrors, clearError, formError, setFormError, resetErrors };
}
