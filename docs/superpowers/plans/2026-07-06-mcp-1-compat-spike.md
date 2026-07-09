# MCP Sub-plan 1/5: mcp-handler Compatibility Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Epic:** `docs/mcp-server-plan.md` (issue #65). This is sub-plan 1 of 5 and MUST run first — its findings can change route/tool/auth details in sub-plans 2–4.

**Goal:** Pin the MCP dependency stack, verify every `mcp-handler` / MCP SDK / jose API assumption the epic makes, and record the verified facts in a findings doc that downstream sub-plans reconcile against.

**Architecture:** Throwaway-ish spike on a branch: install deps, read the installed package's types (not web docs), stand up a minimal `/api/mcp` route with one `ping` tool, probe auth wiring and metadata helpers with curl + MCP inspector, and probe jose RS256 sign/verify. Deliverables that merge to main: `package.json` dep pins + the findings doc. The scaffold route stays on the branch as reference for sub-plan 3.

**Tech Stack:** Next.js 16.2.6 (App Router), Bun 1.3.10, `mcp-handler`, `@modelcontextprotocol/sdk`, `zod@^3`, `jose`.

## Global Constraints

- All commands run from `/home/code/fragrances-tracker/my-app` unless stated otherwise.
- Package manager is **bun**: `bun add`, `bun run typecheck`, `bun run lint`, `bun run test:run`, `bun run build`.
- Work on branch `spike/mcp-handler` cut from `main`.
- **Read the installed package, not memory or web docs.** Every answer in the findings doc must cite a file path inside `node_modules/`.
- The findings doc lives at `docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md` (numbered 0 so it sorts before the sub-plans that consume it).
- Do not touch Convex files in this sub-plan. No schema changes, no auth.config changes.
- Commit after every task (`chore:` / `docs:` prefixes).

---

### Task 1: Install and pin dependencies

**Files:**
- Modify: `my-app/package.json`
- Create: `docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md` (skeleton)

**Interfaces:**
- Produces: exact pinned versions of `mcp-handler`, `@modelcontextprotocol/sdk`, `zod`, `jose` — every later sub-plan installs nothing and relies on these pins.

- [ ] **Step 1: Create the spike branch**

```bash
git checkout -b spike/mcp-handler
```

- [ ] **Step 2: Install the four packages**

```bash
cd /home/code/fragrances-tracker/my-app
bun add mcp-handler @modelcontextprotocol/sdk zod@^3 jose
```

Note: `zod` must stay on major 3 — `@modelcontextprotocol/sdk` declares a zod v3 peer range. If bun resolves zod 4, force `zod@^3.25` explicitly.

- [ ] **Step 3: Record resolved versions**

```bash
bun pm ls | grep -E "mcp-handler|@modelcontextprotocol/sdk|zod|jose"
```

Create the findings doc skeleton with the output:

```markdown
# MCP Spike Findings (sub-plan 0 — consumed by sub-plans 2–4)

## Pinned versions
| Package | Resolved version |
|---|---|
| mcp-handler | <fill from bun pm ls> |
| @modelcontextprotocol/sdk | <fill> |
| zod | <fill> |
| jose | <fill> |

## API surface (each answer cites a node_modules path)
(filled by Tasks 2–5)

## Downstream plan corrections
(filled by Task 6)
```

- [ ] **Step 4: Verify the repo still builds with the new deps**

```bash
bun run typecheck && bun run build
```

Expected: both pass (no source uses the new packages yet).

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock ../docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md
git commit -m "chore: pin mcp-handler, mcp sdk, zod, jose for MCP spike"
```

---

### Task 2: Audit the installed `mcp-handler` API surface

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md`

**Interfaces:**
- Produces: answered checklist below. Sub-plan 3 writes `src/app/api/[transport]/route.ts` and `src/lib/mcp/verify-token.ts` directly from these answers.

- [ ] **Step 1: Locate the type declarations**

```bash
ls node_modules/mcp-handler/dist/
cat node_modules/mcp-handler/package.json | grep -A5 '"exports"'
```

- [ ] **Step 2: Answer every question below by reading the `.d.ts` / source files; paste exact signatures into the findings doc**

Checklist (each row becomes a findings entry with the copied signature and file path):

