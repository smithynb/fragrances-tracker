import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Maps API/mutation errors to user-friendly messages.
 * Recognizes rate-limit errors (ConvexError from @convex-dev/rate-limiter)
 * and network/offline errors; falls back to a generic message for everything
 * else.  Raw error details are only logged in non-production environments.
 */
export function getApiErrorMessage(err: unknown): string {
  // Rate-limit errors thrown by @convex-dev/rate-limiter with throws:true
  // arrive as a ConvexError whose .data has { kind: "RateLimited", retryAfter }
  if (
    err instanceof Error &&
    (err as unknown as { data?: { kind?: string } }).data?.kind === "RateLimited"
  ) {
    return "You've made too many requests. Please wait a moment and try again.";
  }

  // Network / offline errors
  if (
    err instanceof Error &&
    (err.message.includes("Failed to fetch") ||
      err.message.toLowerCase().includes("networkerror") ||
      err.message.toLowerCase().includes("network request failed"))
  ) {
    return "Network error. Please check your connection and try again.";
  }

  return "Something went wrong. Please try again.";
}
