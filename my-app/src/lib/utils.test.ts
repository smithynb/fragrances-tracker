import { describe, test, expect } from "vitest";
import { getApiErrorMessage } from "./utils";

describe("getApiErrorMessage", () => {
  test("returns a user-friendly message for future-date server errors", () => {
    // Convex wraps the message — "Uncaught Error: ..." is the realistic shape.
    const err = new Error("Uncaught Error: wornAt cannot be in the future.");
    expect(getApiErrorMessage(err)).toBe(
      "The date and time can't be in the future."
    );
  });

  test("exact server message also matches", () => {
    const err = new Error("wornAt cannot be in the future.");
    expect(getApiErrorMessage(err)).toBe(
      "The date and time can't be in the future."
    );
  });

  test("returns rate-limit message for rate-limited errors", () => {
    const err = Object.assign(new Error("rate limited"), {
      data: { kind: "RateLimited" },
    });
    expect(getApiErrorMessage(err)).toBe(
      "You've made too many requests. Please wait a moment and try again."
    );
  });

  test("returns network message for fetch failures", () => {
    const err = new Error("Failed to fetch");
    expect(getApiErrorMessage(err)).toBe(
      "Network error. Please check your connection and try again."
    );
  });

  test("returns generic fallback for unknown errors", () => {
    const err = new Error("some unexpected internal error");
    expect(getApiErrorMessage(err)).toBe(
      "Something went wrong. Please try again."
    );
  });
});
