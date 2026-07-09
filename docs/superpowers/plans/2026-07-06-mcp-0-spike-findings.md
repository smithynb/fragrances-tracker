# MCP Spike Findings (sub-plan 0 — consumed by sub-plans 2–4)

## Pinned versions
| Package | Resolved version |
|---|---|
| mcp-handler | 1.1.0 |
| @modelcontextprotocol/sdk | 1.26.0 |
| zod | **4.3.6** (see zod finding below — `^3` breaks the build) |
| jose | 6.2.3 |

**Notes:**
- `mcp-handler@1.1.0` declares an **exact** non-optional peer `@modelcontextprotocol/sdk@1.26.0`. Installing `zod jose` alongside first pulled sdk `1.29.0` (bun warned: `incorrect peer dependency`). Downgraded sdk to `1.26.0` to match the peer and avoid two sdk instances in the module graph.
- zod was first pinned at `^3` (resolved 3.25.76) per the epic, but that **fails typecheck** — see the zod-version finding under "API surface". Re-pinned to `^4` (resolved 4.3.6), which the sdk peer `"^3.25 || ^4.0"` allows.

## API surface (each answer cites a node_modules path)

### mcp-handler (`node_modules/mcp-handler/dist/index.d.ts`)

1. **`createMcpHandler`** = re-export of `createMcpRouteHandler(initializeServer, serverOptions?, config?)` (`index.d.ts:121,209`). Setup callback receives an SDK `McpServer`. `Config` keys (`index.d.ts:45-106`): `basePath` ✓, `maxDuration` ✓ (default 60), `verboseLogs` ✓ (default false), `redisUrl?` (**optional**, defaults to `REDIS_URL`/`KV_URL` env), `onEvent?`, `disableSse?`, `sessionIdGenerator?: undefined`, plus deprecated `streamableHttpEndpoint`/`sseEndpoint`/`sseMessageEndpoint`. **Redis is NOT required → stateless streamable-HTTP works with an empty/omitted `redisUrl`.** Epic assumption holds.
5. **`withMcpAuth(handler, verifyToken, opts)`** (`index.d.ts:128-142`). `verifyToken: (req: Request, bearerToken?: string) => AuthInfo | undefined | Promise<AuthInfo | undefined>`. Opts: `required?`, `resourceMetadataPath?`, `requiredScopes?`, `resourceUrl?`. Exported as both `withMcpAuth` and `experimental_withMcpAuth` (`index.d.ts:209`) — epic's `withMcpAuth` name is valid. Also augments global `Request` with `auth?: AuthInfo` (`index.d.ts:123-127`). Runtime 401 shape → Task 4.
6. **Metadata helpers EXIST** (`index.d.ts:157-207`): `protectedResourceHandler({authServerUrls, resourceUrl?})`, `generateProtectedResourceMetadata({authServerUrls, resourceUrl, additionalMetadata?})`, `metadataCorsOptionsRequestHandler()`, plus `getPublicOrigin(req)`/`getPublicUrl(req)`. **Correction vs epic risk #3: the RFC 9728 protected-resource route need NOT be hand-rolled — use `protectedResourceHandler` + `metadataCorsOptionsRequestHandler`.** (No helper for RFC 8414 authorization-server metadata — that route stays hand-rolled.)

### @modelcontextprotocol/sdk (`node_modules/@modelcontextprotocol/sdk/dist/esm/...`)

