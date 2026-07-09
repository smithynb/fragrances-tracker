# MCP Sub-plan 3/5: Insight Queries + MCP Tool Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Epic:** `docs/mcp-server-plan.md` (issue #65). Sub-plan 3 of 5. Requires sub-plans 1 (spike findings) and 2 (OAuth foundation) merged. Sub-plan 4 adds the consent/settings UI; sub-plan 5 verifies end-to-end.

> **⚠️ Spike corrections (from `2026-07-06-mcp-0-spike-findings.md` — apply while implementing):**
> - **C2 (tool registration):** register tools with **`server.registerTool(name, { description, inputSchema }, cb)`** — NOT the deprecated `server.tool(...)`. `inputSchema` is a zod **raw shape** (`{ name: z.string() }`), not `z.object(...)`. A reference `ping` implementation already exists on this branch at `src/app/api/[transport]/route.ts` (rewrite it into the real 12-tool route).
> - **C1 (zod):** use **`zod@^4`** (4.3.6), not `^3` — `^3` breaks the build (`TS2589`). Author schemas with the zod v4 API.
> - **C5 (`authInfo.extra`):** the verifier's returned `extra` **survives** to the tool callback (`(args, { authInfo }) => (authInfo!.extra as McpExtra).convexToken`). The WeakMap fallback in sub-plan 1 Task 4 is **not needed**.
> - **C7 (transport):** responses are SSE-framed (`content-type: text/event-stream`); test clients must send `Accept: application/json, text/event-stream`. No `initialize`/`mcp-session-id` prerequisite in stateless mode.

**Goal:** Add the three insight queries (`convex/insights.ts`, test-first), the dual-mode bearer verifier, the zod tool schemas, and the `/api/mcp` endpoint registering all 13 tools against the existing Convex functions.

**Architecture:** Tool handlers create a `ConvexHttpClient`, call `setAuth(authInfo.extra.convexToken)`, and invoke **existing public Convex functions unchanged** — `getUserId`, `getOwnedDoc`, validators, and per-user write rate limits all apply automatically (epic §3.1). OAuth JWTs *are* the Convex credential; PATs are hash-validated then bridged to a 5-minute JWT. Tool errors return `{ isError: true }` content so agents can self-correct.

**Tech Stack:** mcp-handler@1.1.0 + @modelcontextprotocol/sdk@1.26.0 + **zod@^4** + jose (pinned by sub-plan 1), Convex 1.42, convex-test, Vitest edge-runtime.

## Global Constraints

- All commands run from `/home/code/fragrances-tracker/my-app`.
- Branch: `feat/mcp-tools` cut from `main` after sub-plan 2's PR merges. Install no packages.
- **Spike findings govern the mcp-handler API.** Code blocks below use `server.registerTool(name, { description, inputSchema }, cb)` with zod **raw shapes**; if `2026-07-06-mcp-0-spike-findings.md` recorded a different registration method, config keys, or `authInfo` shape, follow findings and keep everything else here intact.
- Scope model (locked, epic §10): tokens carry `"read write"`; **no per-tool or Convex-side scope enforcement in v1**. The verifier still surfaces `scopes` on `AuthInfo` for future use.
- Zod bounds must mirror the server bounds exactly (`convex/bottles.ts` / `convex/wearLogs.ts` constants); Convex validators remain authoritative — zod is early feedback only.
- IDs travel as opaque strings; Convex `v.id()` rejects garbage. Tool descriptions must tell agents where IDs come from.
- Full gate before PR: `bun run typecheck && bun run lint && bun run test:run && bun run build`.
- Commit after every task (`feat:` / `test:` prefixes).

---

### Task 1: `convex/insights.ts` — three read queries (test-first)

**Files:**
- Create: `my-app/convex/insights.ts`
- Create: `my-app/convex/insights.test.ts`

