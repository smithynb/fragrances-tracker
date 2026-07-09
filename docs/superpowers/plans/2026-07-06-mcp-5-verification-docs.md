# MCP Sub-plan 5/5: Verification + Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Epic:** `docs/mcp-server-plan.md` (issue #65). Sub-plan 5 of 5. Requires sub-plans 2–4 merged and deployed to the Vercel production app + Convex prod deployment.

**Goal:** Prove the whole system end to end — local JWKS strategy, scripted endpoint tests, MCP inspector flow, Claude Code in both auth modes, production claude.ai/ChatGPT connectors — and write the operator/user documentation.

**Architecture:** Verification-only plus docs; the single code artifact is a curl smoke script. The local-dev JWKS problem (Convex Cloud cannot fetch `localhost`) is solved by a **dedicated dev keypair whose public half is published in the production JWKS** via the `MCP_EXTRA_PUBLIC_JWKS` env hook built in sub-plan 2 — an explicit, documented tradeoff: only public key material is shared, the dev private key never leaves the developer machine, and prod rejects dev-signed tokens because the issuer claim differs.

**Tech Stack:** bash + curl + python3 (assertions), `@modelcontextprotocol/inspector`, Claude Code CLI, claude.ai / ChatGPT connector UIs.

## Global Constraints

- All commands run from `/home/code/fragrances-tracker/my-app` unless stated otherwise.
- Branch: `feat/mcp-verification-docs` cut from `main` after sub-plan 4 merges.
- Never paste raw tokens (PATs, refresh tokens, access tokens) into files, commits, or issue comments. Keys generated for prod stay in Vercel/Convex env UIs only.
- CI parity gate before the PR: `bun run typecheck && bun run lint && bun run test:run && bun run build`.
- Record every manual verification's outcome (pass/fail + date) in the PR description checklist, not in the repo.

---

### Task 1: Local-dev JWKS strategy — dev keypair published via prod JWKS

**Files:**
- Modify: env vars only (Vercel prod, Convex dev deployment, `.env.local`) — the `MCP_EXTRA_PUBLIC_JWKS` mechanism already exists in `src/lib/mcp/tokens.ts#getPublicJwks` (sub-plan 2 Task 3).

**Interfaces:**
- Produces: a working local loop — locally-minted JWTs verify in the Convex **dev** deployment — plus the documented tradeoff for Task 6's README section.

- [ ] **Step 1: Generate a dedicated dev keypair**

```bash
bun scripts/generate-mcp-keypair.mjs mcp-dev-1
```

- Private PEM → `.env.local` `MCP_JWT_PRIVATE_KEY` (dev only; never in Vercel).
- Public JWK (it already carries `kid: "mcp-dev-1"`) → copy for the next step.

- [ ] **Step 2: Publish the dev public key in the prod JWKS**

In Vercel env for the production app, set:

```
MCP_EXTRA_PUBLIC_JWKS=[{"kty":"RSA","n":"...","e":"AQAB","kid":"mcp-dev-1","alg":"RS256","use":"sig"}]
```

Redeploy, then confirm both keys are served:

```bash
curl -s https://<prod-app>/api/oauth/jwks | python3 -c "import json,sys; print([k['kid'] for k in json.load(sys.stdin)['keys']])"
# expected: ['mcp-1', 'mcp-dev-1']
```

- [ ] **Step 3: Point the Convex dev deployment at it**

Convex **dev** dashboard env: `MCP_JWT_ISSUER=http://localhost:3000`, `MCP_JWKS_URL=https://<prod-app>/api/oauth/jwks`.

Why this is safe (goes verbatim into the README in Task 6): the JWKS contains only public keys; the dev private key never leaves the developer's machine; a dev-signed token presented to **prod** Convex fails because prod's `customJwt` provider requires `iss = https://<prod-app>` while dev tokens carry `iss = http://localhost:3000`. Alternative if publishing the dev key is unacceptable: run `cloudflared tunnel --url http://localhost:3000` and use the tunnel URL as both issuer and JWKS host (re-set env each run — quick tunnels get random hostnames).

- [ ] **Step 4: Verify the local loop**

Re-run sub-plan 3 Task 5's PAT smoke curl against `localhost` — `get_collection_stats` must return real data, proving dev-minted bridge JWTs verify in Convex dev.

---

### Task 2: Scripted endpoint smoke tests

**Files:**
- Create: `my-app/scripts/oauth-smoke.sh`

**Interfaces:**
- Produces: one command asserting the OAuth surface of any deployment. Usage: `./scripts/oauth-smoke.sh <base-url> [revoked-pat]`.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Smoke-tests the MCP OAuth surface. Usage:
#   ./scripts/oauth-smoke.sh http://localhost:3000 [revoked-pat]
# Pass a *revoked* PAT as $2 to also assert the 401 path for dead tokens.
set -euo pipefail
BASE="${1:?usage: oauth-smoke.sh <base-url> [revoked-pat]}"
REVOKED_PAT="${2:-}"
PASS=0; FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok   $1"; else FAIL=$((FAIL+1)); echo "FAIL $1 (expected $2, got $3)"; fi
}
json_field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1',''))"; }
status_of() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

