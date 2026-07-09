# MCP Server Plan (issue #65)

## 1. Context & goals

Issue #65: "Expose CRUD operations and logging via MCP to agents."

Users should be able to connect their own AI agents — claude.ai (web/desktop), Claude Code, ChatGPT, Codex CLI, openclaw/hermes — to a remote MCP server that lets those agents:

1. **CRUD** their bottle collection and wear logs (add a bottle from chat, log a wear, edit, delete).
2. **Get transformative insights** the web app doesn't render: summaries, rotation gaps, seasonal patterns, "what should I wear tonight", cost-per-wear analysis, etc.

Insights are computed by the **connecting agent**, not by us. The server's job is to expose well-shaped data tools so the agent can do one-shot analysis without paging through raw rows. No server-side LLM calls → no per-call AI cost for us.

### Decisions

| Decision | Choice |
|---|---|
| Auth | **Full OAuth 2.1 from day one** (required by claude.ai + ChatGPT connectors) plus personal access tokens (PATs) for header-based CLI clients |
| Hosting | **Next.js route on Vercel** via `mcp-handler` (streamable HTTP, stateless — no Redis, no SSE transport) |
| Tool scope | **CRUD + insight-shaped read tools** (stats, filtered history, compact snapshot); no server-side AI |

### Viability & cost

- **Viable: yes.** One architectural unlock (§3.1) means the entire existing Convex data layer is reused unchanged. The real work is the OAuth 2.1 authorization server, which is well-specified (RFC 6749/7591/8414/9728 + PKCE) and testable endpoint-by-endpoint.
- **Cost: ~zero incremental.** MCP calls = ordinary Vercel serverless invocations + Convex function calls (same free tier the web app uses; Convex free tier is 1M function calls/mo). OAuth access-token verification is a *local* JWT signature check — no DB hit per MCP request. PAT path adds one small indexed Convex query per request. New tables store byte-scale rows. No LLM spend ever. Only at-scale risk is an agent polling aggressively burning quota — the existing per-user rate limiter already covers writes, and we add limits on the OAuth endpoints.
- **Effort: ~4.5–5 focused days** across 6 phases.

## 2. Current state (verified)

- Next.js 16 App Router in `my-app/`, Vercel-hosted, Bun, TypeScript, Tailwind 4.
- Backend: **Convex** (`convex@^1.42`). Tables `bottles` + `wearLogs` (`convex/schema.ts`).
- Auth: **Convex Auth** (`@convex-dev/auth@0.0.91`) with Google OAuth only; browser-session based; `convex/http.ts` mounts only the OAuth callback. No API tokens, no REST surface, no MCP anywhere.
- Data access: `convex/bottles.ts` (list/get/add/update/delete/toggleFavorite) and `convex/wearLogs.ts` (listBottleStats/listWearLogs/listWearLogsByBottle/get/add/update/delete). Every function resolves the caller via `getUserId`/`getOptionalUserId` (`convex/helpers.ts`), verifies ownership via `getOwnedDoc`, applies partial updates via `buildPatch` (`convex/patch.ts`), validates inline (`assertValidBottleInput`, `assertValidWornAt`, …), and rate-limits writes via `convex/rateLimits.ts`.
- Middleware `src/proxy.ts`: only `/` is protected; matcher excludes dotted paths (so `/.well-known/*` bypasses it) and passes `/api/*` through without redirects.
- Tests: Vitest + `convex-test`, edge-runtime env; `convex/test.setup.ts` already fakes identities as `subject: "${userId}|testSession"`.

## 3. Architecture

### 3.1 The key unlock: `customJwt` provider → zero data-layer refactor

Two verified facts drive the whole design:

1. `getAuthUserId()` in `@convex-dev/auth@0.0.91` is literally `identity.subject.split("|")[0]` — no session lookup at query time.
2. Convex supports registering additional **`customJwt` auth providers** (`{type: "customJwt", applicationID, issuer, jwks, algorithm}`) alongside Convex Auth. JWTs from that issuer surface through `ctx.auth.getUserIdentity()` exactly like Convex Auth's own.