1. `createMcpHandler` — exact signature: order and types of (server-setup callback, server options, handler config). Which config keys exist: `basePath`? `maxDuration`? `verboseLogs`? Redis-related keys and whether they are optional (epic assumes stateless, no Redis).
2. Tool registration — does the `server` passed to the setup callback expose `registerTool(name, {description, inputSchema}, cb)`, `tool(name, description, shape, cb)`, or both? Which is non-deprecated in the pinned SDK version? The epic §3.4 uses `server.tool(...)`; the reviewer flagged current docs show `registerTool(...)`. **Record the one to use.**
3. `inputSchema` shape — does the chosen registration method take a zod **raw shape object** (`{ name: z.string() }`) or a `z.object(...)`? Cite the type.
4. Tool callback — exact second-arg type. Confirm `authInfo` is present and locate the `AuthInfo` type: fields `token`, `clientId`, `scopes`, `expiresAt?`, `extra?`. Confirm `extra` is a passthrough `Record<string, unknown>` that survives from the verifier to the tool callback.
5. `withMcpAuth` — exact signature: (handler, verifier, options). Verifier return type (`AuthInfo | undefined | Promise<...>`?). Options: `required`, `resourceMetadataPath`, anything else. What HTTP response does it emit on missing/invalid token — status and exact `WWW-Authenticate` header shape.
6. Metadata helpers — do `protectedResourceHandler` / `metadataCorsOptionsRequestHandler` (or similarly named exports) exist? Signatures. If absent, record "hand-roll metadata routes" (epic risk #3 already accepts this).
7. Return type of tool callbacks — confirm `{ content: [{type: "text", text: string}], isError?: boolean }` is accepted; cite the `CallToolResult` type.
8. Route export shape — what the README/types say about `export { handler as GET, handler as POST }` and whether DELETE is needed for streamable HTTP session teardown in stateless mode.

- [ ] **Step 3: Commit**

```bash
git add ../docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md
git commit -m "docs: record mcp-handler API audit in spike findings"
```

---

### Task 3: Walking-skeleton MCP route with a `ping` tool (no auth)

**Files:**
- Create: `my-app/src/app/api/[transport]/route.ts`

**Interfaces:**
- Produces: verified route shape (dynamic `[transport]` segment serving `/api/mcp`) and verified JSON-RPC request/response behavior, recorded in findings.

- [ ] **Step 1: Write the minimal route**

Use the registration method Task 2 selected. If Task 2 chose `registerTool`:

```ts
// src/app/api/[transport]/route.ts
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "ping",
      {
        description: "Health check. Echoes the message back.",
        inputSchema: { message: z.string() },
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `pong: ${message}` }],
      }),
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: true },
);

export { handler as GET, handler as POST };
```

(Adjust to the exact signatures Task 2 recorded — that is the point of the spike.)

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: PASS. If the epic's assumed config keys (`basePath`, `maxDuration`) fail, record the corrected keys in findings.

- [ ] **Step 3: Exercise with curl (dev server running: `bun dev` in one terminal)**

```bash
curl -si -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Record in findings: HTTP status, content type (JSON vs `text/event-stream`), whether a prior `initialize` call or `mcp-session-id` header is required in stateless mode, and the exact body shape. Then:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{"message":"hi"}}}'
```

Expected: a result containing `pong: hi`. Record actual behavior either way.

- [ ] **Step 4: Exercise with the MCP inspector**

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:3000/api/mcp` with transport "Streamable HTTP". Verify `ping` is listed and callable. Record any quirks (e.g. required headers).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/
git commit -m "chore: walking-skeleton MCP route with ping tool (spike)"
```

---

### Task 4: Probe `withMcpAuth` — 401 shape and `authInfo.extra` passthrough

**Files:**
- Modify: `my-app/src/app/api/[transport]/route.ts`

**Interfaces:**
- Produces: verified 401 + `WWW-Authenticate` behavior and verified `authInfo.extra` availability inside tool callbacks. Sub-plan 3's `verify-token.ts` contract depends on this.

- [ ] **Step 1: Wrap the handler with a stub verifier**

```ts
// additions to src/app/api/[transport]/route.ts
import { withMcpAuth } from "mcp-handler";

const verifyStub = async (_req: Request, bearer?: string) => {
  if (bearer !== "test-token") return undefined;
  return {
    token: bearer,
    clientId: "spike-client",
    scopes: ["read", "write"],
    extra: { userId: "spike-user", convexToken: "spike-jwt" },
  };
};

const authed = withMcpAuth(handler, verifyStub, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST };
```

(Remove the previous bare export. Adjust option names to Task 2 findings.)

Also change the `ping` tool callback to echo auth info, so passthrough is observable:

```ts
async ({ message }, { authInfo }) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify({ pong: message, extra: authInfo?.extra ?? null }),
    },
  ],
}),
```

- [ ] **Step 2: Verify the 401 path**

```bash
curl -si -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: HTTP 401. Record the exact `WWW-Authenticate` header value (the epic's discovery flow step 1 depends on it containing `resource_metadata="..."`).

- [ ] **Step 3: Verify the authed path and `extra` passthrough**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer test-token" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{"message":"hi"}}}'
```

Expected: result text contains `"extra":{"userId":"spike-user","convexToken":"spike-jwt"}`. Record PASS/FAIL and the actual shape in findings. **If `extra` does not survive, the fallback design (record it): stash the verified info in a request-scoped WeakMap keyed by the token string, looked up inside tool handlers.**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ ../docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md
git commit -m "chore: probe withMcpAuth 401 + authInfo.extra passthrough (spike)"
```

---

### Task 5: Probe jose RS256 sign/verify with a local JWKS

**Files:**
- Create: `my-app/scripts/spike-jose.mjs`

**Interfaces:**
- Produces: verified recipe for (a) generating an RSA keypair, (b) exporting a public JWK by stripping private fields, (c) signing a JWT with `kid`, (d) verifying via `createLocalJWKSet`. Sub-plan 2's `tokens.ts` and JWKS route copy this recipe verbatim.

- [ ] **Step 1: Write the probe script**

```js
// scripts/spike-jose.mjs
import { generateKeyPair, exportPKCS8, exportJWK, SignJWT, jwtVerify, createLocalJWKSet, importPKCS8 } from "jose";

const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const pkcs8 = await exportPKCS8(privateKey);

// Round-trip through PKCS8 the way the app will (env var → importPKCS8).
const signingKey = await importPKCS8(pkcs8, "RS256");

// Public JWK = private JWK minus private fields.
const jwk = await exportJWK(signingKey);
delete jwk.d; delete jwk.p; delete jwk.q; delete jwk.dp; delete jwk.dq; delete jwk.qi;
const publicJwk = { ...jwk, kid: "mcp-1", alg: "RS256", use: "sig" };

const token = await new SignJWT({ client_id: "spike", scope: "read write" })
  .setProtectedHeader({ alg: "RS256", kid: "mcp-1" })
  .setSubject("user123|mcp:grant456")
  .setIssuer("http://localhost:3000")
  .setAudience("fragrances-mcp")
  .setIssuedAt()
  .setExpirationTime("15m")
  .sign(signingKey);

const jwks = createLocalJWKSet({ keys: [publicJwk] });
const { payload } = await jwtVerify(token, jwks, {
  issuer: "http://localhost:3000",
  audience: "fragrances-mcp",
});
console.log("VERIFIED", payload.sub, payload.client_id, payload.scope);
```

- [ ] **Step 2: Run it**

```bash
bun scripts/spike-jose.mjs
```

Expected: `VERIFIED user123|mcp:grant456 spike read write`. Record PASS in findings (this validates the epic §3.1 token strategy end to end, minus Convex).

- [ ] **Step 3: Commit**

```bash
git add scripts/spike-jose.mjs
git commit -m "chore: probe jose RS256 sign/verify with local JWKS (spike)"
```

---

### Task 6: Finalize findings and reconcile downstream plans

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-mcp-0-spike-findings.md`
- Possibly modify: `docs/mcp-server-plan.md`, sub-plans 2–4

**Interfaces:**
- Produces: a "Downstream plan corrections" section listing every place where reality differed from the epic's assumptions, plus the edits applied.

- [ ] **Step 1: Fill the "Downstream plan corrections" section**

For each divergence found in Tasks 2–5 (tool registration method, config keys, 401 header shape, `extra` passthrough, metadata helpers), write one line: *assumption → verified reality → which sub-plan/section to edit*.

- [ ] **Step 2: Apply the edits to the epic and sub-plans 2–4**

Edit the affected code blocks in `docs/mcp-server-plan.md` §3.3/§3.4 and in sub-plans 2–4 so no downstream worker inherits a falsified assumption.

- [ ] **Step 3: Run repo checks**

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
```

Expected: all pass.

- [ ] **Step 4: Commit and open the spike PR**

```bash
git add -A
git commit -m "docs: finalize MCP spike findings and reconcile sub-plans"
git push -u origin spike/mcp-handler
gh pr create --title "MCP spike: pin deps + verified mcp-handler/jose findings" --body "Sub-plan 1/5 of docs/mcp-server-plan.md (issue #65). Merges dep pins + findings doc; scaffold route stays as reference for sub-plan 3.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Note for the merger: `package.json`/`bun.lock`, the findings doc, and plan edits are the mergeable payload. `src/app/api/[transport]/route.ts` and `scripts/spike-jose.mjs` may merge too (harmless: route requires the stub token, script is inert) or be dropped in review — sub-plans 2–3 rewrite both.
