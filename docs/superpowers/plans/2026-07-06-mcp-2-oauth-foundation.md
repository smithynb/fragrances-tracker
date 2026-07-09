# MCP Sub-plan 2/5: OAuth + Token Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Epic:** `docs/mcp-server-plan.md` (issue #65). Sub-plan 2 of 5. Requires sub-plan 1's findings doc (`2026-07-06-mcp-0-spike-findings.md`) to be merged. Sub-plan 3 (MCP tools) and 4 (UI) build on this.

> **⚠️ Spike corrections (from `2026-07-06-mcp-0-spike-findings.md` — apply while implementing):**
> - **C6 (jose):** `tokens.ts` `getPublicKey`/JWK export must import the signing key extractable — `importPKCS8(pem, 'RS256', { extractable: true })` — or `exportJWK` throws `non-extractable CryptoKey`. Verified recipe: `scripts/spike-jose.mjs`.
> - **C1 (zod):** pinned **`zod@^4`** (4.3.6), not `^3` — write all schemas with the zod v4 API.
> - **C3 (sdk):** `@modelcontextprotocol/sdk` pinned **exact 1.26.0** (mcp-handler peer). Already in `package.json` from sub-plan 1 — install nothing.
> - **C4 (metadata helpers):** the RFC 9728 protected-resource route can use mcp-handler's `protectedResourceHandler` + `metadataCorsOptionsRequestHandler` instead of hand-rolling. The RFC 8414 authorization-server metadata route still hand-rolled (no helper).

**Goal:** Build the complete OAuth 2.1 + PAT token backend: 5 Convex tables, crypto/JWT helpers, Convex OAuth/PAT functions (test-first), the `customJwt` Convex auth provider, and the Next.js endpoints — JWKS, RFC 8414 + RFC 9728 metadata, RFC 7591 DCR, and the token endpoint (auth-code + refresh grants).

**Architecture:** Crypto placement rule (applies to every task): **Next.js route handlers generate all raw secrets (auth codes, refresh tokens, PATs, client IDs) and compute SHA-256 hashes; Convex functions only store and compare pre-computed hashes/strings — they never see raw secrets and never do crypto.** Access tokens are RS256 JWTs (`sub = "${userId}|mcp:${grantId}"`, 15 min TTL) minted in Next under a dedicated MCP keypair and verified by Convex via a registered `customJwt` provider fetching our JWKS. Refresh tokens/PATs are opaque, stored hashed, refresh rotated on every use with reuse-detection revoking the whole grant.

**Tech Stack:** Convex 1.42 (+ convex-test), Next.js 16 App Router route handlers, jose (versions pinned by sub-plan 1), Bun, Vitest edge-runtime.

## Global Constraints

