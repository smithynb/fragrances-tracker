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
| `MCP_JWT_PRIVATE_KEY` | Vercel + `.env.local` | PKCS8 PEM from the generator script |
| `NEXT_PUBLIC_APP_URL` | Vercel + `.env.local` | App origin; doubles as the JWT issuer |
| `MCP_EXTRA_PUBLIC_JWKS` | Vercel (optional) | Same-environment rotation keys; production must never include dev/staging keys |
| `MCP_JWT_ISSUER` | Convex dashboard | = the app origin of that environment |
| `MCP_JWKS_URL` | Convex dashboard | JWKS URL **reachable from Convex Cloud** |

Smoke-test any deployment's OAuth surface:

```bash
./my-app/scripts/oauth-smoke.sh https://<app-domain>
```

### Local development

Convex Cloud verifies MCP access tokens by fetching `MCP_JWKS_URL`, and it **cannot reach
`localhost`**. Never publish a development public key in the production JWKS: every key listed
there is authorized to mint production tokens, regardless of where its private half is stored.

Use one of these non-production workflows:

1. **Tunnel (preferred):** generate a development keypair, run
   `cloudflared tunnel --url http://localhost:3000`, and use the tunnel origin for
   `NEXT_PUBLIC_APP_URL`, development Convex's `MCP_JWT_ISSUER`, and
   `<tunnel-origin>/api/oauth/jwks` for `MCP_JWKS_URL`. Quick-tunnel hostnames change between
   sessions, so update all three together.
2. **Stable staging JWKS:** publish the development public key only through a staging deployment's
   `MCP_EXTRA_PUBLIC_JWKS`, and point development Convex at that staging JWKS. This grants the dev
   key access to staging, so staging must contain no production data or credentials.

`MCP_EXTRA_PUBLIC_JWKS` in production is reserved for overlapping **production** keys during
rotation. It must never contain staging or development keys.

### Environment key ownership

| Environment | Private key storage                   | Public-key trust                                      | Convex configuration                              |
| ----------- | ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Production  | Vercel Production variables only      | Production keys only                                  | Production issuer and production JWKS             |
| Staging     | Stable staging/Preview variables only | Staging keys; optional dev keys                       | Staging issuer and staging JWKS                   |
| Development | Developer `.env.local` only           | Tunnel JWKS or explicitly non-production staging JWKS | Development/tunnel issuer and non-production JWKS |

After configuring production, prove that it rejects a development key even when a forged token
claims the production issuer:

```bash
MCP_DEV_JWT_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----…' \
MCP_DEV_JWT_KID=mcp-dev-1 \
bun my-app/scripts/verify-mcp-environment-isolation.mjs https://<prod-app>
```

The probe must print `PASS` with HTTP 401 before the MCP epic is merged.

### Key rotation

1. Generate a new keypair with a **new `kid`**.
2. Serve **both** public keys via `MCP_EXTRA_PUBLIC_JWKS` so tokens signed by the old key still
   verify (access tokens live ≤15 min, PAT bridge tokens ≤5 min).
3. Switch `MCP_JWT_PRIVATE_KEY` to the new private key.
4. After 24 h — well past every old token's expiry — drop the old public key from
   `MCP_EXTRA_PUBLIC_JWKS`.

---

## License

This project is licensed under the [MIT License](LICENSE).