**Interfaces:**
- Consumes: `getOptionalUserId` (`convex/helpers.ts`), indexes `by_user`, `by_user_time`, `by_user_bottle_time` (existing schema).
- Produces (consumed by Task 4's tools):
  - `listWearLogsFiltered` (query): `{ bottleId?: Id<"bottles">, from?: number, to?: number, limit?: number }` → wear-log docs, `wornAt` **descending**, limit clamped to 1–500 (default 100). Foreign/unknown `bottleId` yields `[]` (index is user-scoped — never leaks).
  - `collectionStats` (query): `{}` → `{ totals: { bottleCount, totalWears, totalSprays, favoriteCount, unwornBottleCount, mostWornBottleId, leastWornBottleId }, bottles: Array<{ bottleId, name, brand, isFavorite, wears, sprays, avgRating, lastWornAt }> }`. `avgRating`/`lastWornAt` are `null` when unrated/unworn. `mostWornBottleId`: highest `wears` (ties → earliest `createdAt`); `leastWornBottleId`: lowest `wears` **among worn bottles** (unworn ones are already called out via `unwornBottleCount` and `wears: 0` rows); both `null` when no bottle has wears. **This is a new aggregation — the existing `listBottleStats` does not compute `lastWornAt` and is left untouched.**
  - `collectionSnapshot` (query): `{ recentLogsPerBottle?: number }` (clamped 0–20, default 5) → `{ generatedAt, bottles: Array<{ ...collectionStats bottle row, tags, comments, createdAt, recentLogs: Array<{ wornAt, sprays, context, rating, comment }> }> }` — compact one-shot export for agent-side analysis.
- All three return empty/zero results for unauthenticated callers (same convention as existing queries).

- [ ] **Step 1: Write the failing tests**

```ts
// convex/insights.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";
import { Id } from "./_generated/dataModel";

type T = ReturnType<typeof setupTest>;
type As = Awaited<ReturnType<typeof createTestUser>>["as"];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

async function addBottle(as: As, name: string) {
  return await as.mutation(api.bottles.addBottle, { name });
}

async function wear(as: As, bottleId: Id<"bottles">, wornAt: number, sprays = 2, rating?: number) {
  return await as.mutation(api.wearLogs.addWearLog, { bottleId, wornAt, sprays, rating });
}

describe("insights", () => {
  let t: T;
  beforeEach(() => {
    t = setupTest();
  });

  describe("listWearLogsFiltered", () => {
    test("filters by time range and bottle, newest first", async () => {
      const { as } = await createTestUser(t);
      const a = await addBottle(as, "A");
      const b = await addBottle(as, "B");
      await wear(as, a, NOW - 3 * DAY);
      await wear(as, a, NOW - 1 * DAY);
      await wear(as, b, NOW - 2 * DAY);

      const all = await as.query(api.insights.listWearLogsFiltered, {});
      expect(all.map((l) => l.bottleId)).toEqual([a, b, a]); // desc by wornAt

      const ranged = await as.query(api.insights.listWearLogsFiltered, {
        from: NOW - 2.5 * DAY,
        to: NOW - 1.5 * DAY,
      });
      expect(ranged).toHaveLength(1);
      expect(ranged[0].bottleId).toBe(b);

      const onlyA = await as.query(api.insights.listWearLogsFiltered, { bottleId: a });
      expect(onlyA).toHaveLength(2);
    });

    test("clamps limit and never returns another user's logs", async () => {
      const { as } = await createTestUser(t);
      const { as: asOther } = await createTestUser(t);
      const mine = await addBottle(as, "mine");
      const theirs = await addBottle(asOther, "theirs");
      await wear(as, mine, NOW - DAY);
      await wear(as, mine, NOW - 2 * DAY);
      await wear(asOther, theirs, NOW - DAY);

      expect(await as.query(api.insights.listWearLogsFiltered, { limit: 1 })).toHaveLength(1);
      expect(await as.query(api.insights.listWearLogsFiltered, { limit: 9999 })).toHaveLength(2);
      // Foreign bottleId: user-scoped index yields nothing, no error, no leak.
      expect(await as.query(api.insights.listWearLogsFiltered, { bottleId: theirs })).toEqual([]);
    });
  });

  describe("collectionStats", () => {
    test("aggregates per bottle with lastWornAt and totals, including unworn bottles", async () => {
      const { as } = await createTestUser(t);
      const a = await addBottle(as, "A");
      const b = await addBottle(as, "B");
      const c = await addBottle(as, "C"); // never worn
      await as.mutation(api.bottles.toggleFavorite, { bottleId: c });
      await wear(as, a, NOW - 3 * DAY, 2, 8);
      await wear(as, a, NOW - 1 * DAY, 3, 6);
      await wear(as, b, NOW - 2 * DAY, 4);

      const stats = await as.query(api.insights.collectionStats, {});
      expect(stats.totals).toEqual({
        bottleCount: 3,
        totalWears: 3,
        totalSprays: 9,
        favoriteCount: 1,
        unwornBottleCount: 1,
        mostWornBottleId: a,
        leastWornBottleId: b,
      });

      const rowA = stats.bottles.find((x) => x.bottleId === a)!;
      expect(rowA).toMatchObject({ name: "A", wears: 2, sprays: 5, avgRating: 7 });
      expect(rowA.lastWornAt).toBe(NOW - 1 * DAY);

      const rowC = stats.bottles.find((x) => x.bottleId === c)!;
      expect(rowC).toMatchObject({ wears: 0, sprays: 0, avgRating: null, lastWornAt: null, isFavorite: true });
    });

    test("empty collection yields zero totals with null most/least worn", async () => {
      const { as } = await createTestUser(t);
      const stats = await as.query(api.insights.collectionStats, {});
      expect(stats.bottles).toEqual([]);
      expect(stats.totals.mostWornBottleId).toBeNull();
      expect(stats.totals.leastWornBottleId).toBeNull();
    });
  });

  describe("collectionSnapshot", () => {
    test("returns bottles with stats and capped recent logs, newest first", async () => {
      const { as } = await createTestUser(t);
      const a = await addBottle(as, "A");
      for (let i = 1; i <= 4; i++) await wear(as, a, NOW - i * DAY);

      const snap = await as.query(api.insights.collectionSnapshot, { recentLogsPerBottle: 2 });
      expect(snap.bottles).toHaveLength(1);
      const row = snap.bottles[0];
      expect(row.wears).toBe(4);
      expect(row.recentLogs).toHaveLength(2);
      expect(row.recentLogs[0].wornAt).toBe(NOW - 1 * DAY);
      expect(row.recentLogs[1].wornAt).toBe(NOW - 2 * DAY);
    });

    test("does not include other users' data", async () => {
      const { as } = await createTestUser(t);
      const { as: asOther } = await createTestUser(t);
      await addBottle(asOther, "theirs");
      const snap = await as.query(api.insights.collectionSnapshot, {});
      expect(snap.bottles).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run convex/insights.test.ts`
Expected: FAIL — `api.insights` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// convex/insights.ts
// Read-only, insight-shaped queries for MCP agents. These exist so a connected
// agent can answer "summarize my collection / what should I wear tonight" in
// one or two tool calls instead of paging raw rows. Aggregation happens here,
// interpretation happens in the agent — no server-side AI (epic §1).
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getOptionalUserId } from "./helpers";