# ── Discovery metadata ──
check "AS metadata 200" 200 "$(status_of "$BASE/.well-known/oauth-authorization-server")"
check "PRM root 200" 200 "$(status_of "$BASE/.well-known/oauth-protected-resource")"
check "PRM path-suffixed 200" 200 "$(status_of "$BASE/.well-known/oauth-protected-resource/api/mcp")"
check "JWKS 200" 200 "$(status_of "$BASE/api/oauth/jwks")"
check "metadata CORS" "*" "$(curl -s -D - -o /dev/null "$BASE/.well-known/oauth-authorization-server" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
check "metadata OPTIONS 204" 204 "$(status_of -X OPTIONS "$BASE/.well-known/oauth-authorization-server")"
check "JWKS has no private fields" "" "$(curl -s "$BASE/api/oauth/jwks" | python3 -c "import json,sys; print(''.join(f for k in json.load(sys.stdin)['keys'] for f in ('d','p','q') if f in k))")"

# ── DCR ──
REG=$(curl -s -X POST "$BASE/api/oauth/register" -H "Content-Type: application/json" \
  -d '{"client_name":"smoke-test","redirect_uris":["http://localhost:9999/cb"]}')
CID=$(echo "$REG" | json_field client_id)
check "DCR returns client_id" "yes" "$([ -n "$CID" ] && echo yes || echo no)"
check "DCR bad URI rejected" "invalid_redirect_uri" "$(curl -s -X POST "$BASE/api/oauth/register" \
  -H "Content-Type: application/json" -d '{"client_name":"x","redirect_uris":["http://evil.com/cb"]}' | json_field error)"

# ── Token endpoint error semantics ──
check "unsupported grant type" "unsupported_grant_type" \
  "$(curl -s -X POST "$BASE/api/oauth/token" -d 'grant_type=password' | json_field error)"
check "missing params invalid_request" "invalid_request" \
  "$(curl -s -X POST "$BASE/api/oauth/token" -d 'grant_type=authorization_code&code=x' | json_field error)"
check "bogus code invalid_grant" "invalid_grant" \
  "$(curl -s -X POST "$BASE/api/oauth/token" \
    -d "grant_type=authorization_code&code=bogus&code_verifier=bogusverifierbogusverifierbogusverifier1234&client_id=$CID&redirect_uri=http://localhost:9999/cb" | json_field error)"
check "bogus refresh invalid_grant" "invalid_grant" \
  "$(curl -s -X POST "$BASE/api/oauth/token" -d "grant_type=refresh_token&refresh_token=bogus&client_id=$CID" | json_field error)"
check "token no-store" "no-store" \
  "$(curl -s -D - -o /dev/null -X POST "$BASE/api/oauth/token" -d 'grant_type=password' | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"