2. **Registration: use `registerTool`.** Every `server.tool(...)` overload is `@deprecated Use registerTool instead` (`server/mcp.d.ts:110-146`). Non-deprecated: `registerTool(name, config, cb)` (`server/mcp.d.ts:150-157`). **Correction: epic §3.4 uses `server.tool(name, desc, shape, cb)` (deprecated) — switch to `registerTool`.**
3. **`registerTool` config** (`server/mcp.d.ts:150-157`): `{ title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }`. `inputSchema` is a zod **raw shape object** (`ZodRawShapeCompat`, e.g. `{ message: z.string() }`) — **not** `z.object(...)`. Callback arg is `ShapeOutput<Args>` (`server/mcp.d.ts:250`).
4. **Tool callback = `(args, extra)`** where `extra: RequestHandlerExtra` carrying `authInfo?: AuthInfo` (`shared/protocol.d.ts:181`) → destructure `(args, { authInfo }) => …`. `AuthInfo` (`server/auth/types.d.ts`): `token`, `clientId`, `scopes: string[]`, `expiresAt?`, `resource?: URL`, **`extra?: Record<string, unknown>`** (passthrough field present in the type; runtime survival → Task 4).
7. **`CallToolResult`** (`types.d.ts:2491-2593`): `content: [{type:"text", text:string} | image | audio | …]`, optional `isError?: boolean`, optional `structuredContent?`. Epic's `{ content:[{type:"text",text}], isError? }` return is accepted.
8. **Route export:** handler is `(request: Request) => Promise<Response>` → `export { authed as GET, authed as POST }`. Stateless is the default (`sessionIdGenerator?: undefined`); no `DELETE` export needed (no session teardown in stateless streamable HTTP). SSE can be turned off via `disableSse: true`.

### ⚠️ zod version (BLOCKER FOUND — corrects epic + this sub-plan Task 1)

**`zod@^3` (resolved 3.25.76) breaks the build:** `registerTool` (and the deprecated `tool()`) both raise `TS2589: Type instantiation is excessively deep and possibly infinite` under `tsc 5.9.3` + `@modelcontextprotocol/sdk@1.26.0`. Reproduced with the canonical raw-shape form, the deprecated form, and an explicitly-typed shape — the deep instantiation is inside the SDK's own `zod-compat` generic machinery, not our call site. zod 3.25.x is the heavy "bridge" release.

**Fix: pin `zod@^4` (resolved 4.3.6).** The SDK peer is `"^3.25 || ^4.0"`, so v4 is supported; the canonical `registerTool(name, {description, inputSchema:{...}}, cb)` then typechecks and builds clean. zod was not previously an app dependency (only the MCP surface uses it) → no cross-cutting risk. **Downstream: sub-plans 2–3 must author zod schemas with the v4 API** (watch `.nullable()` clearables, error/message options which changed from v3).

### Walking-skeleton route behavior (Task 3, `src/app/api/[transport]/route.ts`)

Dynamic `[transport]` segment + `basePath: "/api"` serves **`POST /api/mcp`**. Verified via curl against `bun dev` (no auth yet):

- `tools/list` → **HTTP 200**, `content-type: text/event-stream`. Body is SSE-framed even for a one-shot POST: `event: message\ndata: {"result":{"tools":[…]},"jsonrpc":"2.0","id":1}`. **No prior `initialize` call and no `mcp-session-id` header required** in stateless mode. The zod shape is surfaced as JSON Schema draft-07 (`{type:"object",properties:{message:{type:"string"}},required:["message"]}`), and each tool carries `execution.taskSupport:"forbidden"`.
- `tools/call` `ping{message:"hi"}` → `data: {"result":{"content":[{"type":"text","text":"pong: hi"}]},"jsonrpc":"2.0","id":2}`.
- Clients MUST send `Accept: application/json, text/event-stream` (the SDK negotiates SSE framing).
- MCP inspector (Task 3 step 4) not run — headless session, no browser; curl exercises the same JSON-RPC transport.

### `withMcpAuth` runtime behavior (Task 4)

Wrapped the handler with `withMcpAuth(handler, verifyStub, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource" })` and a stub verifier accepting only `Bearer test-token`.

- **401 path (no/invalid bearer):** `HTTP/1.1 401 Unauthorized` with
  `www-authenticate: Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"`.
  The header **includes `resource_metadata="…"`** pointing at `<origin>` + the configured `resourceMetadataPath` → epic discovery-flow step 1 works as designed. Origin is derived from proxy headers / request URL (`getPublicOrigin`).
- **`authInfo.extra` PASSTHROUGH: PASS.** The tool callback received `authInfo.extra` intact: the `ping` echo returned `{"pong":"hi","extra":{"userId":"spike-user","convexToken":"spike-jwt"}}`. **The WeakMap fallback in the plan is NOT needed** — `verify-token.ts` can return `extra:{userId,convexToken}` and tool handlers read it directly via `(args, { authInfo }) => (authInfo!.extra as McpExtra)`.
- Verifier signature confirmed at runtime: `(req: Request, bearerToken?: string) => AuthInfo | undefined | Promise<...>`; returning `undefined` yields the 401 above.