const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 500;
const DEFAULT_RECENT_LOGS = 5;
const MAX_RECENT_LOGS = 20;

export const listWearLogsFiltered = query({
  args: {
    bottleId: v.optional(v.id("bottles")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) return [];
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? DEFAULT_LOG_LIMIT), 1), MAX_LOG_LIMIT);
    const { from, to, bottleId } = args;

    // Both index shapes end in wornAt, so the range bounds stay in the index.
    // A bottleId the user doesn't own simply matches nothing — no leak.
    if (bottleId !== undefined) {
      return await ctx.db
        .query("wearLogs")
        .withIndex("by_user_bottle_time", (q) => {
          let r = q.eq("userId", userId).eq("bottleId", bottleId);
          if (from !== undefined) r = r.gte("wornAt", from);
          if (to !== undefined) r = r.lte("wornAt", to);
          return r;
        })
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("wearLogs")
      .withIndex("by_user_time", (q) => {
        let r = q.eq("userId", userId);
        if (from !== undefined) r = r.gte("wornAt", from);
        if (to !== undefined) r = r.lte("wornAt", to);
        return r;
      })
      .order("desc")
      .take(limit);
  },
});

type BottleAgg = {
  wears: number;
  sprays: number;
  ratingSum: number;
  ratingCount: number;
  lastWornAt: number | null;
};

function aggregate(bottles: Doc<"bottles">[], logs: Doc<"wearLogs">[]) {
  const byBottle = new Map<string, BottleAgg>();
  for (const bottle of bottles) {
    byBottle.set(bottle._id, { wears: 0, sprays: 0, ratingSum: 0, ratingCount: 0, lastWornAt: null });
  }
  for (const log of logs) {
    const agg = byBottle.get(log.bottleId);
    if (!agg) continue; // log for a just-deleted bottle; skip
    agg.wears += 1;
    agg.sprays += log.sprays;
    if (typeof log.rating === "number") {
      agg.ratingSum += log.rating;
      agg.ratingCount += 1;
    }
    if (agg.lastWornAt === null || log.wornAt > agg.lastWornAt) agg.lastWornAt = log.wornAt;
  }
  return byBottle;
}

function statsRow(bottle: Doc<"bottles">, agg: BottleAgg) {
  return {
    bottleId: bottle._id,
    name: bottle.name,
    brand: bottle.brand ?? null,
    isFavorite: bottle.isFavorite ?? false,
    wears: agg.wears,
    sprays: agg.sprays,
    avgRating: agg.ratingCount > 0 ? agg.ratingSum / agg.ratingCount : null,
    lastWornAt: agg.lastWornAt,
  };
}