So: we mint OAuth access tokens as **RS256 JWTs under a dedicated MCP keypair** (not reusing Convex Auth's `JWT_PRIVATE_KEY` — cleaner key hygiene, no coupling to its rotation), with `sub = "${userId}|mcp:${grantId}"`. Register our issuer + JWKS in `convex/auth.config.ts`. Then MCP tool handlers simply do `ConvexHttpClient.setAuth(accessToken)` and call the **existing public functions unchanged** — `getUserId`, `getOwnedDoc`, all validators, and all rate limits apply automatically.

```ts
// convex/auth.config.ts (after)
const authConfig = {
  providers: [
    { domain: process.env.CONVEX_SITE_URL, applicationID: "convex" },
    {
      type: "customJwt",
      applicationID: "fragrances-mcp",
      issuer: process.env.MCP_JWT_ISSUER,   // https://<app-domain>
      jwks: process.env.MCP_JWKS_URL,       // https://<app-domain>/api/oauth/jwks
      algorithm: "RS256",
    },
  ],
};
```

Access-token claims: `sub = userId|mcp:grantId`, `iss = MCP_JWT_ISSUER`, `aud = "fragrances-mcp"`, `exp` = 15 min, plus `client_id` and `scope`.

Rejected alternatives:
- *Opaque tokens + token-arg Convex functions*: would force a parallel "takes token" variant of every function — max churn, no security win.
- *Reusing Convex Auth's `JWT_PRIVATE_KEY`*: works (fabricated sessionId is never checked) but means copying Convex's signing key into Vercel env and coupling to its internals.

### 3.2 OAuth 2.1 authorization server (lives in the Next.js app)

Everything on one origin (Vercel app domain = issuer = resource host):

```
Agent (claude.ai / ChatGPT / Claude Code)
  │ 1. GET /api/mcp → 401 + WWW-Authenticate → resource metadata
  │ 2. GET /.well-known/oauth-protected-resource[/api/mcp]   (RFC 9728)
  │ 3. GET /.well-known/oauth-authorization-server            (RFC 8414)
  │ 4. POST /api/oauth/register                               (RFC 7591 DCR, public client, no secret)
  │ 5. Browser → /oauth/authorize?...&code_challenge=S256:…
  │      ├─ not signed in → redirect /signin?redirect=… → Google → back
  │      └─ consent page → approve → 302 redirect_uri?code=…
  │ 6. POST /api/oauth/token (code + code_verifier) → { access_token (JWT, 15m),
  │                                                     refresh_token (opaque, rotated) }
  │ 7. MCP requests with Authorization: Bearer <JWT>
  └ 8. POST /api/oauth/token (refresh_token grant) when expired
```

- **PKCE S256 required**; `token_endpoint_auth_method: "none"` (public clients, per MCP spec).
- **Consent page** (`/oauth/authorize`, server component): requires the existing Convex Auth browser session; shows client name (from `oauthClients`) + signed-in email; approval runs a server action that mints the auth code via an authed Convex mutation.
- **Refresh tokens**: opaque, SHA-256-hashed in Convex, **rotated on every use**; reuse of a rotated token revokes the whole grant (stolen-token detection). 90-day expiry.
- **Revocation model**: access tokens expire in 15 min (not individually revocable); grants + refresh tokens + PATs revocable instantly from settings UI.
- **Crypto placement**: Convex's default runtime lacks async `crypto.subtle`, so all hashing/randomness happens in Next.js route handlers; Convex functions only store and compare pre-computed hashes.

### 3.3 Dual-mode bearer verification

`src/lib/mcp/verify-token.ts`, plugged into `withMcpAuth`:

```ts
export async function verifyMcpToken(_req: Request, bearer?: string): Promise<McpAuthInfo | undefined> {
  if (!bearer) return undefined;

  if (bearer.startsWith("fgt_")) {
    // Personal access token: hash → Convex lookup → 5-min bridge JWT
    const tokenHash = await sha256Hex(bearer);
    const pat = await convex.query(api.apiTokens.validate, { tokenHash }); // null if revoked/expired
    if (!pat) return undefined;
    const convexToken = await mintConvexJwt(pat.userId, `pat:${pat.tokenId}`, 300);
    return { token: bearer, clientId: "personal-access-token", scopes: pat.scopes,
             extra: { userId: pat.userId, convexToken } };
  }

  // OAuth access token: local JWT verify, no DB hit; the JWT IS the Convex credential
  const { payload } = await jwtVerify(bearer, await getPublicKey(), {
    issuer: process.env.MCP_JWT_ISSUER, audience: "fragrances-mcp",
  });
  const [userId] = (payload.sub as string).split("|");
  return { token: bearer, clientId: payload.client_id as string,
           scopes: ((payload.scope as string) ?? "").split(" ").filter(Boolean),
           extra: { userId, convexToken: bearer } };
}
```

PAT format: `fgt_` + 32 random bytes base64url. Shown once at creation; only the hash persists.

### 3.4 MCP endpoint

`src/app/api/[transport]/route.ts` → serves `/api/mcp`:

```ts
const handler = createMcpHandler(
  (server) => {
    // NOTE (spike C2): use registerTool, NOT the deprecated server.tool(...) —
    // see docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md.
    server.registerTool("add_bottle",
      { description: "Add a fragrance bottle to the user's collection…", inputSchema: addBottleShape },
      async (args, { authInfo }) => {
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
        convex.setAuth((authInfo!.extra as McpExtra).convexToken);
        const id = await convex.mutation(api.bottles.addBottle, args);
        return { content: [{ type: "text", text: JSON.stringify({ bottleId: id }) }] };
      });
    // …12 more tools, same shape
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

Tool handler errors: catch `ConvexError`/`Error` and return `{ isError: true, content: [{type:"text", text: message}] }` so agents can self-correct (e.g. bad ID, validation bound, rate limit).

## 4. Data model — 5 new Convex tables

| Table | Fields | Indexes | Notes |
|---|---|---|---|
| `oauthClients` | `clientId` (32B hex), `clientName`, `redirectUris: string[]`, `tokenEndpointAuthMethod: "none"`, `createdAt` | `by_client_id` | From DCR. redirect URIs must be `https:` or `http://localhost*` |
| `oauthAuthCodes` | `codeHash`, `clientId`, `userId`, `redirectUri`, `codeChallenge`, `scope`, `resource?`, `expiresAt` (10 min), `usedAt?` | `by_code_hash` | Single-use enforced via `usedAt` |
| `oauthGrants` | `userId`, `clientId`, `clientName` (denormalized), `scope`, `createdAt`, `lastUsedAt?`, `revokedAt?` | `by_user`, `by_user_client` | Backs the settings "Connected apps" list |
| `oauthRefreshTokens` | `tokenHash`, `grantId`, `userId`, `clientId`, `expiresAt` (90 d), `revokedAt?`, `replacedBy?` | `by_token_hash`, `by_grant` | Rotation chain; reuse detection |
| `personalAccessTokens` | `userId`, `tokenHash`, `name`, `scopes`, `createdAt`, `lastUsedAt?`, `expiresAt?`, `revokedAt?` | `by_token_hash`, `by_user` | Header-auth clients |

All secrets stored **hashed only**; raw values returned exactly once.

## 5. Tool surface (13 tools)

### Reusing existing Convex functions unchanged

| Tool | Input schema (zod, mirrors server bounds) | Convex fn |
|---|---|---|
| `list_bottles` | `{}` | `api.bottles.listBottles` |
| `get_bottle` | `{ bottleId: string }` | `api.bottles.getBottle` |
| `add_bottle` | `{ name: 1–200, brand? ≤200, sizeMl? >0 ≤10000, tags? ≤20×≤50, comments? ≤2000 }` | `api.bottles.addBottle` |
| `update_bottle` | same, all optional; clearable fields `.nullable()` (null clears — matches `buildPatch`) + `bottleId` | `api.bottles.updateBottle` |
| `delete_bottle` | `{ bottleId }` (cascades wear logs — say so in description) | `api.bottles.deleteBottle` |
| `toggle_favorite` | `{ bottleId }` | `api.bottles.toggleFavorite` |
| `add_wear_log` | `{ bottleId, wornAt: epoch-ms (description explains ISO→ms), sprays: int 1–100, context? ≤200, rating? 1–10, comment? ≤2000 }` | `api.wearLogs.addWearLog` |
| `update_wear_log` | partial, `.nullable()` clearables + `wearLogId` | `api.wearLogs.updateWearLog` |
| `delete_wear_log` | `{ wearLogId }` | `api.wearLogs.deleteWearLog` |

IDs pass through as opaque strings (Convex `v.id()` validates); descriptions tell agents to get IDs from `list_bottles`. Zod gives early feedback; Convex validators stay authoritative.

### New insight queries — `convex/insights.ts`

| Tool | Input | Behavior |
|---|---|---|
| `list_wear_logs` | `{ bottleId?, from?: ms, to?: ms, limit: int ≤500 = 100 }` | Range query on `by_user_time` / `by_user_bottle_time` (`.gte/.lte` + `.take`) |
| `get_collection_stats` | `{}` | Per-bottle `{name, brand, wears, sprays, avgRating, lastWornAt}` (reuse `listBottleStats` aggregation) + totals: bottle count, total wears/sprays, most/least worn, favorites, unworn bottles |
| `get_collection_snapshot` | `{ recentLogsPerBottle: int ≤20 = 5 }` | Compact full export — every bottle + stats + N recent logs each. Built for one-shot agent analysis (summaries, rotation gaps, seasonal patterns) |

### Rate limits (`convex/rateLimits.ts` additions)

| Limit | Key | Rate |
|---|---|---|
| `oauthRegister` | IP (`x-forwarded-for` passed from route) | ~5/hour |
| `oauthTokenExchange` | IP | ~30/min |
| `createApiToken` | user | small burst |

Existing per-user write limits (addBottle, addWearLog, …) apply to MCP traffic automatically.

## 6. Files

**Packages to add:** `mcp-handler@1.1.0`, `@modelcontextprotocol/sdk@1.26.0` (mcp-handler pins this **exact** peer — do not float), `zod@^4` (spike C1: `zod@^3` triggers `TS2589`), `jose`. Verified pins in `docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md`.

**Env vars:**
- Vercel: `MCP_JWT_PRIVATE_KEY` (PKCS8 PEM), `NEXT_PUBLIC_APP_URL` (origin/issuer).
- Convex dashboard: `MCP_JWT_ISSUER`, `MCP_JWKS_URL`.
- Keypair generated by a one-off documented script (not committed).

```
my-app/convex/
  schema.ts                  (mod) +5 tables
  auth.config.ts             (mod) +customJwt provider
  rateLimits.ts              (mod) +3 limits
  oauth.ts                   (new) registerClient, getClientPublic, createAuthCode (authed),
                                   exchangeAuthCode (single-use + PKCE-hash compare),
                                   rotateRefreshToken (reuse ⇒ revoke grant),
                                   listGrants (authed), revokeGrant (authed)
  apiTokens.ts               (new) create (authed) / validate (by hash) / list / revoke
  insights.ts                (new) listWearLogsFiltered, collectionStats, collectionSnapshot
  oauth.test.ts apiTokens.test.ts insights.test.ts   (new, convex-test)
  crons.ts                   (new, optional) purge expired codes / rotated tokens

my-app/src/app/
  api/[transport]/route.ts                                   (new) MCP endpoint /api/mcp
  api/oauth/register/route.ts                                (new) RFC 7591 DCR
  api/oauth/token/route.ts                                   (new) code + refresh grants, PKCE, JWT mint
  api/oauth/jwks/route.ts                                    (new) public JWKS
  .well-known/oauth-authorization-server/route.ts            (new) RFC 8414 (+CORS/OPTIONS)
  .well-known/oauth-protected-resource/[[...path]]/route.ts  (new) RFC 9728 root + /api/mcp variant
  oauth/authorize/page.tsx (+ consent-form.tsx, actions.ts)  (new) consent screen
  settings/connections/page.tsx (+ client components)        (new) grants + PATs UI

my-app/src/lib/mcp/
  tokens.ts            (new) sha256Hex, randomToken, mintConvexJwt, getPublicKey
  verify-token.ts      (new) dual-mode verifier
  oauth-validation.ts  (new) redirect_uri exact match, PKCE compute, request parsing (+unit tests)

my-app/src/proxy.ts                          (mod) protect /oauth/authorize; keep /api/* passing through
my-app/src/app/signin/page.tsx
my-app/src/components/sign-in-screen.tsx     (mod) honor ?redirect= via signIn("google", { redirectTo })
```

Reused as-is: `getUserId`/`getOwnedDoc` (`convex/helpers.ts`), `buildPatch` (`convex/patch.ts`), inline validators, `rateLimits.ts`, `test.setup.ts` identity helper.

## 7. Execution: sub-plans (~4.5–5 days)

This document is the **epic architecture spec**. Implementation is broken into five executable checkbox plans in `docs/superpowers/plans/` (run in order; 1 must finish first — its findings may correct API assumptions in 2–4; 3 and 4 can run in parallel after 2):

- [x] **1. Compatibility spike (0.5d)** — [`2026-07-06-mcp-1-compat-spike.md`](superpowers/plans/2026-07-06-mcp-1-compat-spike.md) — **done (PR #67).** pin `mcp-handler`/SDK/zod/jose, verify tool-registration API (`registerTool` vs `tool`), `withMcpAuth`/401 shape, `authInfo.extra` passthrough, jose RS256+JWKS recipe. Produces findings doc `2026-07-06-mcp-0-spike-findings.md`.
- [x] **2. OAuth + token foundation (1.5d)** — [`2026-07-06-mcp-2-oauth-foundation.md`](superpowers/plans/2026-07-06-mcp-2-oauth-foundation.md) — **done (PR #68).** tables, crypto/JWT helpers (raw secrets + hashing in Next only; Convex compares hashes), `oauth.ts`/`apiTokens.ts` test-first (single-use codes, PKCE mismatch, rotation reuse revocation, PAT revocation), customJwt provider, JWKS/metadata/DCR/token endpoints with exact RFC 6749 error semantics + CORS.
- [x] **3. Insights + MCP tools (1d)** — [`2026-07-06-mcp-3-insights-mcp-tools.md`](superpowers/plans/2026-07-06-mcp-3-insights-mcp-tools.md) — **done (PR #69).** `insights.ts` (new aggregation — `listBottleStats` lacks `lastWornAt` and stays untouched), dual-mode verifier, zod schemas, `/api/mcp` with 12 tools (13 in §5 double-counts `list_wear_logs`). Scopes carried, not enforced (v1, §10).
- [x] **4. Consent + sign-in redirect + settings UI (1d)** — [`2026-07-06-mcp-4-consent-settings-ui.md`](superpowers/plans/2026-07-06-mcp-4-consent-settings-ui.md) — **done (PR #70).** safe `?redirect=` passthrough (sign-in currently always lands on `/`), `/oauth/authorize` with locked render-vs-bounce error semantics + `state` passthrough, `/settings/connections` (first settings route) + header nav.
- [x] **5. Verification + docs (0.5–1d)** — [`2026-07-06-mcp-5-verification-docs.md`](superpowers/plans/2026-07-06-mcp-5-verification-docs.md) — **done (this PR).** smoke script (`my-app/scripts/oauth-smoke.sh`, 16/16 local), inspector/Claude Code/claude.ai/ChatGPT checklists, local-JWKS strategy (dedicated dev keypair published via `MCP_EXTRA_PUBLIC_JWKS` — no private-key reuse), README + key rotation docs.

### Close-out — deviations found during implementation (all on branch `epic/mcp`)

1. **zod pin (spike C1):** `zod@^3` (3.25.76) raises `TS2589` with sdk 1.26 `registerTool` → repinned **`zod@^4`**.
2. **Tool registration (spike C2):** `server.tool(...)` is deprecated and also TS2589-prone → used `server.registerTool(name, {description, inputSchema}, cb)` throughout.
3. **jose keypair (spike C6):** `importPKCS8` returns a non-extractable key → `exportJWK` throws; `tokens.ts` imports with `{ extractable: true }`.
4. **Convex atomicity (sub-plan 2, security):** reuse-detection did `revoke(); throw` — a throwing Convex mutation rolls back its own writes, so the revocation never persisted (a reused/stolen token would NOT have killed the grant in prod). Fixed: `exchangeAuthCode`/`rotateRefreshToken` **return a `{revoked:true}` sentinel** on reuse (commits the revoke); the token route maps it to 400 `invalid_grant`.
5. **Insights index-range typing (sub-plan 3):** the `let r = q.eq(); r = r.gte()` pattern doesn't typecheck (Convex range-builder bound methods each return a distinct type) → each `withIndex` branches and returns one terminal range per case.
6. **Tool-arg IDs (sub-plan 3):** zod shapes yield `string` IDs but Convex refs want branded `Id<>` → cast each call to its `FunctionArgs` at the boundary (`v.id()` stays authoritative).
7. **Metadata helpers (spike C4):** the RFC 9728 route uses mcp-handler's shipped `protectedResourceHandler`/`metadataCorsOptionsRequestHandler`; only RFC 8414 is hand-rolled.

**Pending manual/operator verification** (needs prod deploy + interactive OAuth, tracked in the sub-plan 5 PR checklist): local JWKS live-loop (§Task 1), MCP inspector flow (Task 3), Claude Code both modes (Task 4), claude.ai + ChatGPT connectors (Task 5). The local-dev authed data path is otherwise blocked only by Convex Cloud not reaching a `localhost` JWKS — resolved by the Task 1 strategy once prod env vars are set.

## 8. Verification

- CI parity in `my-app/`: `bun run typecheck && bun run lint && bun run test:run && bun run build`.
- Endpoint-level: curl the metadata, DCR, and token routes; assert error paths (bad PKCE, reused code, revoked PAT).
- End-to-end local: `bun dev` + `bunx convex dev`; `npx @modelcontextprotocol/inspector` → `http://localhost:3000/api/mcp` (exercises 401 → discovery → DCR → PKCE → consent → tools).
- Claude Code, both auth modes:
  - `claude mcp add --transport http fragrances https://<app>/api/mcp` (OAuth)
  - `claude mcp add --transport http fragrances https://<app>/api/mcp --header "Authorization: Bearer fgt_…"` (PAT)
- Production: claude.ai custom connector + ChatGPT developer-mode connector; run "summarize my collection / what should I wear tonight" prompts and confirm insight tools fire.
- **Local-dev caveat:** Convex Cloud must fetch our JWKS, and localhost is unreachable from it. Options: point the dev deployment's `MCP_JWKS_URL` at the deployed prod JWKS (same keypair), or tunnel (cloudflared). Document the chosen route in README.

## 9. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | `sub = "userId\|…"` split is a Convex Auth internal | Version pinned; repo tests already depend on the format — a breaking bump fails loudly |
| 2 | MCP tokens are full Convex credentials (scopes not enforced Convex-side) | Acceptable now (all functions are user-scoped). Future: enforce `scope` claim via `ctx.auth.getUserIdentity()` custom claims |
| 3 | `mcp-handler` API drift (`withMcpAuth`, metadata helpers) | ~~Verify against installed version~~ **Verified in spike (C4):** `withMcpAuth` present; RFC 9728 route uses shipped `protectedResourceHandler` + `metadataCorsOptionsRequestHandler` helpers. Only RFC 8414 auth-server metadata is hand-rolled |
| 4 | claude.ai/ChatGPT connector quirks (path-suffixed PRM lookups, CORS on metadata, exact redirect URIs) | Catch-all PRM route; CORS + OPTIONS on all metadata; inspector-first testing |
| 5 | Local-dev JWKS reachability | See §8 caveat |
| 6 | DCR spam / abuse | IP rate limits; optional cron purging expired codes + stale unused clients |

## 10. Explicitly out of scope (v1)

- Server-side AI/summaries (agent does it).
- Fine-grained OAuth scopes enforced in Convex (single implicit `read write` scope in v1; claim carried in token for future use).
- MCP resources/prompts primitives — tools only.
- SSE transport (streamable HTTP only; no Redis).