### jose RS256 sign/verify with local JWKS (Task 5, `scripts/spike-jose.mjs`)

End-to-end recipe validated (epic §3.1 token strategy, minus Convex): `generateKeyPair('RS256',{extractable:true})` → `exportPKCS8` → round-trip `importPKCS8` → `exportJWK` (strip `d,p,q,dp,dq,qi`, add `kid/alg/use`) → `SignJWT(...).sign()` → `createLocalJWKSet` → `jwtVerify`. Final: `VERIFIED user123|mcp:grant456 spike read write`.

**⚠️ Recipe correction (jose v6.2.3):** `importPKCS8(pkcs8, 'RS256')` returns a **non-extractable** `CryptoKey`, so the subsequent `exportJWK(signingKey)` throws `TypeError: non-extractable CryptoKey cannot be exported as a JWK`. Fix used and **required in sub-plan 2's `tokens.ts`**: `importPKCS8(pkcs8, 'RS256', { extractable: true })`. (Alternative for the app: derive the public JWK once at key-generation time and store it separately, so the runtime signing key can stay non-extractable — cleaner key hygiene. Either works; extractable-import is the minimal change.)

## Downstream plan corrections

| # | Assumption (epic/sub-plans) | Verified reality | Edit target |
|---|---|---|---|
| C1 | `zod@^3` (epic §6, this sub-plan Task 1) | `3.25.76` raises `TS2589` with sdk 1.26 `registerTool`; **`zod@^4` (4.3.6) builds clean** | epic §6 packages; sub-plans 2–3 author schemas with zod v4 API |
| C2 | Tool registration `server.tool(name, desc, shape, cb)` (epic §3.4) | `tool()` is `@deprecated` AND also TS2589-prone; **use `server.registerTool(name, {description, inputSchema:{…}}, cb)`** | epic §3.4 code block; sub-plan 3 |
| C3 | sdk "latest" implied | mcp-handler peer pins **exact `@modelcontextprotocol/sdk@1.26.0`**; pin it, don't float | epic §6; sub-plan 1 (done) |
| C4 | Metadata routes "hand-roll" (epic risk #3) | Helpers ship: **`protectedResourceHandler` + `metadataCorsOptionsRequestHandler` + `generateProtectedResourceMetadata`**. Use them for the RFC 9728 route. RFC 8414 auth-server metadata has NO helper → still hand-rolled | epic §6 / risk #3; sub-plan 4 metadata routes |
| C5 | `authInfo.extra` might not survive → WeakMap fallback (sub-plan 1 Task 4) | **`extra` survives passthrough** to tool callback. No WeakMap needed | sub-plan 3 `verify-token.ts` contract |
| C6 | jose recipe `importPKCS8(pkcs8, alg)` (sub-plan 1 Task 5, epic §3.1) | Returns **non-extractable** key → `exportJWK` throws. Need **`importPKCS8(pkcs8, 'RS256', { extractable: true })`** (or derive public JWK at keygen) | sub-plan 2 `tokens.ts` |
| C7 | Response body shape unspecified | Stateless streamable HTTP returns **`content-type: text/event-stream`** (SSE-framed `event: message\ndata: {...}`); clients MUST send `Accept: application/json, text/event-stream`; no `initialize`/`mcp-session-id` prereq | epic §8 curls already include the Accept header — no change, just noted |
| C8 | 401 `WWW-Authenticate` must carry `resource_metadata` (epic flow step 1) | Confirmed verbatim: `Bearer error="invalid_token", …, resource_metadata="<origin>/.well-known/oauth-protected-resource"` | none (matches) |

**Net:** two hard blockers fixed (C1 zod, C6 jose), one deprecation switch (C2), one nice-to-have (C4 helpers reduce hand-rolled code), one de-risk (C5 no WeakMap). Auth flow + token strategy validated end to end minus Convex.