async function loadUserData(ctx: QueryCtx, userId: Id<"users">) {
  const bottles = await ctx.db
    .query("bottles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const logs = await ctx.db
    .query("wearLogs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return { bottles, logs };
}

export const collectionStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) {
      return {
        totals: {
          bottleCount: 0, totalWears: 0, totalSprays: 0, favoriteCount: 0,
          unwornBottleCount: 0, mostWornBottleId: null, leastWornBottleId: null,
        },
        bottles: [],
      };
    }
    const { bottles, logs } = await loadUserData(ctx, userId);
    const byBottle = aggregate(bottles, logs);
    const rows = bottles.map((b) => statsRow(b, byBottle.get(b._id)!));

    // Ties broken by earliest createdAt so results are deterministic.
    const worn = bottles
      .filter((b) => byBottle.get(b._id)!.wears > 0)
      .sort((a, b) => a.createdAt - b.createdAt);
    let mostWorn: Doc<"bottles"> | null = null;
    let leastWorn: Doc<"bottles"> | null = null;
    for (const b of worn) {
      const wears = byBottle.get(b._id)!.wears;
      if (mostWorn === null || wears > byBottle.get(mostWorn._id)!.wears) mostWorn = b;
      if (leastWorn === null || wears < byBottle.get(leastWorn._id)!.wears) leastWorn = b;
    }

    return {
      totals: {
        bottleCount: bottles.length,
        totalWears: logs.length,
        totalSprays: logs.reduce((sum, l) => sum + l.sprays, 0),
        favoriteCount: bottles.filter((b) => b.isFavorite === true).length,
        unwornBottleCount: rows.filter((r) => r.wears === 0).length,
        mostWornBottleId: mostWorn?._id ?? null,
        leastWornBottleId: leastWorn?._id ?? null,
      },
      bottles: rows,
    };
  },
});

