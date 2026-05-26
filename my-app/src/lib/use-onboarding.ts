"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Guided onboarding steps for first-time users.
 *
 * welcome        → empty collection, prompt to add first fragrance
 * select-bottle  → first bottle exists, prompt to tap it
 * log-wear       → detail panel open, prompt to log a wear
 * null           → onboarding complete or dismissed
 */
export type OnboardingStep = "welcome" | "select-bottle" | "log-wear" | null;

const STORAGE_KEY = "ft-onboarding-done";

/**
 * Delay (ms) to wait for entrance animations to settle before showing
 * onboarding overlays and measuring element positions.
 */
export const ONBOARDING_SETTLE_MS = 450;

export function useOnboarding() {
  // Start as `undefined` to avoid SSR/hydration mismatch, then resolve
  // from localStorage in a client-only effect.
  const [step, setStep] = useState<OnboardingStep | undefined>(undefined);
  const prevStepRef = useRef<OnboardingStep | undefined>(undefined);

  // Reading localStorage in an effect is necessary to avoid hydration mismatch
  // (localStorage is unavailable on the server). The cascading render is
  // intentional — we want the tour to appear after the client hydrates.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FORCE_ONBOARDING === "1") {
      setStep("welcome"); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    const done = localStorage.getItem(STORAGE_KEY) === "1";
    setStep(done ? null : "welcome");
  }, []);

  // Persist to localStorage when the tour completes or is dismissed.
  // step === null with a previous non-null value means the user just
  // finished or dismissed the tour.
  useEffect(() => {
    if (step === null && prevStepRef.current !== null && prevStepRef.current !== undefined) {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    prevStepRef.current = step;
  }, [step]);

  const advance = useCallback(() => {
    setStep((prev) => {
      switch (prev) {
        case "welcome":
          return "select-bottle";
        case "select-bottle":
          return "log-wear";
        case "log-wear":
          return null;
        default:
          return null;
      }
    });
  }, []);

  const dismiss = useCallback(() => {
    setStep(null);
  }, []);

  return {
    /** Current step, or null when onboarding is inactive/complete. */
    step: step === undefined ? null : step,
    advance,
    dismiss,
  };
}
