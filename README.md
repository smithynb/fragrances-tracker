# 🌸 Fragrances Tracker

A web app to manage your fragrance collection and usage.

---

## Tech Stack

| Layer                     | Technology                        |
| ------------------------- | --------------------------------- |
| Framework                 | [Next.js](https://nextjs.org/)    |
| Database                  | [Convex](https://www.convex.dev/) |
| Runtime & Package Manager | [Bun](https://bun.sh/)            |
| Auth                      | [Convex Auth](https://labs.convex.dev/auth) |

---

## Prerequisites

Make sure you have the following installed before setting up the project:

- **[Bun](https://bun.sh/)** >= 1.0 — used as the package manager and runtime
- **Node.js** >= 20 — required by some Next.js internals

---

## Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/your-username/fragrances-tracker.git
cd fragrances-tracker
```

**2. Install dependencies**

```bash
cd my-app
bun install
```

**3. Start the development server**

```bash
bun dev
```

Before using Google sign-in, configure Convex Auth for your deployment:

- `SITE_URL`
- `JWT_PRIVATE_KEY`
- `JWKS`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

Then register your Google OAuth redirect URI as:

```text
https://<your-convex-deployment>.convex.site/api/auth/callback/google
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

---

## Tests

Vitest covers the code that exists currently in `my-app/`.

Run tests from inside `my-app/`:

```bash
bun run test
bun run test:run
```

The current suite includes:

- `convex/bottles.test.ts` for bottle CRUD, validation, ownership checks, and cascade delete behavior
- `convex/wearLogs.test.ts` for wear-log CRUD, validation, ownership checks, and aggregation
- `src/lib/bottle-collection-sort.test.ts` for collection sorting and filtering

The test harness is wired through `my-app/vitest.config.mts` and `my-app/convex/test.setup.ts`:

- Vitest runs in the `edge-runtime` environment
- Convex modules are loaded through `convex-test`
- rate-limiter test registration is set up in the shared test bootstrap

e2e / Playwright: WIP.

---

## Available Scripts

All scripts should be run from inside the `my-app/` directory.

| Script        | Description                           |
| ------------- | ------------------------------------- |
| `bun dev` | Starts the local development server |
| `bun run convex` | Starts the local Convex dev process |
| `bun run test` | Runs Vitest in watch mode |
| `bun run test:run` | Runs the Vitest suite once |
| `bun run build` | Creates an optimized production build |
| `bun run start` | Runs the production build locally |
| `bun run lint` | Runs ESLint across the project |

---

## MCP server: connect your AI agent

The app exposes a remote **[Model Context Protocol](https://modelcontextprotocol.io) server** at
`https://<app-domain>/api/mcp` (streamable HTTP, stateless). Connect your own AI agent to read and
update your collection and to get insight-shaped data for one-shot analysis. Auth is **OAuth 2.1**
(for claude.ai / ChatGPT / Claude Code) plus **personal access tokens** (for header-based CLI
clients). Twelve tools are exposed: CRUD over bottles and wear logs, plus `list_wear_logs`,
`get_collection_stats`, and `get_collection_snapshot`. Insights are computed by the connecting
agent — the server does no LLM calls.

### Connect from claude.ai or ChatGPT

- **claude.ai** → Settings → Connectors → *Add custom connector* → paste `https://<app-domain>/api/mcp`
  → complete the Google sign-in and approve the consent screen.
- **ChatGPT** (developer mode) → Settings → Connectors → *Add* → same URL → approve.

Then ask e.g. *"What should I wear tonight? Consider what I've worn recently."*

### Connect from Claude Code

OAuth mode (opens a browser to approve):

```bash
claude mcp add --transport http fragrances https://<app-domain>/api/mcp
```

PAT mode (header auth, no browser):

```bash
claude mcp add --transport http fragrances https://<app-domain>/api/mcp \
  --header "Authorization: Bearer fgt_<token>"
```

### Personal access tokens (PATs)

Create them in **Settings → Connections**. A PAT is prefixed `fgt_`, **shown exactly once** at
creation (only its SHA-256 hash is stored), and revocable anytime. Send it as
`Authorization: Bearer fgt_…`. Revoke it in the same screen; the next request fails within one
call.

### Operator setup

Generate the signing keypair once per environment:

```bash
cd my-app && bun scripts/generate-mcp-keypair.mjs
```

| Var | Where | Value |
|---|---|---|
| `MCP_JWT_KID` | Vercel + `.env.local` | Key ID passed to the generator; must identify `MCP_JWT_PRIVATE_KEY` |
| `MCP_JWT_PRIVATE_KEY` | Vercel + `.env.local` | PKCS8 PEM from the generator script |
| `NEXT_PUBLIC_APP_URL` | Vercel + `.env.local` | App origin; doubles as the JWT issuer |
| `MCP_EXTRA_PUBLIC_JWKS` | Vercel (optional) | JSON array of extra public JWKs (dev-key strategy below) |
| `MCP_JWT_ISSUER` | Convex dashboard | = the app origin of that environment |
| `MCP_JWKS_URL` | Convex dashboard | JWKS URL **reachable from Convex Cloud** |

Smoke-test any deployment's OAuth surface:

```bash
./my-app/scripts/oauth-smoke.sh https://<app-domain>
```

### Local development

Convex Cloud verifies MCP access tokens by fetching `MCP_JWKS_URL`, and it **cannot reach
`localhost`**. Resolve it with a dedicated dev keypair whose *public* half is published in the
**production** JWKS:

1. `bun scripts/generate-mcp-keypair.mjs mcp-dev-1` — put the private PEM in `.env.local`'s
   `MCP_JWT_PRIVATE_KEY` (dev machine only; never in Vercel). Copy the printed public JWK.
2. Add that public JWK to Vercel's `MCP_EXTRA_PUBLIC_JWKS` (a JSON array) and redeploy. Confirm both
   keys are served: `curl -s https://<prod-app>/api/oauth/jwks` shows `kid` `mcp-1` and `mcp-dev-1`.
3. In the Convex **dev** dashboard set `MCP_JWT_ISSUER=http://localhost:3000` and
   `MCP_JWKS_URL=https://<prod-app>/api/oauth/jwks`.

**Why this is safe:** the JWKS contains only public key material; the dev private key never leaves
your machine; and a dev-signed token presented to **production** Convex is rejected because prod's
`customJwt` provider requires `iss = https://<prod-app>` while dev tokens carry
`iss = http://localhost:3000`.

**Alternative** (if publishing the dev key is unacceptable): run
`cloudflared tunnel --url http://localhost:3000` and use the tunnel URL as both `NEXT_PUBLIC_APP_URL`
(so minted tokens carry that issuer) and the Convex `MCP_JWT_ISSUER` / `MCP_JWKS_URL`. Quick tunnels
get a fresh random hostname each run, so re-set these env vars per session.

### Key rotation

1. Generate a new keypair with a **new `kid`**.
2. Serve **both** public keys via `MCP_EXTRA_PUBLIC_JWKS` so tokens signed by the old key still
   verify (access tokens live ≤15 min, PAT bridge tokens ≤5 min).
3. Atomically switch `MCP_JWT_PRIVATE_KEY` and `MCP_JWT_KID` to the new pair. New tokens use the
   new `kid`; already-issued tokens continue matching the old public JWK.
4. After 24 h — well past every old token's expiry — drop the old public key from
   `MCP_EXTRA_PUBLIC_JWKS`.

---

## License

This project is licensed under the [MIT License](LICENSE).