- All commands run from `/home/code/fragrances-tracker/my-app`.
- Package manager is **bun**; test with `bun run test:run <path>`; full gate is `bun run typecheck && bun run lint && bun run test:run && bun run build`.
- Branch: `feat/mcp-oauth-foundation` cut from `main` after the spike PR merges. **Install no packages** — sub-plan 1 pinned everything.
- Convex tests use `setupTest()` / `createTestUser()` from `convex/test.setup.ts`; convex + `src/**/*.test.ts` files run in the edge-runtime Vitest project (no Node-only APIs; `crypto.subtle` is available).
- Scope model (locked for v1): every grant/PAT carries the single scope string **`"read write"`**; it is embedded in tokens and stored, but **not enforced per-tool or Convex-side** (epic §10). Do not build scope-checking machinery.
- All secret-bearing responses set `Cache-Control: no-store` + `Pragma: no-cache`.
- OAuth error bodies are always JSON `{ "error": string, "error_description"?: string }` per RFC 6749 §5.2.
- Reconcile every `mcp-handler`-adjacent assumption against the spike findings doc before coding (the findings doc's "Downstream plan corrections" section was supposed to have patched this file already — if a code block here contradicts findings, findings win).
- Commit after every task (`feat:` / `test:` prefixes).

---

### Task 1: Keypair script + env vars

**Files:**
- Create: `my-app/scripts/generate-mcp-keypair.mjs`
- Modify: `my-app/.env.local` (not committed; gitignored)

**Interfaces:**
- Produces: env contract used by every later task —
  - Vercel/Next side: `MCP_JWT_PRIVATE_KEY` (PKCS8 PEM), `NEXT_PUBLIC_APP_URL` (origin, no trailing slash, doubles as JWT issuer), optional `MCP_EXTRA_PUBLIC_JWKS` (JSON array of extra public JWKs — used by sub-plan 5's local-dev strategy).
  - Convex dashboard side: `MCP_JWT_ISSUER` (= app origin), `MCP_JWKS_URL` (= `<origin>/api/oauth/jwks`).

- [ ] **Step 1: Write the generator script** (adapted from the spike's verified jose recipe)

```js
// scripts/generate-mcp-keypair.mjs
// One-off: generates the MCP signing keypair. Run per environment; never commit output.
//   bun scripts/generate-mcp-keypair.mjs
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";

const kid = process.argv[2] ?? "mcp-1";
const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const pkcs8 = await exportPKCS8(privateKey);
const jwk = await exportJWK(privateKey);
for (const f of ["d", "p", "q", "dp", "dq", "qi"]) delete jwk[f];

console.log("── MCP_JWT_PRIVATE_KEY (set in Vercel / .env.local) ──");
console.log(pkcs8);
console.log("── Public JWK (informational; served by /api/oauth/jwks) ──");
console.log(JSON.stringify({ ...jwk, kid, alg: "RS256", use: "sig" }, null, 2));
```

- [ ] **Step 2: Run it and set local env**

```bash
bun scripts/generate-mcp-keypair.mjs
```

Append to `.env.local` (PEM as a quoted multi-line value or with literal `\n`):

```bash
MCP_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

In the Convex **dev** deployment dashboard set `MCP_JWT_ISSUER=http://localhost:3000` and `MCP_JWKS_URL` per sub-plan 5's local-dev decision (Convex Cloud cannot reach localhost — sub-plan 5 Task 1 documents the chosen JWKS hosting; for now the value can point at the future prod JWKS URL, it is only consumed at request-verification time).

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-mcp-keypair.mjs
git commit -m "feat: add MCP keypair generation script"
```

---

### Task 2: Schema — 5 new tables

**Files:**
- Modify: `my-app/convex/schema.ts` (append after `wearLogs`)

**Interfaces:**
- Produces: tables + indexes exactly as below; Tasks 5–7 and sub-plans 3–4 depend on these field names.

- [ ] **Step 1: Append the tables**

```ts
// convex/schema.ts — append inside defineSchema({...}) after wearLogs

  // ── MCP OAuth 2.1 + PAT tables. Secret-bearing fields store SHA-256 hex
  // hashes only; raw values are generated in Next.js and never reach Convex.
  oauthClients: defineTable({
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    tokenEndpointAuthMethod: v.literal("none"),
    createdAt: v.number(),
  }).index("by_client_id", ["clientId"]),

  oauthAuthCodes: defineTable({
    codeHash: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    redirectUri: v.string(),
    codeChallenge: v.string(), // S256 challenge, compared as an opaque string
    scope: v.string(),
    resource: v.optional(v.string()),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_code_hash", ["codeHash"]),

  oauthGrants: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    clientName: v.string(), // denormalized for the settings UI
    scope: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_client", ["userId", "clientId"]),

  oauthRefreshTokens: defineTable({
    tokenHash: v.string(),
    grantId: v.id("oauthGrants"),
    userId: v.id("users"),
    clientId: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    replacedBy: v.optional(v.id("oauthRefreshTokens")), // rotation chain
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_grant", ["grantId"]),

  personalAccessTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"]),
```

- [ ] **Step 2: Verify**

```bash
bun run typecheck && bun run test:run convex/
```

Expected: PASS (existing suites unaffected; `convex-test` picks the schema up automatically).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add OAuth client/code/grant/refresh-token and PAT tables"
```

---

### Task 3: `src/lib/mcp/tokens.ts` — hashing, random tokens, JWT mint, JWKS derivation

**Files:**
- Create: `my-app/src/lib/mcp/tokens.ts`
- Create: `my-app/src/lib/mcp/tokens.test.ts` (edge-runtime project — `.ts`, not `.tsx`)

**Interfaces:**
- Produces (consumed by Tasks 8–10, sub-plan 3's verifier, sub-plan 4's consent action and PAT dialog):
  - `sha256Hex(input: string): Promise<string>`
  - `randomToken(bytes?: number): string` — base64url, default 32 bytes; PATs are `"fgt_" + randomToken()`
  - `randomHex(bytes?: number): string` — default 16; used for `client_id`
  - `mintAccessToken(opts: { userId: string; grantId: string; clientId: string; scope: string; ttlSeconds?: number; privateKeyPem?: string; issuer?: string }): Promise<string>` — `sub = "${userId}|mcp:${grantId}"`, default TTL 900
  - `mintPatBridgeToken(opts: { userId: string; tokenId: string; privateKeyPem?: string; issuer?: string }): Promise<string>` — `sub = "${userId}|pat:${tokenId}"`, TTL 300
  - `getPublicJwks(privateKeyPem?: string): Promise<{ keys: object[] }>` — derived public JWK (+ `MCP_EXTRA_PUBLIC_JWKS` entries appended)
  - Constants: `MCP_JWT_AUDIENCE = "fragrances-mcp"`, `MCP_JWT_KID = "mcp-1"`, `ACCESS_TOKEN_TTL_SECONDS = 900`, `PAT_PREFIX = "fgt_"`
- Key/issuer params default to `process.env.MCP_JWT_PRIVATE_KEY` / `process.env.NEXT_PUBLIC_APP_URL`; tests pass explicit values.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mcp/tokens.test.ts
import { describe, expect, test } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify, createLocalJWKSet } from "jose";
import {
  sha256Hex,
  randomToken,
  randomHex,
  mintAccessToken,
  mintPatBridgeToken,
  getPublicJwks,
  MCP_JWT_AUDIENCE,
} from "./tokens";

const ISSUER = "https://example.test";

async function testPem(): Promise<string> {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return await exportPKCS8(privateKey);
}

describe("sha256Hex", () => {
  test("hashes to the known vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("randomToken / randomHex", () => {
  test("randomToken is base64url and unique", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars
    expect(randomToken()).not.toBe(a);
  });

  test("randomHex is lowercase hex of requested length", () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("mintAccessToken", () => {
  test("mints an RS256 JWT verifiable via the derived JWKS with expected claims", async () => {
    const pem = await testPem();
    const token = await mintAccessToken({
      userId: "user123",
      grantId: "grant456",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: pem,
      issuer: ISSUER,
    });
    const jwks = createLocalJWKSet(await getPublicJwks(pem));
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: MCP_JWT_AUDIENCE,
    });
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.sub).toBe("user123|mcp:grant456");
    expect(payload.client_id).toBe("client789");
    expect(payload.scope).toBe("read write");
    const ttl = (payload.exp as number) - (payload.iat as number);
    expect(ttl).toBe(900);
  });

  test("token signed by one key fails verification against another key's JWKS", async () => {
    const pemA = await testPem();
    const pemB = await testPem();
    const token = await mintAccessToken({
      userId: "u",
      grantId: "g",
      clientId: "c",
      scope: "read write",
      privateKeyPem: pemA,
      issuer: ISSUER,
    });
    const jwksB = createLocalJWKSet(await getPublicJwks(pemB));
    await expect(
      jwtVerify(token, jwksB, { issuer: ISSUER, audience: MCP_JWT_AUDIENCE }),
    ).rejects.toThrow();
  });
});

describe("mintPatBridgeToken", () => {
  test("uses pat-prefixed subject and 300s TTL", async () => {
    const pem = await testPem();
    const token = await mintPatBridgeToken({
      userId: "user123",
      tokenId: "tok789",
      privateKeyPem: pem,
      issuer: ISSUER,
    });
    const jwks = createLocalJWKSet(await getPublicJwks(pem));
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: MCP_JWT_AUDIENCE });
    expect(payload.sub).toBe("user123|pat:tok789");
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
  });
});

describe("getPublicJwks", () => {
  test("contains no private-key fields and carries kid/alg/use", async () => {
    const { keys } = await getPublicJwks(await testPem());
    expect(keys).toHaveLength(1);
    const k = keys[0] as Record<string, unknown>;
    for (const f of ["d", "p", "q", "dp", "dq", "qi"]) expect(k[f]).toBeUndefined();
    expect(k.kid).toBe("mcp-1");
    expect(k.alg).toBe("RS256");
    expect(k.use).toBe("sig");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/mcp/tokens.test.ts`
Expected: FAIL — cannot resolve `./tokens`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mcp/tokens.ts
// Crypto + JWT helpers for the MCP OAuth server. Isomorphic (Web Crypto only):
// runs in Next.js route handlers, server actions, edge-runtime tests, and the
// browser (PAT generation in the settings UI). Convex functions never import
// this — they only ever receive pre-computed hashes.
import { SignJWT, importPKCS8, exportJWK } from "jose";

export const MCP_JWT_AUDIENCE = "fragrances-mcp";
export const MCP_JWT_KID = "mcp-1";
export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
export const PAT_BRIDGE_TTL_SECONDS = 300; // 5 min
export const PAT_PREFIX = "fgt_";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Opaque secret (refresh tokens, auth codes, PAT bodies): base64url, no padding. */
export function randomToken(bytes = 32): string {
  const bin = String.fromCharCode(...randomBytes(bytes));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Public identifiers (client_id): lowercase hex. */
export function randomHex(bytes = 16): string {
  return Array.from(randomBytes(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

async function signingKey(privateKeyPem?: string) {
  const pem = privateKeyPem ?? requireEnv(process.env.MCP_JWT_PRIVATE_KEY, "MCP_JWT_PRIVATE_KEY");
  // Env UIs often store the PEM with literal "\n" — normalize.
  return await importPKCS8(pem.replaceAll("\\n", "\n"), "RS256");
}

async function mint(
  subject: string,
  claims: Record<string, string>,
  ttlSeconds: number,
  privateKeyPem?: string,
  issuer?: string,
): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: MCP_JWT_KID })
    .setSubject(subject)
    .setIssuer(issuer ?? requireEnv(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL"))
    .setAudience(MCP_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(await signingKey(privateKeyPem));
}

/** OAuth access token: `sub = userId|mcp:grantId`, 15 min. Doubles as the Convex credential. */
export async function mintAccessToken(opts: {
  userId: string;
  grantId: string;
  clientId: string;
  scope: string;
  ttlSeconds?: number;
  privateKeyPem?: string;
  issuer?: string;
}): Promise<string> {
  return await mint(
    `${opts.userId}|mcp:${opts.grantId}`,
    { client_id: opts.clientId, scope: opts.scope },
    opts.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS,
    opts.privateKeyPem,
    opts.issuer,
  );
}

/** Short-lived Convex credential minted after a PAT passes hash lookup. */
export async function mintPatBridgeToken(opts: {
  userId: string;
  tokenId: string;
  privateKeyPem?: string;
  issuer?: string;
}): Promise<string> {
  return await mint(
    `${opts.userId}|pat:${opts.tokenId}`,
    { client_id: "personal-access-token", scope: "read write" },
    PAT_BRIDGE_TTL_SECONDS,
    opts.privateKeyPem,
    opts.issuer,
  );
}

/**
 * Public JWKS derived from the private key (private fields stripped), plus any
 * extra public keys from MCP_EXTRA_PUBLIC_JWKS (JSON array) — used to publish a
 * dev keypair's public half alongside prod (see verification sub-plan).
 */
export async function getPublicJwks(privateKeyPem?: string): Promise<{ keys: object[] }> {
  const jwk = (await exportJWK(await signingKey(privateKeyPem))) as Record<string, unknown>;
  for (const f of ["d", "p", "q", "dp", "dq", "qi"]) delete jwk[f];
  const keys: object[] = [{ ...jwk, kid: MCP_JWT_KID, alg: "RS256", use: "sig" }];
  const extra = process.env.MCP_EXTRA_PUBLIC_JWKS;
  if (extra) keys.push(...(JSON.parse(extra) as object[]));
  return { keys };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/lib/mcp/tokens.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tokens.ts src/lib/mcp/tokens.test.ts
git commit -m "feat: add MCP token crypto and JWT helpers"
```

---

### Task 4: `src/lib/mcp/oauth-validation.ts` — redirect URIs, PKCE, safe paths

**Files:**
- Create: `my-app/src/lib/mcp/oauth-validation.ts`
- Create: `my-app/src/lib/mcp/oauth-validation.test.ts`

**Interfaces:**
- Produces (consumed by DCR route, token route, Convex `oauth.ts` defense-in-depth checks, sub-plan 4's authorize page and signin redirect):
  - `isValidRedirectUri(uri: string): boolean` — absolute `https:` URL, or `http:` only for hostname `localhost`/`127.0.0.1` (any port); no URL fragment
  - `matchesRegisteredRedirect(uri: string, registered: string[]): boolean` — **exact string comparison** (RFC 8252 §8.4 style; no prefix or wildcard matching)
  - `computeS256Challenge(codeVerifier: string): Promise<string>` — base64url(SHA-256(ascii(verifier))), no padding (RFC 7636 §4.2)
  - `isSafeInternalPath(path: string): boolean` — begins `/`, not `//`, no `\` (open-redirect guard for `?redirect=`)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mcp/oauth-validation.test.ts
import { describe, expect, test } from "vitest";
import {
  isValidRedirectUri,
  matchesRegisteredRedirect,
  computeS256Challenge,
  isSafeInternalPath,
} from "./oauth-validation";

describe("isValidRedirectUri", () => {
  test.each([
    ["https://claude.ai/api/mcp/auth_callback", true],
    ["https://example.com/cb?flavor=a", true],
    ["http://localhost:33418/callback", true],
    ["http://127.0.0.1:8976/oauth/cb", true],
    ["http://evil.com/cb", false], // http on non-loopback
    ["https://example.com/cb#frag", false], // fragments forbidden (RFC 6749 §3.1.2)
    ["ftp://example.com/cb", false],
    ["not a url", false],
    ["", false],
  ])("%s → %s", (uri, ok) => {
    expect(isValidRedirectUri(uri)).toBe(ok);
  });
});

describe("matchesRegisteredRedirect", () => {
  const registered = ["https://a.example/cb", "http://localhost:1234/cb"];
  test("exact match passes", () => {
    expect(matchesRegisteredRedirect("https://a.example/cb", registered)).toBe(true);
  });
  test.each([
    "https://a.example/cb/extra", // prefix is not enough
    "https://a.example/CB", // case-sensitive
    "https://a.example/cb?x=1", // query must match exactly
    "http://localhost:9999/cb", // different port
  ])("non-exact %s fails", (uri) => {
    expect(matchesRegisteredRedirect(uri, registered)).toBe(false);
  });
});

describe("computeS256Challenge", () => {
  test("matches the RFC 7636 appendix B vector", async () => {
    expect(await computeS256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("isSafeInternalPath", () => {
  test.each([
    ["/", true],
    ["/oauth/authorize?client_id=x&state=y", true],
    ["//evil.com", false],
    ["https://evil.com", false],
    ["/a\\b", false],
    ["", false],
  ])("%s → %s", (path, ok) => {
    expect(isSafeInternalPath(path)).toBe(ok);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/mcp/oauth-validation.test.ts`
Expected: FAIL — cannot resolve `./oauth-validation`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mcp/oauth-validation.ts
// Pure validation helpers for the OAuth server. No env access, no I/O —
// importable from Next routes, server actions, and Convex functions alike.

/** Registered redirect URIs must be https, or http on loopback only. Fragments are forbidden. */
export function isValidRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/** OAuth redirect_uri matching is exact string comparison — no prefixes, no wildcards. */
export function matchesRegisteredRedirect(uri: string, registered: string[]): boolean {
  return registered.includes(uri);
}

/** PKCE S256: base64url(SHA-256(ascii(code_verifier))), unpadded (RFC 7636 §4.2). */
export async function computeS256Challenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const bin = String.fromCharCode(...new Uint8Array(digest));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Guard for `?redirect=` params: same-origin path only, no scheme-relative or backslash tricks. */
export function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/lib/mcp/oauth-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/oauth-validation.ts src/lib/mcp/oauth-validation.test.ts
git commit -m "feat: add OAuth redirect/PKCE/path validation helpers"
```

---

### Task 5: Rate limits for OAuth endpoints

**Files:**
- Modify: `my-app/convex/rateLimits.ts`

**Interfaces:**
- Produces: limit names `oauthRegister` (IP-keyed, 5/hour), `oauthTokenExchange` (IP-keyed, 30/min burst 10), `createApiToken` (user-keyed, 10/hour burst 3) — consumed by Tasks 6–7 via `rateLimiter.limit(ctx, name, { key, throws: true })`.

- [ ] **Step 1: Add the definitions**

In `convex/rateLimits.ts`, change the import to include `HOUR` and append inside the `RateLimiter` config object after the wear-log block:

```ts
import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
```

```ts
  // ── MCP OAuth endpoints (keys are client IPs passed in from Next routes,
  // except createApiToken which is per-user) ────────────────────────────
  oauthRegister: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  oauthTokenExchange: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  createApiToken: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
```

Also extend the doc-comment table at the top of the file with the three new rows, matching its formatting.

- [ ] **Step 2: Verify**

```bash
bun run typecheck && bun run test:run convex/
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/rateLimits.ts
git commit -m "feat: add OAuth endpoint rate limits"
```

---

### Task 6: `convex/oauth.ts` — clients, codes, grants, refresh rotation (test-first)

**Files:**
- Create: `my-app/convex/oauth.ts`
- Create: `my-app/convex/oauth.test.ts`

**Interfaces:**
- Consumes: schema tables (Task 2), rate limits (Task 5), `isValidRedirectUri`/`matchesRegisteredRedirect` from `../src/lib/mcp/oauth-validation` (Task 4 — same cross-import pattern as `wearLogs.ts` importing `../src/lib/constants`).
- Produces (consumed by the DCR/token routes in Tasks 9–10 and sub-plan 4's consent action / settings UI):
  - `registerClient` (public mutation): `{ clientId, clientName, redirectUris, ip }` → `null`; throws `ConvexError({ code: "invalid_redirect_uri" })` on bad URIs
  - `getClientPublic` (public query): `{ clientId }` → `{ clientId, clientName, redirectUris } | null`
  - `createAuthCode` (authed mutation): `{ clientId, redirectUri, codeHash, codeChallenge, scope, resource? }` → `null`
  - `exchangeAuthCode` (public mutation): `{ codeHash, clientId, redirectUri, codeChallenge, refreshTokenHash, ip }` → `{ userId, grantId, scope }`; throws `ConvexError({ code: "invalid_grant", message })`
  - `rotateRefreshToken` (public mutation): `{ tokenHash, newTokenHash, clientId, ip }` → `{ userId, grantId, scope }`; same error shape
  - `listGrants` (authed query): `{}` → `Array<{ _id, clientName, scope, createdAt, lastUsedAt? }>` (active only)
  - `revokeGrant` (authed mutation): `{ grantId }` → `null`
- Error contract: all OAuth-protocol failures throw `ConvexError` whose `.data.code` is an RFC 6749 error code; the token route maps it to the HTTP body. **Public mutations are deliberately callable without auth** (Next calls them server-side unauthenticated); they handle only hashes, throw uniform `invalid_grant`, and are rate-limited — note this in a file-top comment.

- [ ] **Step 1: Write the failing tests**

```ts
// convex/oauth.test.ts
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";

const IP = "203.0.113.7";
const CLIENT = {
  clientId: "abc123abc123abc123abc123abc123ab",
  clientName: "Claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  ip: IP,
};
const REDIRECT = CLIENT.redirectUris[0];
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

type T = ReturnType<typeof setupTest>;

async function mintCode(t: T, as: Awaited<ReturnType<typeof createTestUser>>["as"], codeHash: string) {
  await as.mutation(api.oauth.createAuthCode, {
    clientId: CLIENT.clientId,
    redirectUri: REDIRECT,
    codeHash,
    codeChallenge: CHALLENGE,
    scope: "read write",
  });
}

function exchangeArgs(codeHash: string, overrides: Partial<Record<string, string>> = {}) {
  return {
    codeHash,
    clientId: CLIENT.clientId,
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    refreshTokenHash: "rt-hash-1",
    ip: IP,
    ...overrides,
  };
}

describe("oauth", () => {
  let t: T;
  beforeEach(async () => {
    t = setupTest();
    await t.mutation(api.oauth.registerClient, CLIENT);
  });

  test("registerClient rejects invalid redirect URIs", async () => {
    await expect(
      t.mutation(api.oauth.registerClient, {
        ...CLIENT,
        clientId: "otherotherotherotherotherotherot",
        redirectUris: ["http://evil.com/cb"],
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("getClientPublic returns registered metadata, null for unknown", async () => {
    const client = await t.query(api.oauth.getClientPublic, { clientId: CLIENT.clientId });
    expect(client).toMatchObject({ clientName: "Claude", redirectUris: [REDIRECT] });
    expect(await t.query(api.oauth.getClientPublic, { clientId: "nope" })).toBeNull();
  });

  test("createAuthCode requires auth", async () => {
    await expect(
      t.mutation(api.oauth.createAuthCode, {
        clientId: CLIENT.clientId,
        redirectUri: REDIRECT,
        codeHash: "h",
        codeChallenge: CHALLENGE,
        scope: "read write",
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  test("exchangeAuthCode happy path creates a grant and returns it", async () => {
    const { userId, as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-1");
    const result = await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-1"));
    expect(result.userId).toBe(userId);
    expect(result.scope).toBe("read write");
    const grants = await as.query(api.oauth.listGrants, {});
    expect(grants).toHaveLength(1);
    expect(grants[0].clientName).toBe("Claude");
  });

  test("exchangeAuthCode rejects a wrong PKCE challenge", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-2");
    await expect(
      t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-2", { codeChallenge: "WRONG" })),
    ).rejects.toThrow(ConvexError);
  });

  test("exchangeAuthCode rejects mismatched redirectUri and clientId", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-3");
    await expect(
      t.mutation(
        api.oauth.exchangeAuthCode,
        exchangeArgs("code-hash-3", { redirectUri: "https://claude.ai/other" }),
      ),
    ).rejects.toThrow(ConvexError);
    await expect(
      t.mutation(
        api.oauth.exchangeAuthCode,
        exchangeArgs("code-hash-3", { clientId: "wrongwrongwrongwrongwrongwrongwr" }),
      ),
    ).rejects.toThrow(ConvexError);
  });

  test("a code is single-use; reuse revokes the grant", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-4");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-4"));
    await expect(
      t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-4")),
    ).rejects.toThrow(ConvexError);
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(0);
  });

  test("expired codes are rejected", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-5");
    await t.run(async (ctx) => {
      const code = await ctx.db
        .query("oauthAuthCodes")
        .withIndex("by_code_hash", (q) => q.eq("codeHash", "code-hash-5"))
        .unique();
      await ctx.db.patch(code!._id, { expiresAt: Date.now() - 1 });
    });
    await expect(
      t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-5")),
    ).rejects.toThrow(ConvexError);
  });

  test("refresh rotation works and reuse of a rotated token revokes the whole grant", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-6");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-6"));

    // Rotate rt-hash-1 → rt-hash-2: OK.
    const rotated = await t.mutation(api.oauth.rotateRefreshToken, {
      tokenHash: "rt-hash-1",
      newTokenHash: "rt-hash-2",
      clientId: CLIENT.clientId,
      ip: IP,
    });
    expect(rotated.scope).toBe("read write");

    // Reusing the rotated rt-hash-1 is theft evidence → whole grant dies.
    await expect(
      t.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: "rt-hash-1",
        newTokenHash: "rt-hash-3",
        clientId: CLIENT.clientId,
        ip: IP,
      }),
    ).rejects.toThrow(ConvexError);
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(0);

    // The descendant token is dead too.
    await expect(
      t.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: "rt-hash-2",
        newTokenHash: "rt-hash-4",
        clientId: CLIENT.clientId,
        ip: IP,
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("revokeGrant hides the grant and kills its refresh tokens", async () => {
    const { as } = await createTestUser(t);
    await mintCode(t, as, "code-hash-7");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-7"));
    const [grant] = await as.query(api.oauth.listGrants, {});
    await as.mutation(api.oauth.revokeGrant, { grantId: grant._id });
    expect(await as.query(api.oauth.listGrants, {})).toHaveLength(0);
    await expect(
      t.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: "rt-hash-1",
        newTokenHash: "rt-hash-9",
        clientId: CLIENT.clientId,
        ip: IP,
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("revokeGrant rejects a grant owned by another user", async () => {
    const { as } = await createTestUser(t);
    const { as: asOther } = await createTestUser(t);
    await mintCode(t, as, "code-hash-8");
    await t.mutation(api.oauth.exchangeAuthCode, exchangeArgs("code-hash-8"));
    const [grant] = await as.query(api.oauth.listGrants, {});
    await expect(asOther.mutation(api.oauth.revokeGrant, { grantId: grant._id })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run convex/oauth.test.ts`
Expected: FAIL — `api.oauth` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// convex/oauth.ts
// OAuth 2.1 storage layer. SECURITY MODEL: the *Next.js* routes generate every
// raw secret and hash it; these functions only store/compare hashes and opaque
// strings — no crypto here (Convex's default runtime lacks async crypto.subtle).
// registerClient / exchangeAuthCode / rotateRefreshToken are public mutations
// called server-side without user auth; they are IP-rate-limited, operate only
// on hashes, and fail uniformly with `invalid_grant` so nothing is enumerable.
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getUserId } from "./helpers";
import { rateLimiter } from "./rateLimits";
import { isValidRedirectUri, matchesRegisteredRedirect } from "../src/lib/mcp/oauth-validation";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // RFC 6749 §4.1.2: codes MUST be short-lived
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function invalidGrant(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "invalid_grant", message });
}

async function revokeGrantById(ctx: MutationCtx, grantId: Id<"oauthGrants">): Promise<void> {
  const now = Date.now();
  const grant = await ctx.db.get(grantId);
  if (grant && grant.revokedAt === undefined) {
    await ctx.db.patch(grantId, { revokedAt: now });
  }
  const tokens = await ctx.db
    .query("oauthRefreshTokens")
    .withIndex("by_grant", (q) => q.eq("grantId", grantId))
    .collect();
  await Promise.all(
    tokens
      .filter((t) => t.revokedAt === undefined)
      .map((t) => ctx.db.patch(t._id, { revokedAt: now })),
  );
}

async function findGrantForUserClient(
  ctx: MutationCtx,
  userId: Id<"users">,
  clientId: string,
): Promise<Doc<"oauthGrants"> | null> {
  const grants = await ctx.db
    .query("oauthGrants")
    .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", clientId))
    .collect();
  return grants.find((g) => g.revokedAt === undefined) ?? null;
}

// ── Dynamic client registration (RFC 7591) ───────────────────────────────────

export const registerClient = mutation({
  args: {
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oauthRegister", { key: args.ip, throws: true });
    // Defense in depth: the Next route already validated; never trust one layer.
    if (args.redirectUris.length === 0 || !args.redirectUris.every(isValidRedirectUri)) {
      throw new ConvexError({
        code: "invalid_redirect_uri",
        message: "redirect_uris must be https, or http on localhost only, without fragments.",
      });
    }
    await ctx.db.insert("oauthClients", {
      clientId: args.clientId,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      tokenEndpointAuthMethod: "none",
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getClientPublic = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!client) return null;
    return {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
    };
  },
});

// ── Authorization codes ───────────────────────────────────────────────────────

/** Called (authed) by the consent-page server action after the user approves. */
export const createAuthCode = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeHash: v.string(),
    codeChallenge: v.string(),
    scope: v.string(),
    resource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!client || !matchesRegisteredRedirect(args.redirectUri, client.redirectUris)) {
      throw new ConvexError({ code: "invalid_request", message: "Unknown client or redirect URI." });
    }
    await ctx.db.insert("oauthAuthCodes", {
      codeHash: args.codeHash,
      clientId: args.clientId,
      userId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      scope: args.scope,
      resource: args.resource,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });
    return null;
  },
});

/**
 * Token-endpoint authorization_code grant. Atomically enforces single-use,
 * expiry, client/redirect binding, and PKCE, then upserts the grant and stores
 * the first refresh-token hash. Reuse of a consumed code revokes the grant
 * (RFC 6749 §4.1.2 SHOULD).
 */
export const exchangeAuthCode = mutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    refreshTokenHash: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oauthTokenExchange", { key: args.ip, throws: true });
    const now = Date.now();
    const code = await ctx.db
      .query("oauthAuthCodes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!code) throw invalidGrant("Unknown authorization code.");
    if (code.usedAt !== undefined) {
      const grant = await findGrantForUserClient(ctx, code.userId, code.clientId);
      if (grant) await revokeGrantById(ctx, grant._id);
      throw invalidGrant("Authorization code already used.");
    }
    if (code.expiresAt < now) throw invalidGrant("Authorization code expired.");
    if (code.clientId !== args.clientId) throw invalidGrant("Client mismatch.");
    if (code.redirectUri !== args.redirectUri) throw invalidGrant("redirect_uri mismatch.");
    if (code.codeChallenge !== args.codeChallenge) throw invalidGrant("PKCE verification failed.");

    await ctx.db.patch(code._id, { usedAt: now });

    let grant = await findGrantForUserClient(ctx, code.userId, code.clientId);
    if (grant) {
      await ctx.db.patch(grant._id, { lastUsedAt: now, scope: code.scope });
    } else {
      const client = await ctx.db
        .query("oauthClients")
        .withIndex("by_client_id", (q) => q.eq("clientId", code.clientId))
        .unique();
      const grantId = await ctx.db.insert("oauthGrants", {
        userId: code.userId,
        clientId: code.clientId,
        clientName: client?.clientName ?? code.clientId,
        scope: code.scope,
        createdAt: now,
      });
      grant = (await ctx.db.get(grantId))!;
    }

    await ctx.db.insert("oauthRefreshTokens", {
      tokenHash: args.refreshTokenHash,
      grantId: grant._id,
      userId: code.userId,
      clientId: code.clientId,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
    });

    return { userId: code.userId, grantId: grant._id, scope: code.scope };
  },
});

// ── Refresh-token rotation ────────────────────────────────────────────────────

/**
 * Token-endpoint refresh_token grant. Every use rotates the token; presenting
 * a token that was already rotated or revoked is treated as theft and revokes
 * the entire grant including all descendant tokens.
 */
export const rotateRefreshToken = mutation({
  args: {
    tokenHash: v.string(),
    newTokenHash: v.string(),
    clientId: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "oauthTokenExchange", { key: args.ip, throws: true });
    const now = Date.now();
    const token = await ctx.db
      .query("oauthRefreshTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) throw invalidGrant("Unknown refresh token.");
    if (token.revokedAt !== undefined || token.replacedBy !== undefined) {
      await revokeGrantById(ctx, token.grantId); // reuse detected
      throw invalidGrant("Refresh token reuse detected; grant revoked.");
    }
    if (token.expiresAt < now) throw invalidGrant("Refresh token expired.");
    if (token.clientId !== args.clientId) throw invalidGrant("Client mismatch.");
    const grant = await ctx.db.get(token.grantId);
    if (!grant || grant.revokedAt !== undefined) throw invalidGrant("Grant revoked.");

    const newId = await ctx.db.insert("oauthRefreshTokens", {
      tokenHash: args.newTokenHash,
      grantId: token.grantId,
      userId: token.userId,
      clientId: token.clientId,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
    });
    await ctx.db.patch(token._id, { replacedBy: newId });
    await ctx.db.patch(grant._id, { lastUsedAt: now });

    return { userId: token.userId, grantId: token.grantId, scope: grant.scope };
  },
});

// ── Settings UI ───────────────────────────────────────────────────────────────

export const listGrants = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const grants = await ctx.db
      .query("oauthGrants")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return grants
      .filter((g) => g.revokedAt === undefined)
      .map((g) => ({
        _id: g._id,
        clientName: g.clientName,
        scope: g.scope,
        createdAt: g.createdAt,
        lastUsedAt: g.lastUsedAt,
      }));
  },
});

export const revokeGrant = mutation({
  args: { grantId: v.id("oauthGrants") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.userId !== userId) {
      throw new Error("Grant not found or access denied.");
    }
    await revokeGrantById(ctx, args.grantId);
    return null;
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run convex/oauth.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/oauth.ts convex/oauth.test.ts
git commit -m "feat: add OAuth client/code/grant/refresh Convex layer with rotation reuse detection"
```

---

### Task 7: `convex/apiTokens.ts` — PATs (test-first)

**Files:**
- Create: `my-app/convex/apiTokens.ts`
- Create: `my-app/convex/apiTokens.test.ts`

**Interfaces:**
- Produces (consumed by sub-plan 3's verifier and sub-plan 4's settings UI):
  - `create` (authed mutation): `{ tokenHash, name, expiresAt? }` → `Id<"personalAccessTokens">`; rate-limited `createApiToken` per user; scopes fixed to `["read", "write"]`
  - `validate` (public mutation — mutation, not query, so it can bump `lastUsedAt`): `{ tokenHash }` → `{ userId, tokenId, scopes } | null` (null for unknown/revoked/expired); `lastUsedAt` updated at most every 5 minutes to avoid write amplification
  - `list` (authed query): `{}` → non-revoked `Array<{ _id, name, createdAt, lastUsedAt?, expiresAt? }>`
  - `revoke` (authed mutation): `{ tokenId }` → `null`; ownership-checked

- [ ] **Step 1: Write the failing tests**

```ts
// convex/apiTokens.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestUser, setupTest } from "./test.setup";

type T = ReturnType<typeof setupTest>;

describe("apiTokens", () => {
  let t: T;
  beforeEach(() => {
    t = setupTest();
  });

  test("create + validate round-trip", async () => {
    const { userId, as } = await createTestUser(t);
    const tokenId = await as.mutation(api.apiTokens.create, { tokenHash: "hash-1", name: "CLI" });
    const result = await t.mutation(api.apiTokens.validate, { tokenHash: "hash-1" });
    expect(result).toEqual({ userId, tokenId, scopes: ["read", "write"] });
  });

  test("validate returns null for unknown hashes", async () => {
    expect(await t.mutation(api.apiTokens.validate, { tokenHash: "nope" })).toBeNull();
  });

  test("revoked tokens stop validating and drop out of list", async () => {
    const { as } = await createTestUser(t);
    const tokenId = await as.mutation(api.apiTokens.create, { tokenHash: "hash-2", name: "CLI" });
    await as.mutation(api.apiTokens.revoke, { tokenId });
    expect(await t.mutation(api.apiTokens.validate, { tokenHash: "hash-2" })).toBeNull();
    expect(await as.query(api.apiTokens.list, {})).toHaveLength(0);
  });

  test("expired tokens stop validating", async () => {
    const { as } = await createTestUser(t);
    await as.mutation(api.apiTokens.create, {
      tokenHash: "hash-3",
      name: "short",
      expiresAt: Date.now() - 1,
    });
    expect(await t.mutation(api.apiTokens.validate, { tokenHash: "hash-3" })).toBeNull();
  });

  test("revoke rejects tokens owned by another user", async () => {
    const { as } = await createTestUser(t);
    const { as: asOther } = await createTestUser(t);
    const tokenId = await as.mutation(api.apiTokens.create, { tokenHash: "hash-4", name: "CLI" });
    await expect(asOther.mutation(api.apiTokens.revoke, { tokenId })).rejects.toThrow();
  });

  test("list shows only the caller's active tokens", async () => {
    const { as } = await createTestUser(t);
    const { as: asOther } = await createTestUser(t);
    await as.mutation(api.apiTokens.create, { tokenHash: "hash-5", name: "mine" });
    await asOther.mutation(api.apiTokens.create, { tokenHash: "hash-6", name: "theirs" });
    const mine = await as.query(api.apiTokens.list, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("mine");
  });

  test("create is rate limited per user", async () => {
    const { as } = await createTestUser(t);
    // createApiToken: burst capacity 3.
    for (let i = 0; i < 3; i++) {
      await as.mutation(api.apiTokens.create, { tokenHash: `burst-${i}`, name: `t${i}` });
    }
    await expect(
      as.mutation(api.apiTokens.create, { tokenHash: "burst-overflow", name: "overflow" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run convex/apiTokens.test.ts`
Expected: FAIL — `api.apiTokens` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// convex/apiTokens.ts
// Personal access tokens for header-auth MCP clients (Claude Code, curl).
// Raw token ("fgt_..." format) is generated client/Next-side and shown once;
// only its SHA-256 hex hash reaches Convex.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId } from "./helpers";
import { rateLimiter } from "./rateLimits";

const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const create = mutation({
  args: {
    tokenHash: v.string(),
    name: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await rateLimiter.limit(ctx, "createApiToken", { key: userId, throws: true });
    if (args.name.length === 0 || args.name.length > 100) {
      throw new Error("Token name must be 1-100 characters.");
    }
    return await ctx.db.insert("personalAccessTokens", {
      userId,
      tokenHash: args.tokenHash,
      name: args.name,
      scopes: ["read", "write"],
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
  },
});

/**
 * Called (unauthenticated, server-side) by the MCP bearer verifier. A mutation
 * rather than a query so it can bump lastUsedAt — throttled to one write per
 * 5 minutes per token so hot agents don't burn mutation quota.
 */
export const validate = mutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const token = await ctx.db
      .query("personalAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) return null;
    if (token.revokedAt !== undefined) return null;
    if (token.expiresAt !== undefined && token.expiresAt < now) return null;
    if (token.lastUsedAt === undefined || now - token.lastUsedAt > LAST_USED_UPDATE_INTERVAL_MS) {
      await ctx.db.patch(token._id, { lastUsedAt: now });
    }
    return { userId: token.userId, tokenId: token._id, scopes: token.scopes };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const tokens = await ctx.db
      .query("personalAccessTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return tokens
      .filter((t) => t.revokedAt === undefined)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
      }));
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("personalAccessTokens") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const token = await ctx.db.get(args.tokenId);
    if (!token || token.userId !== userId) {
      throw new Error("Token not found or access denied.");
    }
    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
    return null;
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run convex/apiTokens.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/apiTokens.ts convex/apiTokens.test.ts
git commit -m "feat: add personal access token Convex layer"
```

---

### Task 8: Register the `customJwt` provider in Convex auth config

**Files:**
- Modify: `my-app/convex/auth.config.ts`

**Interfaces:**
- Produces: Convex accepts our RS256 JWTs via `ctx.auth.getUserIdentity()`; `getAuthUserId()` then resolves `sub.split("|")[0]` — the entire existing data layer works unchanged for MCP callers (epic §3.1).

- [ ] **Step 1: Replace the file**

```ts
// convex/auth.config.ts
const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
    // MCP access tokens: RS256 JWTs minted by the Next.js OAuth server under a
    // dedicated keypair. `sub` is "userId|mcp:grantId" or "userId|pat:tokenId",
    // which getAuthUserId() resolves via sub.split("|")[0] — same shape Convex
    // Auth itself uses ("userId|sessionId").
    {
      type: "customJwt",
      applicationID: "fragrances-mcp",
      issuer: process.env.MCP_JWT_ISSUER,
      jwks: process.env.MCP_JWKS_URL,
      algorithm: "RS256",
    },
  ],
};

export default authConfig;
```

- [ ] **Step 2: Verify the dev deployment accepts the config**

With `MCP_JWT_ISSUER` and `MCP_JWKS_URL` set in the Convex dev dashboard (Task 1):

```bash
bunx convex dev --once
```

Expected: deploys without config errors. Then `bun run typecheck && bun run test:run convex/` — PASS (convex-test ignores auth.config).

- [ ] **Step 3: Commit**

```bash
git add convex/auth.config.ts
git commit -m "feat: register MCP customJwt auth provider"
```

---

### Task 9: Metadata + JWKS routes (RFC 8414, RFC 9728) with CORS

**Files:**
- Create: `my-app/src/lib/mcp/cors.ts`
- Create: `my-app/src/app/api/oauth/jwks/route.ts`
- Create: `my-app/src/app/.well-known/oauth-authorization-server/route.ts`
- Create: `my-app/src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts`

**Interfaces:**
- Produces: discovery endpoints agents hit anonymously from browser contexts. CORS contract (all three routes): `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization, mcp-protocol-version`; `OPTIONS` returns 204 with those headers. `src/proxy.ts` needs no change: its matcher `"/((?!.*\\..*|_next).*)"` already skips dotted paths (`.well-known`) and `/api/*` is passed through without redirects.

- [ ] **Step 1: Write the CORS helper**

```ts
// src/lib/mcp/cors.ts
// Agents (claude.ai, ChatGPT) fetch OAuth metadata from browser contexts on
// other origins, so every metadata/token endpoint must answer CORS preflights.
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export function corsJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...OAUTH_CORS_HEADERS,
      ...init.headers,
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export function appOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) throw new Error("Missing required env var NEXT_PUBLIC_APP_URL.");
  return origin.replace(/\/$/, "");
}
```

- [ ] **Step 2: JWKS route**

```ts
// src/app/api/oauth/jwks/route.ts
import { getPublicJwks } from "@/lib/mcp/tokens";
import { corsJson, corsPreflight } from "@/lib/mcp/cors";

export async function GET() {
  return corsJson(await getPublicJwks(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
```

- [ ] **Step 3: Authorization-server metadata (RFC 8414)**

```ts
// src/app/.well-known/oauth-authorization-server/route.ts
import { appOrigin, corsJson, corsPreflight } from "@/lib/mcp/cors";

export function GET() {
  const origin = appOrigin();
  return corsJson({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    jwks_uri: `${origin}/api/oauth/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write"],
  });
}

export function OPTIONS() {
  return corsPreflight();
}
```

- [ ] **Step 4: Protected-resource metadata (RFC 9728), catch-all**

Catch-all because some connectors request `/.well-known/oauth-protected-resource/api/mcp` (path-suffixed variant) — both must answer (epic risk #4).

```ts
// src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts
import { appOrigin, corsJson, corsPreflight } from "@/lib/mcp/cors";

export function GET() {
  const origin = appOrigin();
  return corsJson({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
  });
}

export function OPTIONS() {
  return corsPreflight();
}
```

- [ ] **Step 5: Verify with curl (dev server running)**

```bash
curl -si http://localhost:3000/.well-known/oauth-authorization-server | head -20
curl -si http://localhost:3000/.well-known/oauth-protected-resource/api/mcp | head -20
curl -si http://localhost:3000/api/oauth/jwks | head -20
curl -si -X OPTIONS http://localhost:3000/.well-known/oauth-authorization-server
```

Expected: three 200s with `access-control-allow-origin: *` and the JSON bodies above (JWKS `keys[0]` has `kid: "mcp-1"`, no `d` field); OPTIONS → 204. Also confirm no redirect to `/signin` occurred (middleware bypass works).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/cors.ts src/app/api/oauth/jwks src/app/.well-known
git commit -m "feat: add JWKS and OAuth discovery metadata endpoints"
```

---

### Task 10: Dynamic client registration route (RFC 7591)

**Files:**
- Create: `my-app/src/app/api/oauth/register/route.ts`

**Interfaces:**
- Consumes: `randomHex` (Task 3), `isValidRedirectUri` (Task 4), `api.oauth.registerClient` (Task 6), CORS helper (Task 9).
- Produces: `POST /api/oauth/register` for public clients. Success: **201** `{ client_id, client_name, redirect_uris, token_endpoint_auth_method: "none", grant_types: [...], response_types: ["code"] }`. Errors: **400** `{ error: "invalid_client_metadata" | "invalid_redirect_uri", error_description }`; **429** `{ error: "rate_limited" }` when the IP limit trips.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/oauth/register/route.ts
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import { corsJson, corsPreflight } from "@/lib/mcp/cors";
import { randomHex } from "@/lib/mcp/tokens";
import { isValidRedirectUri } from "@/lib/mcp/oauth-validation";

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function registrationError(error: string, description: string): Response {
  return corsJson({ error, error_description: description }, { status: 400 });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return registrationError("invalid_client_metadata", "Request body must be JSON.");
  }
  const meta = body as { client_name?: unknown; redirect_uris?: unknown };

  const clientName =
    typeof meta.client_name === "string" && meta.client_name.trim().length > 0
      ? meta.client_name.trim().slice(0, 200)
      : null;
  if (!clientName) {
    return registrationError("invalid_client_metadata", "client_name is required.");
  }

  const uris = meta.redirect_uris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every((u) => typeof u === "string" && u.length <= MAX_URI_LENGTH)
  ) {
    return registrationError(
      "invalid_redirect_uri",
      `redirect_uris must be 1-${MAX_REDIRECT_URIS} strings.`,
    );
  }
  const bad = (uris as string[]).find((u) => !isValidRedirectUri(u));
  if (bad) {
    return registrationError(
      "invalid_redirect_uri",
      `Invalid redirect URI (must be https, or http://localhost, no fragment): ${bad}`,
    );
  }

  const clientId = randomHex(16);
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  try {
    await convex.mutation(api.oauth.registerClient, {
      clientId,
      clientName,
      redirectUris: uris as string[],
      ip: clientIp(req),
    });
  } catch (error) {
    if (error instanceof ConvexError) {
      const data = error.data as { code?: string; message?: string };
      if (data.code === "invalid_redirect_uri") {
        return registrationError("invalid_redirect_uri", data.message ?? "Invalid redirect URI.");
      }
      // Rate limiter throws ConvexError with retryAfter.
      return corsJson({ error: "rate_limited" }, { status: 429 });
    }
    throw error;
  }

  return corsJson(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
```

- [ ] **Step 2: Verify with curl (dev server + `bunx convex dev` running)**

```bash
curl -si -X POST http://localhost:3000/api/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test Client","redirect_uris":["http://localhost:6274/oauth/callback"]}'
```

Expected: 201 with a `client_id`. Error paths:

```bash
# bad URI → 400 invalid_redirect_uri
curl -s -X POST http://localhost:3000/api/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"x","redirect_uris":["http://evil.com/cb"]}'
# missing name → 400 invalid_client_metadata
curl -s -X POST http://localhost:3000/api/oauth/register \
  -H "Content-Type: application/json" -d '{"redirect_uris":["https://a.example/cb"]}'
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/oauth/register
git commit -m "feat: add RFC 7591 dynamic client registration endpoint"
```

---

### Task 11: Token endpoint — authorization_code + refresh_token grants

**Files:**
- Create: `my-app/src/app/api/oauth/token/route.ts`

**Interfaces:**
- Consumes: `sha256Hex`/`randomToken`/`mintAccessToken` (Task 3), `computeS256Challenge` (Task 4), `api.oauth.exchangeAuthCode`/`api.oauth.rotateRefreshToken` (Task 6), CORS helper (Task 9).
- Produces: `POST /api/oauth/token` (form-encoded). Success (both grants): **200** `{ access_token, token_type: "Bearer", expires_in: 900, refresh_token, scope }` with `Cache-Control: no-store, Pragma: no-cache`. Error table (all JSON, CORS'd):

| Condition | Status | `error` |
|---|---|---|
| Body not form-encoded / missing required param | 400 | `invalid_request` |
| `grant_type` not `authorization_code`/`refresh_token` | 400 | `unsupported_grant_type` |
| Convex threw `invalid_grant` (bad/expired/reused code, PKCE fail, redirect/client mismatch, reused/revoked/expired refresh token) | 400 | `invalid_grant` |
| IP rate limit tripped | 429 | `rate_limited` |

- [ ] **Step 1: Write the route**

```ts
// src/app/api/oauth/token/route.ts
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import { corsJson, corsPreflight } from "@/lib/mcp/cors";
import { ACCESS_TOKEN_TTL_SECONDS, mintAccessToken, randomToken, sha256Hex } from "@/lib/mcp/tokens";
import { computeS256Challenge } from "@/lib/mcp/oauth-validation";

function tokenError(error: string, description?: string, status = 400): Response {
  return corsJson(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function mapConvexError(error: unknown): Response {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string; retryAfter?: number };
    if (data.code === "invalid_grant") return tokenError("invalid_grant", data.message);
    if (typeof data.retryAfter === "number") return tokenError("rate_limited", undefined, 429);
  }
  throw error;
}

async function successResponse(
  grant: { userId: string; grantId: string; scope: string },
  clientId: string,
  refreshToken: string,
): Promise<Response> {
  const accessToken = await mintAccessToken({
    userId: grant.userId,
    grantId: grant.grantId,
    clientId,
    scope: grant.scope,
  });
  return corsJson(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scope,
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export async function POST(req: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await req.text());
  } catch {
    return tokenError("invalid_request", "Body must be application/x-www-form-urlencoded.");
  }
  const grantType = form.get("grant_type");
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const ip = clientIp(req);

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const codeVerifier = form.get("code_verifier");
    const clientId = form.get("client_id");
    const redirectUri = form.get("redirect_uri");
    if (!code || !codeVerifier || !clientId || !redirectUri) {
      return tokenError(
        "invalid_request",
        "code, code_verifier, client_id and redirect_uri are required.",
      );
    }
    const refreshToken = randomToken();
    try {
      const grant = await convex.mutation(api.oauth.exchangeAuthCode, {
        codeHash: await sha256Hex(code),
        clientId,
        redirectUri,
        codeChallenge: await computeS256Challenge(codeVerifier),
        refreshTokenHash: await sha256Hex(refreshToken),
        ip,
      });
      return await successResponse(grant, clientId, refreshToken);
    } catch (error) {
      return mapConvexError(error);
    }
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    const clientId = form.get("client_id");
    if (!refreshToken || !clientId) {
      return tokenError("invalid_request", "refresh_token and client_id are required.");
    }
    const newRefreshToken = randomToken();
    try {
      const grant = await convex.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: await sha256Hex(refreshToken),
        newTokenHash: await sha256Hex(newRefreshToken),
        clientId,
        ip,
      });
      return await successResponse(grant, clientId, newRefreshToken);
    } catch (error) {
      return mapConvexError(error);
    }
  }

  return tokenError("unsupported_grant_type");
}

export function OPTIONS() {
  return corsPreflight();
}
```

- [ ] **Step 2: Verify error paths with curl (dev server + convex dev running)**

```bash
# unsupported grant type
curl -s -X POST http://localhost:3000/api/oauth/token -d 'grant_type=password'
# → {"error":"unsupported_grant_type"}

# missing params
curl -s -X POST http://localhost:3000/api/oauth/token -d 'grant_type=authorization_code&code=x'
# → {"error":"invalid_request",...}

# unknown code → invalid_grant
curl -s -X POST http://localhost:3000/api/oauth/token \
  -d 'grant_type=authorization_code&code=bogus&code_verifier=bogusverifierbogusverifierbogusverifier123&client_id=x&redirect_uri=https://a.example/cb'
# → {"error":"invalid_grant",...}

# unknown refresh token → invalid_grant
curl -s -X POST http://localhost:3000/api/oauth/token \
  -d 'grant_type=refresh_token&refresh_token=bogus&client_id=x'
# → {"error":"invalid_grant",...}
```

The happy path needs a consent page to mint a code — that is sub-plan 4; end-to-end token verification happens in sub-plan 5.

- [ ] **Step 3: Full gate + commit**

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
git add src/app/api/oauth/token
git commit -m "feat: add OAuth token endpoint with PKCE code and rotating refresh grants"
```

---

### Task 12: PR

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/mcp-oauth-foundation
gh pr create --title "feat: OAuth 2.1 + PAT token foundation for MCP server" --body "Sub-plan 2/5 of docs/mcp-server-plan.md (issue #65): tables, crypto/JWT helpers, Convex OAuth+PAT layer (test-first: single-use codes, PKCE mismatch, rotation reuse revocation, PAT revocation), customJwt provider, JWKS/metadata/DCR/token endpoints with exact RFC 6749 error semantics + CORS.

Not yet wired: consent UI (sub-plan 4) and MCP tools (sub-plan 3) — token endpoint error paths curl-verified, happy path lands with sub-plan 4.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