# ── MCP endpoint auth ──
MCP_ARGS=(-X POST "$BASE/api/mcp" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')
check "MCP unauthenticated 401" 401 "$(status_of "${MCP_ARGS[@]}")"
check "401 advertises resource metadata" "yes" \
  "$(curl -s -D - -o /dev/null "${MCP_ARGS[@]}" | grep -qi 'www-authenticate.*resource_metadata' && echo yes || echo no)"
if [ -n "$REVOKED_PAT" ]; then
  check "revoked PAT 401" 401 "$(status_of "${MCP_ARGS[@]}" -H "Authorization: Bearer $REVOKED_PAT")"
fi

echo; echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run it locally and fix anything red**

```bash
chmod +x scripts/oauth-smoke.sh
./scripts/oauth-smoke.sh http://localhost:3000
```

Expected: `failed=0`. Then create a PAT in `/settings/connections`, revoke it, and re-run with it as `$2` to cover the revoked-PAT 401.

- [ ] **Step 3: Manual single-use-code check (not scriptable — needs browser consent)**

Run sub-plan 4 Task 2 Step 3's browser flow to get a fresh `code`, exchange it once (200), exchange the same body again → `invalid_grant`, then confirm in `/settings/connections` that the grant was revoked (reuse defense). Reconnect afterwards.

- [ ] **Step 4: Commit**

```bash
git add scripts/oauth-smoke.sh
git commit -m "test: add OAuth endpoint smoke script"
```

---

### Task 3: MCP inspector end-to-end (local)

No files — checklist. Dev server + `bunx convex dev` running, Task 1 strategy applied.

- [ ] `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL `http://localhost:3000/api/mcp`, click Connect with auth enabled.
- [ ] Observe the full flow: 401 → metadata discovery → DCR → browser opens `/oauth/authorize` (sign in if needed — verifies the `?redirect=` passthrough) → consent card shows "Inspector" client name + your email → Approve → inspector shows connected.
- [ ] Tools tab lists all 12 tools with descriptions.
- [ ] Call `get_collection_stats` → real totals. Call `add_bottle` (`{"name":"Inspector Test"}`) → returns `bottleId`; verify it appears in the web app; `delete_bottle` it.
- [ ] Call `get_bottle` with `{"bottleId":"garbage"}` → `isError` result with a readable message, not a protocol error.
- [ ] `/settings/connections` shows the inspector grant; revoke it; inspector's next call after token expiry (≤15 min) fails; note observed behavior.

---

### Task 4: Claude Code — both auth modes (local or prod)

No files — checklist.

- [ ] OAuth mode:

```bash
claude mcp add --transport http fragrances https://<app-domain>/api/mcp
```

In a Claude Code session run `/mcp`, complete the browser OAuth flow, then prompt: *"Using the fragrances tools, summarize my collection."* Confirm `get_collection_stats` / `get_collection_snapshot` fire and the summary is grounded in real data.

- [ ] PAT mode: create a PAT in `/settings/connections`, then:

```bash
claude mcp remove fragrances
claude mcp add --transport http fragrances https://<app-domain>/api/mcp \
  --header "Authorization: Bearer fgt_<token>"
```

Prompt: *"Log that I wore <bottle name> today, 3 sprays."* Confirm the wear log appears in the web app (this exercises `list_bottles` → `add_wear_log` and the per-user write rate limits).

- [ ] Revoke that PAT in settings; the next tool call returns 401 within one request (PAT lookup is per-request, but a live 5-min bridge JWT may let one in-flight call through — note actual behavior).

---

### Task 5: Production connectors — claude.ai + ChatGPT

No files — checklist. Prod Vercel + Convex prod env vars set (`MCP_JWT_PRIVATE_KEY`, `NEXT_PUBLIC_APP_URL` / `MCP_JWT_ISSUER`, `MCP_JWKS_URL`); `./scripts/oauth-smoke.sh https://<app-domain>` green first.

- [ ] claude.ai → Settings → Connectors → Add custom connector → `https://<app-domain>/api/mcp`. Complete OAuth. Prompt: *"What should I wear tonight? Consider what I've worn recently."* — confirm insight tools fire and the consent grant shows in `/settings/connections`.
- [ ] ChatGPT → Settings → Connectors (developer mode) → add `https://<app-domain>/api/mcp`. Complete OAuth. Same prompt. Record any connector quirks hit (path-suffixed PRM, CORS, redirect URIs — epic risk #4) and, if code changes were needed, file them as issues rather than hot-fixing unreviewed.
- [ ] Revoke both grants from settings and confirm both connectors lose access after access-token expiry (≤15 min).

---

### Task 6: README + epic close-out

**Files:**
- Modify: `README.md` (repo root — add an "MCP server: connect your AI agent" section)
- Modify: `docs/mcp-server-plan.md` (mark sub-plans complete)

- [ ] **Step 1: Write the README section**

Content requirements (write it, don't stub it):

1. **What it is** — remote MCP server at `https://<app-domain>/api/mcp`, streamable HTTP, OAuth 2.1 + PATs, 12 tools (CRUD + insights).
2. **Connect from claude.ai / ChatGPT** — the two connector UIs, paste the URL, approve consent.
3. **Connect from Claude Code** — both `claude mcp add` commands from Task 4 verbatim.
4. **PATs** — created in Settings → Connections, `fgt_` prefix, shown once, revocable; sent as a Bearer header.
5. **Operator setup** — env var table:

| Var | Where | Value |
|---|---|---|
| `MCP_JWT_PRIVATE_KEY` | Vercel + `.env.local` | PKCS8 PEM from `bun scripts/generate-mcp-keypair.mjs` |
| `NEXT_PUBLIC_APP_URL` | Vercel + `.env.local` | App origin; doubles as JWT issuer |
| `MCP_EXTRA_PUBLIC_JWKS` | Vercel (optional) | JSON array of extra public JWKs (dev-key strategy) |
| `MCP_JWT_ISSUER` | Convex dashboard | = app origin of that environment |
| `MCP_JWKS_URL` | Convex dashboard | JWKS URL reachable from Convex Cloud |

6. **Local development** — Task 1's dev-keypair strategy, verbatim including the why-this-is-safe paragraph and the cloudflared alternative.
7. **Key rotation** — generate a new keypair with a new `kid`, serve **both** public keys via `MCP_EXTRA_PUBLIC_JWKS` while tokens signed by the old key can still exist (access ≤15 min, PAT bridge ≤5 min), switch `MCP_JWT_PRIVATE_KEY`, drop the old public key after 24 h.

- [ ] **Step 2: Update the epic**

In `docs/mcp-server-plan.md`, mark the sub-plan checklist (added when the plans were forked) complete and note any deviations discovered during verification.

- [ ] **Step 3: Gate, commit, PR, close the issue**

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
git add README.md ../docs/mcp-server-plan.md scripts/oauth-smoke.sh
git commit -m "docs: MCP connection guide, env/rotation docs, verification close-out"
git push -u origin feat/mcp-verification-docs
gh pr create --title "docs: MCP server verification + connection docs" --body "Sub-plan 5/5 of docs/mcp-server-plan.md (issue #65). Includes smoke script; PR checklist records inspector/Claude Code/claude.ai/ChatGPT verification results. Closes #65.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Fill the PR body with the Task 3–5 checklists and their observed results before requesting review.