export const collectionSnapshot = query({
  args: { recentLogsPerBottle: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    if (userId === null) return { generatedAt: Date.now(), bottles: [] };
    const recentCount = Math.min(
      Math.max(Math.trunc(args.recentLogsPerBottle ?? DEFAULT_RECENT_LOGS), 0),
      MAX_RECENT_LOGS,
    );
    const { bottles, logs } = await loadUserData(ctx, userId);
    const byBottle = aggregate(bottles, logs);

    const rows = await Promise.all(
      bottles.map(async (bottle) => {
        const recent =
          recentCount === 0
            ? []
            : await ctx.db
                .query("wearLogs")
                .withIndex("by_user_bottle_time", (q) =>
                  q.eq("userId", userId).eq("bottleId", bottle._id),
                )
                .order("desc")
                .take(recentCount);
        return {
          ...statsRow(bottle, byBottle.get(bottle._id)!),
          tags: bottle.tags ?? [],
          comments: bottle.comments ?? null,
          createdAt: bottle.createdAt,
          recentLogs: recent.map((l) => ({
            wornAt: l.wornAt,
            sprays: l.sprays,
            context: l.context ?? null,
            rating: l.rating ?? null,
            comment: l.comment ?? null,
          })),
        };
      }),
    );
    return { generatedAt: Date.now(), bottles: rows };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run convex/insights.test.ts`
Expected: PASS (6 tests). Also `bun run test:run convex/` — existing suites still green.

- [ ] **Step 5: Commit**

```bash
git add convex/insights.ts convex/insights.test.ts
git commit -m "feat: add insight queries (filtered logs, collection stats with lastWornAt, snapshot)"
```

---

### Task 2: Dual-mode bearer verifier (test-first)

**Files:**
- Create: `my-app/src/lib/mcp/verify-token.ts`
- Create: `my-app/src/lib/mcp/verify-token.test.ts`

**Interfaces:**
- Consumes: `getPublicJwks`, `mintPatBridgeToken`, `sha256Hex`, `PAT_PREFIX`, `MCP_JWT_AUDIENCE` (sub-plan 2 Task 3), `api.apiTokens.validate` (sub-plan 2 Task 7).
- Produces (consumed by Task 4's `withMcpAuth`):
  - `type McpExtra = { userId: string; convexToken: string }`
  - `createMcpTokenVerifier(deps?)` → `(req: Request, bearer?: string) => Promise<McpAuthInfo | undefined>` — factory with injectable deps for tests
  - `verifyMcpToken` — the default-deps instance used by the route
  - Behavior: `fgt_*` bearer → sha256 → `apiTokens.validate` → mint 5-min bridge JWT; anything else → local `jwtVerify` against our own JWKS (no network, no DB); any failure → `undefined` (which `withMcpAuth` turns into 401).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mcp/verify-token.test.ts
import { describe, expect, test } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { mintAccessToken, sha256Hex } from "./tokens";
import { createMcpTokenVerifier, McpExtra } from "./verify-token";

const ISSUER = "https://example.test";
const REQ = new Request("https://example.test/api/mcp");

async function makeVerifier(overrides: Partial<Parameters<typeof createMcpTokenVerifier>[0]> = {}) {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const pem = await exportPKCS8(privateKey);
  return {
    pem,
    verify: createMcpTokenVerifier({
      privateKeyPem: pem,
      issuer: ISSUER,
      validatePat: async () => null,
      ...overrides,
    }),
  };
}

describe("verifyMcpToken — OAuth JWT path", () => {
  test("valid JWT yields authInfo whose convexToken is the JWT itself", async () => {
    const { pem, verify } = await makeVerifier();
    const jwt = await mintAccessToken({
      userId: "user123", grantId: "grant456", clientId: "client789",
      scope: "read write", privateKeyPem: pem, issuer: ISSUER,
    });
    const info = await verify(REQ, jwt);
    expect(info?.clientId).toBe("client789");
    expect(info?.scopes).toEqual(["read", "write"]);
    expect(info?.extra as McpExtra).toEqual({ userId: "user123", convexToken: jwt });
  });

  test("JWT signed by a different key is rejected", async () => {
    const { verify } = await makeVerifier();
    const other = await generateKeyPair("RS256", { extractable: true });
    const forged = await mintAccessToken({
      userId: "user123", grantId: "g", clientId: "c", scope: "read write",
      privateKeyPem: await exportPKCS8(other.privateKey), issuer: ISSUER,
    });
    expect(await verify(REQ, forged)).toBeUndefined();
  });

  test("missing bearer and garbage bearer are rejected", async () => {
    const { verify } = await makeVerifier();
    expect(await verify(REQ, undefined)).toBeUndefined();
    expect(await verify(REQ, "not-a-jwt")).toBeUndefined();
  });
});

describe("verifyMcpToken — PAT path", () => {
  test("valid PAT is hash-looked-up and bridged to a convex JWT", async () => {
    const pat = "fgt_test-token-value";
    const expectedHash = await sha256Hex(pat);
    let seenHash: string | null = null;
    const { verify } = await makeVerifier({
      validatePat: async (tokenHash: string) => {
        seenHash = tokenHash;
        return { userId: "user123", tokenId: "tok1", scopes: ["read", "write"] };
      },
    });
    const info = await verify(REQ, pat);
    expect(seenHash).toBe(expectedHash);
    expect(info?.clientId).toBe("personal-access-token");
    const extra = info?.extra as McpExtra;
    expect(extra.userId).toBe("user123");
    expect(extra.convexToken.split(".")).toHaveLength(3); // bridge JWT, not the PAT
  });

  test("revoked/unknown PAT is rejected", async () => {
    const { verify } = await makeVerifier({ validatePat: async () => null });
    expect(await verify(REQ, "fgt_revoked")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/mcp/verify-token.test.ts`
Expected: FAIL — cannot resolve `./verify-token`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mcp/verify-token.ts
// Dual-mode bearer verification for /api/mcp (epic §3.3):
//   fgt_* → PAT: hash → Convex lookup → 5-min bridge JWT as the Convex credential.
//   else  → OAuth access token: local RS256 verify (no DB, no network); the JWT
//           itself is the Convex credential (customJwt provider trusts it).
// Any failure returns undefined; withMcpAuth converts that into the 401 +
// WWW-Authenticate discovery response.
import { createLocalJWKSet, jwtVerify } from "jose";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import {
  getPublicJwks,
  mintPatBridgeToken,
  sha256Hex,
  MCP_JWT_AUDIENCE,
  PAT_PREFIX,
} from "./tokens";

export type McpExtra = { userId: string; convexToken: string };

export type McpAuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  extra: McpExtra;
};

type PatRecord = { userId: string; tokenId: string; scopes: string[] };

type VerifierDeps = {
  privateKeyPem?: string;
  issuer?: string;
  validatePat?: (tokenHash: string) => Promise<PatRecord | null>;
};

function defaultValidatePat(tokenHash: string): Promise<PatRecord | null> {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  return convex.mutation(api.apiTokens.validate, { tokenHash });
}

export function createMcpTokenVerifier(deps: VerifierDeps = {}) {
  const validatePat = deps.validatePat ?? defaultValidatePat;

  return async function verifyMcpToken(
    _req: Request,
    bearer?: string,
  ): Promise<McpAuthInfo | undefined> {
    if (!bearer) return undefined;

    if (bearer.startsWith(PAT_PREFIX)) {
      const pat = await validatePat(await sha256Hex(bearer));
      if (!pat) return undefined;
      const convexToken = await mintPatBridgeToken({
        userId: pat.userId,
        tokenId: pat.tokenId,
        privateKeyPem: deps.privateKeyPem,
        issuer: deps.issuer,
      });
      return {
        token: bearer,
        clientId: "personal-access-token",
        scopes: pat.scopes,
        extra: { userId: pat.userId, convexToken },
      };
    }

    try {
      const jwks = createLocalJWKSet(await getPublicJwks(deps.privateKeyPem));
      const { payload } = await jwtVerify(bearer, jwks, {
        issuer: deps.issuer ?? process.env.NEXT_PUBLIC_APP_URL,
        audience: MCP_JWT_AUDIENCE,
      });
      const [userId] = (payload.sub as string).split("|");
      return {
        token: bearer,
        clientId: (payload.client_id as string) ?? "unknown",
        scopes: ((payload.scope as string) ?? "").split(" ").filter(Boolean),
        extra: { userId, convexToken: bearer },
      };
    } catch {
      return undefined;
    }
  };
}

/** Default instance used by the /api/mcp route. */
export const verifyMcpToken = createMcpTokenVerifier();
```

If the spike findings recorded a different `AuthInfo` type for `withMcpAuth` (e.g. an SDK-exported interface with required `expiresAt`), align `McpAuthInfo` with it here.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/lib/mcp/verify-token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/verify-token.ts src/lib/mcp/verify-token.test.ts
git commit -m "feat: add dual-mode MCP bearer verifier (OAuth JWT + PAT bridge)"
```

---

### Task 3: Tool input schemas

**Files:**
- Create: `my-app/src/lib/mcp/tool-schemas.ts`
- Create: `my-app/src/lib/mcp/tool-schemas.test.ts`

**Interfaces:**
- Produces: one exported zod **raw shape** per tool (consumed by Task 4). Bounds mirror `convex/bottles.ts` (name ≤200, brand ≤200, comments ≤2000, tags ≤20×≤50, sizeMl >0 ≤10000) and `convex/wearLogs.ts` (sprays int 1–100 via `MAX_SPRAYS` in `src/lib/constants.ts`, rating 1–10, context ≤200, comment ≤2000). Update shapes use `.nullable()` on clearable fields — `null` clears, matching `buildPatch`.

- [ ] **Step 1: Write the failing test** (spot-checks the tricky semantics only: null-clears, int bounds, defaults)

```ts
// src/lib/mcp/tool-schemas.test.ts
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  updateBottleShape,
  addWearLogShape,
  listWearLogsShape,
  getCollectionSnapshotShape,
} from "./tool-schemas";

describe("tool schemas", () => {
  test("update_bottle accepts null to clear optional fields but not for name", () => {
    const schema = z.object(updateBottleShape);
    expect(schema.safeParse({ bottleId: "x", brand: null, sizeMl: null }).success).toBe(true);
    expect(schema.safeParse({ bottleId: "x", name: null }).success).toBe(false);
  });

  test("add_wear_log enforces integer spray bounds and rating range", () => {
    const schema = z.object(addWearLogShape);
    const base = { bottleId: "x", wornAt: 1700000000000 };
    expect(schema.safeParse({ ...base, sprays: 3 }).success).toBe(true);
    expect(schema.safeParse({ ...base, sprays: 2.5 }).success).toBe(false);
    expect(schema.safeParse({ ...base, sprays: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, sprays: 101 }).success).toBe(false);
    expect(schema.safeParse({ ...base, sprays: 3, rating: 11 }).success).toBe(false);
  });

  test("list_wear_logs bounds limit and snapshot bounds recentLogsPerBottle", () => {
    expect(z.object(listWearLogsShape).safeParse({ limit: 501 }).success).toBe(false);
    expect(z.object(listWearLogsShape).safeParse({}).success).toBe(true);
    expect(z.object(getCollectionSnapshotShape).safeParse({ recentLogsPerBottle: 21 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/mcp/tool-schemas.test.ts`
Expected: FAIL — cannot resolve `./tool-schemas`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mcp/tool-schemas.ts
// Zod raw shapes for MCP tool inputs. These mirror the server-side bounds in
// convex/bottles.ts and convex/wearLogs.ts to give agents early, descriptive
// validation errors — the Convex validators remain authoritative.
import { z } from "zod";
import { MAX_SPRAYS } from "@/lib/constants";

const bottleId = z.string().describe("Bottle ID from list_bottles / get_collection_stats.");
const wearLogId = z.string().describe("Wear log ID from list_wear_logs.");

const name = z.string().min(1).max(200);
const brand = z.string().max(200);
const sizeMl = z.number().positive().max(10_000).describe("Bottle size in millilitres.");
const tags = z.array(z.string().min(1).max(50)).max(20);
const comments = z.string().max(2000);

const wornAt = z
  .number()
  .int()
  .positive()
  .describe("Wear time as Unix epoch milliseconds (convert ISO dates: Date.parse). Must not be in the future.");
const sprays = z.number().int().min(1).max(MAX_SPRAYS);
const context = z.string().max(200).describe('Occasion, e.g. "office", "date night".');
const rating = z.number().min(1).max(10);
const wearComment = z.string().max(2000);

export const listBottlesShape = {};
export const getBottleShape = { bottleId };

export const addBottleShape = {
  name,
  brand: brand.optional(),
  sizeMl: sizeMl.optional(),
  tags: tags.optional(),
  comments: comments.optional(),
};

// null clears a field (buildPatch semantics); name is required in the schema
// so it can be overwritten but never cleared.
export const updateBottleShape = {
  bottleId,
  name: name.optional(),
  brand: brand.nullable().optional(),
  sizeMl: sizeMl.nullable().optional(),
  tags: tags.nullable().optional(),
  comments: comments.nullable().optional(),
};

export const deleteBottleShape = { bottleId };
export const toggleFavoriteShape = { bottleId };

export const addWearLogShape = {
  bottleId,
  wornAt,
  sprays,
  context: context.optional(),
  rating: rating.optional(),
  comment: wearComment.optional(),
};

export const updateWearLogShape = {
  wearLogId,
  wornAt: wornAt.optional(),
  sprays: sprays.optional(),
  context: context.nullable().optional(),
  rating: rating.nullable().optional(),
  comment: wearComment.nullable().optional(),
};

export const deleteWearLogShape = { wearLogId };

export const listWearLogsShape = {
  bottleId: bottleId.optional(),
  from: z.number().int().optional().describe("Inclusive lower bound, epoch ms."),
  to: z.number().int().optional().describe("Inclusive upper bound, epoch ms."),
  limit: z.number().int().min(1).max(500).optional().describe("Max logs to return (default 100)."),
};

export const getCollectionStatsShape = {};

export const getCollectionSnapshotShape = {
  recentLogsPerBottle: z.number().int().min(0).max(20).optional()
    .describe("Recent wear logs to include per bottle (default 5)."),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/lib/mcp/tool-schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tool-schemas.ts src/lib/mcp/tool-schemas.test.ts
git commit -m "feat: add zod input schemas for the 13 MCP tools"
```

---

### Task 4: `/api/mcp` route — 13 tools + auth wiring

**Files:**
- Create (replace any spike leftover): `my-app/src/app/api/[transport]/route.ts`

**Interfaces:**
- Consumes: `verifyMcpToken` + `McpExtra` (Task 2), all shapes (Task 3), existing `api.bottles.*` / `api.wearLogs.*` and new `api.insights.*` (Task 1).
- Produces: `/api/mcp` (streamable HTTP, stateless). Tool result convention: success → `{ content: [{ type: "text", text: JSON.stringify(data) }] }`; failure → same plus `isError: true` with the human-readable Convex error message so agents can self-correct (bad ID, validation bound, `retryAfter` rate limit).

- [ ] **Step 1: Write the route**

Adjust registration-call shape to spike findings; everything else stands.

```ts
// src/app/api/[transport]/route.ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../convex/_generated/api";
import { verifyMcpToken, McpExtra } from "@/lib/mcp/verify-token";
import * as shapes from "@/lib/mcp/tool-schemas";

function convexFor(extra: McpExtra): ConvexHttpClient {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(extra.convexToken);
  return convex;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const d = data as { message?: string; kind?: string; retryAfter?: number };
      if (d.kind === "RateLimited" && typeof d.retryAfter === "number") {
        return `Rate limited. Retry after ${Math.ceil(d.retryAfter / 1000)}s.`;
      }
      if (d.message) return d.message;
    }
    return "Request rejected.";
  }
  if (error instanceof Error) {
    // Convex wraps thrown Error messages with call metadata; keep the useful tail.
    const match = error.message.match(/Uncaught Error: (.*?)(\n|$)/);
    return match ? match[1] : error.message;
  }
  return "Unknown error.";
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: errorMessage(error) }] };
  }
}

