// src/lib/use-form-errors.test.tsx
import { renderHook, act } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useFormErrors } from "./use-form-errors";

describe("useFormErrors", () => {
  test("clearError removes a single field error", () => {
    const { result } = renderHook(() => useFormErrors());
    act(() => result.current.setErrors({ name: "Required", sprays: "Too many" }));
    act(() => result.current.clearError("name"));
    expect(result.current.errors).toEqual({ sprays: "Too many" });
  });

  test("clearError on an absent field keeps state identity (no re-render churn)", () => {
    const { result } = renderHook(() => useFormErrors());
    act(() => result.current.setErrors({ name: "Required" }));
    const before = result.current.errors;
    act(() => result.current.clearError("missing"));
    expect(result.current.errors).toBe(before);
  });

  test("resetErrors clears field errors and the form error", () => {
    const { result } = renderHook(() => useFormErrors());
    act(() => {
      result.current.setErrors({ name: "Required" });
      result.current.setFormError("Something went wrong");
    });
    act(() => result.current.resetErrors());
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBeNull();
  });
});
