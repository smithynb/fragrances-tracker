/**
 * Centralized rate-limit definitions for the application.
 *
 * We use the `@convex-dev/rate-limiter` component to enforce per-user limits
 * on write operations.  This prevents a compromised or malicious account from
 * exhausting the Convex usage quota through rapid repeated mutations.
 *
 * ┌───────────────────────┬─────────────┬──────────────────────────────────────┐
 * │ Limit name            │ Strategy    │ Effect                               │
 * ├───────────────────────┼─────────────┼──────────────────────────────────────┤
 * │ addBottle             │ token bucket│ 10/min, burst of 5                   │
 * │ updateBottle          │ token bucket│ 20/min, burst of 5                   │
 * │ deleteBottle          │ token bucket│ 10/min, burst of 3                   │
 * │ toggleFavorite        │ token bucket│ 20/min, burst of 10                  │
 * │ addWearLog            │ token bucket│ 20/min, burst of 5                   │
 * │ updateWearLog         │ token bucket│ 20/min, burst of 5                   │
 * │ deleteWearLog         │ token bucket│ 20/min, burst of 5                   │
 * │ oauthRegister         │ token bucket│ 5/hour, burst of 5                   │
 * │ oauthTokenExchange    │ token bucket│ 30/min, burst of 10                  │
 * │ createApiToken        │ token bucket│ 10/hour, burst of 3                  │
 * └───────────────────────┴─────────────┴──────────────────────────────────────┘
 *
 * ## How to adjust limits
 *
 * Each limit is defined with:
 *   - `kind`     — "token bucket" or "fixed window"
 *   - `rate`     — how many tokens are added per `period`
 *   - `period`   — time window in milliseconds (use the MINUTE / HOUR helpers)
 *   - `capacity` — max burst size (defaults to `rate` if omitted)
 *
 * Example: allow 30 wear logs per minute with a burst of 10:
 *
 *   addWearLog: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
 *
 * After changing limits, re-deploy with `npx convex dev` / `npx convex deploy`.
 *
 * ## How it's consumed
 *
 * In each mutation handler, call:
 *
 *   await rateLimiter.limit(ctx, "<limitName>", { key: userId, throws: true });
 *
 * `throws: true` makes it automatically throw a `ConvexError` with a
 * `retryAfter` value if the limit is exceeded — the client receives a clean
 * error and can retry.
 */

import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // ── Bottle mutations ──────────────────────────────────────────────────
  addBottle: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
  updateBottle: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 5,
  },
  deleteBottle: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 3,
  },
  toggleFavorite: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 10,
  },

  // ── Wear-log mutations ────────────────────────────────────────────────
  addWearLog: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 5 },
  updateWearLog: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 5,
  },
  deleteWearLog: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 5,
  },

  // ── MCP OAuth endpoints (keys are client IPs passed in from Next routes,
  // except createApiToken which is per-user) ────────────────────────────
  oauthRegister: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  oauthTokenExchange: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  createApiToken: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
});