const handler = createMcpHandler(
  (server) => {
    const extraOf = (authInfo: unknown) =>
      (authInfo as { extra: McpExtra }).extra;

    // ── Bottles ───────────────────────────────────────────────────────────
    server.registerTool(
      "list_bottles",
      { description: "List every fragrance bottle in the user's collection, newest first. Start here to get bottle IDs.", inputSchema: shapes.listBottlesShape },
      async (_args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.bottles.listBottles, {})),
    );
    server.registerTool(
      "get_bottle",
      { description: "Get one bottle by ID. Returns null if it doesn't exist or isn't the user's.", inputSchema: shapes.getBottleShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.bottles.getBottle, args)),
    );
    server.registerTool(
      "add_bottle",
      { description: "Add a fragrance bottle to the user's collection. Returns the new bottle ID.", inputSchema: shapes.addBottleShape },
      async (args, { authInfo }) =>
        run(async () => ({
          bottleId: await convexFor(extraOf(authInfo)).mutation(api.bottles.addBottle, args),
        })),
    );
    server.registerTool(
      "update_bottle",
      { description: "Update a bottle. Omit a field to leave it unchanged; pass null to clear it (name cannot be cleared).", inputSchema: shapes.updateBottleShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).mutation(api.bottles.updateBottle, args)),
    );
    server.registerTool(
      "delete_bottle",
      { description: "Delete a bottle AND all of its wear logs (cascade). Irreversible — confirm with the user first.", inputSchema: shapes.deleteBottleShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).mutation(api.bottles.deleteBottle, args)),
    );
    server.registerTool(
      "toggle_favorite",
      { description: "Toggle a bottle's favorite flag.", inputSchema: shapes.toggleFavoriteShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).mutation(api.bottles.toggleFavorite, args)),
    );

    // ── Wear logs ─────────────────────────────────────────────────────────
    server.registerTool(
      "add_wear_log",
      { description: "Log a wear of a bottle. wornAt is epoch milliseconds and must not be in the future.", inputSchema: shapes.addWearLogShape },
      async (args, { authInfo }) =>
        run(async () => ({
          wearLogId: await convexFor(extraOf(authInfo)).mutation(api.wearLogs.addWearLog, args),
        })),
    );
    server.registerTool(
      "update_wear_log",
      { description: "Update a wear log. Omit a field to keep it; pass null to clear context/rating/comment.", inputSchema: shapes.updateWearLogShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).mutation(api.wearLogs.updateWearLog, args)),
    );
    server.registerTool(
      "delete_wear_log",
      { description: "Delete a single wear log.", inputSchema: shapes.deleteWearLogShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).mutation(api.wearLogs.deleteWearLog, args)),
    );

    // ── Insights ──────────────────────────────────────────────────────────
    server.registerTool(
      "list_wear_logs",
      { description: "List wear logs newest-first, optionally filtered by bottle and/or time range (epoch ms). Default limit 100, max 500.", inputSchema: shapes.listWearLogsShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.listWearLogsFiltered, args)),
    );
    server.registerTool(
      "get_collection_stats",
      { description: "Per-bottle stats (wears, sprays, avgRating, lastWornAt) plus collection totals (most/least worn, favorites, unworn count). Ideal first call for analysis.", inputSchema: shapes.getCollectionStatsShape },
      async (_args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.collectionStats, {})),
    );
    server.registerTool(
      "get_collection_snapshot",
      { description: "Compact full export: every bottle with stats, tags, notes, and N recent wear logs each. Built for one-shot analysis (rotation gaps, seasonal patterns, recommendations).", inputSchema: shapes.getCollectionSnapshotShape },
      async (args, { authInfo }) =>
        run(() => convexFor(extraOf(authInfo)).query(api.insights.collectionSnapshot, args)),
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST };
```

(That is 12 registrations covering the epic's 13 tool names — the epic counts `list_wear_logs` in both reuse and insight tables; 12 distinct tools is correct. Note this in the PR description.)

- [ ] **Step 2: Typecheck and verify the 401 discovery path (dev server running)**

```bash
bun run typecheck
curl -si -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -10
```

Expected: 401 with `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/\[transport\]
git commit -m "feat: add /api/mcp endpoint with 12 CRUD + insight tools"
```

---

### Task 5: PAT smoke test via dev seed

**Files:**
- Create: `my-app/convex/devSeed.ts`

**Interfaces:**
- Produces: `internalMutation` `devSeed.seedPat` — CLI-only helper (internal functions are not callable from clients) to plant a PAT hash for a user, enabling authed end-to-end smoke before the settings UI (sub-plan 4) exists.

- [ ] **Step 1: Write the seed helper**

```ts
// convex/devSeed.ts
// Dev-only helpers, callable exclusively via `bunx convex run` (internal
// functions are unreachable from clients). Used to smoke-test the MCP endpoint
// before the settings UI exists.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const seedPat = internalMutation({
  args: { userId: v.id("users"), tokenHash: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("personalAccessTokens", {
      userId: args.userId,
      tokenHash: args.tokenHash,
      name: args.name,
      scopes: ["read", "write"],
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Seed and smoke (dev server + `bunx convex dev` running; sign in once via the web app so your user exists)**

```bash
# Find your user id (users table) in the Convex dashboard, then:
PAT="fgt_local-smoke-token"
HASH=$(python3 -c "import hashlib;print(hashlib.sha256('fgt_local-smoke-token'.encode()).hexdigest())")
bunx convex run devSeed:seedPat "{\"userId\":\"<your-user-id>\",\"tokenHash\":\"$HASH\",\"name\":\"smoke\"}"

curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $PAT" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_collection_stats","arguments":{}}}'
```

Expected: a result containing your real `totals`. This exercises PAT hash lookup → bridge JWT → Convex `customJwt` verification → `getUserId` → insights, i.e. the entire epic §3.1 unlock. (Requires the Convex dev deployment to reach the JWKS — apply sub-plan 5 Task 1's local strategy if verification fails with an auth error.)

Also verify a tool error surfaces as `isError` content:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $PAT" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_bottle","arguments":{"bottleId":"garbage"}}}'
```

Expected: `isError: true` with a validator message, not a protocol failure.

- [ ] **Step 3: Full gate + commit + PR**

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
git add convex/devSeed.ts
git commit -m "feat: add dev-only PAT seed helper for MCP smoke tests"
git push -u origin feat/mcp-tools
gh pr create --title "feat: MCP endpoint with insight queries and 12 tools" --body "Sub-plan 3/5 of docs/mcp-server-plan.md (issue #65): convex/insights.ts (new aggregation incl. lastWornAt — listBottleStats untouched), dual-mode bearer verifier, zod tool schemas, /api/mcp with 12 tools (epic said 13; list_wear_logs was double-counted). Scopes carried but not enforced per v1 decision (epic §10). PAT path smoke-tested end-to-end via dev seed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
