# MCP Sub-plan 4/5: Consent, Sign-in Redirect + Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Epic:** `docs/mcp-server-plan.md` (issue #65). Sub-plan 4 of 5. Requires sub-plan 2 (OAuth foundation) merged; independent of sub-plan 3 (can run in parallel with it). Completes the OAuth happy path: after this, code → token exchange works end to end.

> **⚠️ Spike corrections (from `2026-07-06-mcp-0-spike-findings.md`):** mostly backend-facing, but note: browser-side PAT generation reuses the isomorphic `tokens.ts` from sub-plan 2 — PAT raw values are random bytes (`randomToken`), unaffected by the jose C6 fix (that applies only to the RS256 keypair export). Any zod schema you add uses **zod@^4** (C1).

**Goal:** Build the human-facing surfaces: sign-in `?redirect=` passthrough (today sign-in always lands on `/`), the `/oauth/authorize` consent page with exact error/redirect semantics, and `/settings/connections` (connected apps + PATs) — the repo's first settings route, linked from the home header.

**Architecture:** The consent page is a server component: it validates the authorization request, then renders a card whose approve/deny buttons are plain `<form action={serverAction}>` — no client JS. The approve action generates the raw code in Next (crypto placement rule), stores only its hash via an authed Convex mutation (`convexAuthNextjsToken()`), and 302s to the client's `redirect_uri`. Settings sections are client components on the existing Convex React providers, reusing `ConfirmDeleteButton`, `Dialog`, and `formatWearDate`. PAT raw values are generated **in the browser** (`tokens.ts` is isomorphic) and shown exactly once.

**Tech Stack:** Next.js 16 App Router (server components + server actions), `@convex-dev/auth` middleware/nextjs helpers, Convex React hooks, Tailwind 4, Vitest + Testing Library (jsdom for `.tsx` tests).

## Global Constraints

- All commands run from `/home/code/fragrances-tracker/my-app`.
- Branch: `feat/mcp-consent-settings` cut from `main` after sub-plan 2 merges. Install no packages.
- Error semantics for `/oauth/authorize` (RFC 6749 §4.1.2.1, locked):
  - Unknown `client_id`, missing/unregistered `redirect_uri` → **render an error card, never redirect** (protects users from open-redirect).
  - Any other invalid parameter (`response_type` ≠ `code`, missing `code_challenge`, `code_challenge_method` ≠ `S256`) → **302 to `redirect_uri`** with `error` (+ `error_description`) and `state` passed through verbatim.
  - Approval → 302 `redirect_uri?code=...` + `state` verbatim. Denial → 302 with `error=access_denied` + `state`.
- `redirect_uri` matching is **exact string equality** against the registered list (`matchesRegisteredRedirect`).
- Scope: consent always grants the fixed `"read write"` (v1 decision, epic §10) regardless of the requested `scope` param.
- UI conventions: kebab-case filenames, named exports, `"use client"` only where interactive, `cn()` from `@/lib/utils`, styling consistent with `sign-in-screen.tsx` / `home-page.tsx` (surface cards, `font-display` headings, `text-text-secondary` metadata).
- `.tsx` tests run in jsdom; mock Convex hooks with `vi.mock("convex/react")` like the existing component suites (see `src/components/bottle-detail.test.tsx` for the pattern).
- Full gate before PR: `bun run typecheck && bun run lint && bun run test:run && bun run build`.
- Commit after every task (`feat:` / `test:` prefixes).

---

### Task 1: Sign-in `?redirect=` passthrough + middleware protection

**Files:**
- Modify: `my-app/src/proxy.ts`
- Modify: `my-app/src/app/signin/page.tsx`
- Modify: `my-app/src/components/sign-in-screen.tsx`

**Interfaces:**
- Consumes: `isSafeInternalPath` from `@/lib/mcp/oauth-validation` (sub-plan 2 Task 4 — pure, edge-safe, fine to import in middleware).
- Produces: visiting a protected non-`/` route unauthenticated → `/signin?redirect=<encoded path+query>`; after Google sign-in the user lands back on that path; an already-authenticated user hitting `/signin?redirect=...` is forwarded to the target. Protected routes now: `/`, `/oauth/authorize`, `/settings(.*)`. Unsafe redirect values silently fall back to `/`.

- [ ] **Step 1: Update the middleware**

Replace the body of `src/proxy.ts` lines 7–21 with:

```ts
import { isSafeInternalPath } from "@/lib/mcp/oauth-validation";

const isSignInPage = createRouteMatcher(["/signin"]);
const isProtectedRoute = createRouteMatcher(["/", "/oauth/authorize", "/settings(.*)"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const isAuthenticated = await convexAuth.isAuthenticated();

    if (isSignInPage(request) && isAuthenticated) {
      const target = request.nextUrl.searchParams.get("redirect");
      return nextjsMiddlewareRedirect(
        request,
        target && isSafeInternalPath(target) ? target : "/",
      );
    }

    if (isProtectedRoute(request) && !isAuthenticated) {
      const { pathname, search } = request.nextUrl;
      // Preserve where the user was headed (e.g. an OAuth authorize URL with
      // its full query) so sign-in can bounce them back.
      const suffix =
        pathname === "/" ? "" : `?redirect=${encodeURIComponent(`${pathname}${search}`)}`;
      return nextjsMiddlewareRedirect(request, `/signin${suffix}`);
    }
  },
  {
    cookieConfig: {
      maxAge: 60 * 60 * 24 * 30,
    },
  },
);
```

(Keep the existing `config.matcher` untouched — it already lets `/.well-known/*` and static assets through.)

- [ ] **Step 2: Thread the redirect through the sign-in page**

Replace `src/app/signin/page.tsx`:

```tsx
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/sign-in-screen";
import { isSafeInternalPath } from "@/lib/mcp/oauth-validation";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const target =
    redirectParam && isSafeInternalPath(redirectParam) ? redirectParam : "/";

  if (await isAuthenticatedNextjs()) {
    redirect(target);
  }

  return <SignInScreen redirectTo={target} />;
}
```

- [ ] **Step 3: Accept the target in `SignInScreen`**

In `src/components/sign-in-screen.tsx`, change the signature and the `signIn` call:

```tsx
export function SignInScreen({ redirectTo = "/" }: { redirectTo?: string }) {
```

and inside `handleGoogleSignIn`:

```tsx
await signIn("google", { redirectTo });
```

- [ ] **Step 4: Verify manually (dev server + convex dev running)**

- Signed out, visit `http://localhost:3000/settings/connections` → lands on `/signin?redirect=%2Fsettings%2Fconnections`; complete Google sign-in → lands on `/settings/connections` (404 for now — route arrives in Task 3; the URL is what's being verified).
- Signed in, visit `http://localhost:3000/signin?redirect=%2F%2Fevil.com` → lands on `/` (unsafe value discarded).

- [ ] **Step 5: Gate + commit**

```bash
bun run typecheck && bun run lint && bun run test:run
git add src/proxy.ts src/app/signin/page.tsx src/components/sign-in-screen.tsx
git commit -m "feat: honor safe ?redirect= through sign-in and protect oauth/settings routes"
```

---

### Task 2: `/oauth/authorize` consent page + server actions

**Files:**
- Create: `my-app/src/app/oauth/authorize/page.tsx`
- Create: `my-app/src/app/oauth/authorize/actions.ts`

**Interfaces:**
- Consumes: `api.oauth.getClientPublic` + `api.oauth.createAuthCode` (sub-plan 2 Task 6), `api.users.currentUser` (existing), `randomToken`/`sha256Hex` (sub-plan 2 Task 3), `matchesRegisteredRedirect` (sub-plan 2 Task 4), `fetchQuery`/`fetchMutation` from `convex/nextjs`, `convexAuthNextjsToken` from `@convex-dev/auth/nextjs/server`.
- Produces: the authorization endpoint advertised by the RFC 8414 metadata (`/oauth/authorize`). Query params consumed: `client_id`, `redirect_uri`, `response_type`, `code_challenge`, `code_challenge_method`, `scope` (ignored — fixed grant), `state`, `resource` (optional, stored for future RFC 8707 use).

- [ ] **Step 1: Write the server actions**

```ts
// src/app/oauth/authorize/actions.ts
"use server";

import { fetchMutation, fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { randomToken, sha256Hex } from "@/lib/mcp/tokens";
import { matchesRegisteredRedirect } from "@/lib/mcp/oauth-validation";

/** Builds redirect_uri?k=v... preserving existing query params on the URI. */
export async function buildCallbackUrl(
  redirectUri: string,
  params: Record<string, string>,
): Promise<string> {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

type AuthorizeFields = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string | null;
};

function readFields(formData: FormData): AuthorizeFields {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    clientId: get("client_id") ?? "",
    redirectUri: get("redirect_uri") ?? "",
    codeChallenge: get("code_challenge") ?? "",
    state: get("state"),
    resource: get("resource"),
  };
}

export async function approveAuthorization(formData: FormData): Promise<void> {
  const f = readFields(formData);
  // Re-validate everything server-side; hidden form fields are attacker input.
  const client = await fetchQuery(api.oauth.getClientPublic, { clientId: f.clientId });
  if (!client || !matchesRegisteredRedirect(f.redirectUri, client.redirectUris) || !f.codeChallenge) {
    throw new Error("Invalid authorization request.");
  }

  const code = randomToken();
  await fetchMutation(
    api.oauth.createAuthCode,
    {
      clientId: f.clientId,
      redirectUri: f.redirectUri,
      codeHash: await sha256Hex(code),
      codeChallenge: f.codeChallenge,
      scope: "read write",
      ...(f.resource ? { resource: f.resource } : {}),
    },
    { token: await convexAuthNextjsToken() },
  );

  redirect(
    await buildCallbackUrl(f.redirectUri, {
      code,
      ...(f.state !== null ? { state: f.state } : {}),
    }),
  );
}

export async function denyAuthorization(formData: FormData): Promise<void> {
  const f = readFields(formData);
  const client = await fetchQuery(api.oauth.getClientPublic, { clientId: f.clientId });
  if (!client || !matchesRegisteredRedirect(f.redirectUri, client.redirectUris)) {
    throw new Error("Invalid authorization request.");
  }
  redirect(
    await buildCallbackUrl(f.redirectUri, {
      error: "access_denied",
      ...(f.state !== null ? { state: f.state } : {}),
    }),
  );
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/oauth/authorize/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import { matchesRegisteredRedirect } from "@/lib/mcp/oauth-validation";
import { approveAuthorization, denyAuthorization } from "./actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Authorize access",
};

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[400px] rounded-2xl border border-border/40 bg-surface/80 p-8 text-center">
        <p className="font-display text-xl text-text">Authorization error</p>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{message}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const str = (key: string): string | null => {
    const value = params[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  // Rule 1: bad client or redirect_uri → render, NEVER redirect.
  const clientId = str("client_id");
  const redirectUri = str("redirect_uri");
  const client = clientId
    ? await fetchQuery(api.oauth.getClientPublic, { clientId })
    : null;
  if (!client) {
    return <ErrorCard message="Unknown or missing client_id. The connecting app may need to re-register." />;
  }
  if (!redirectUri || !matchesRegisteredRedirect(redirectUri, client.redirectUris)) {
    return <ErrorCard message="The redirect URI does not match this app's registration." />;
  }

  // Rule 2: other protocol errors → bounce back to the client with `state`.
  const bounce = (error: string, description: string): never => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    const state = str("state");
    if (state !== null) url.searchParams.set("state", state);
    redirect(url.toString());
  };
  if (str("response_type") !== "code") {
    bounce("unsupported_response_type", "Only response_type=code is supported.");
  }
  const codeChallenge = str("code_challenge");
  if (!codeChallenge || str("code_challenge_method") !== "S256") {
    bounce("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }

  // Middleware guarantees an authenticated session here.
  const user = await fetchQuery(api.users.currentUser, {}, { token: await convexAuthNextjsToken() });

  const hidden = (
    <>
      <input type="hidden" name="client_id" value={clientId!} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="code_challenge" value={codeChallenge!} />
      {str("state") !== null && <input type="hidden" name="state" value={str("state")!} />}
      {str("resource") !== null && <input type="hidden" name="resource" value={str("resource")!} />}
    </>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[400px] rounded-2xl border border-border/40 bg-surface/80 p-8">
        <p className="font-display text-xl tracking-tight text-text">
          Connect {client.clientName}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          <span className="font-medium text-text">{client.clientName}</span> wants to read and
          update the fragrance collection and wear history of{" "}
          <span className="font-medium text-text">{user?.email ?? "your account"}</span>.
        </p>
        <ul className="mt-4 list-disc pl-5 text-sm text-text-secondary">
          <li>View bottles, wear logs, and collection stats</li>
          <li>Add, edit, and delete bottles and wear logs</li>
        </ul>
        <div className="mt-6 flex gap-3">
          <form action={denyAuthorization} className="flex-1">
            {hidden}
            <Button type="submit" variant="outline" className="w-full">
              Deny
            </Button>
          </form>
          <form action={approveAuthorization} className="flex-1">
            {hidden}
            <Button type="submit" className="w-full">
              Approve
            </Button>
          </form>
        </div>
        <p className="mt-4 text-xs text-text-secondary/70">
          You can revoke access anytime in Settings → Connections.
        </p>
      </div>
    </main>
  );
}
```

Note: `redirect()` inside a server component/action throws `NEXT_REDIRECT` — never wrap the `bounce`/action calls in try/catch.

- [ ] **Step 3: Verify the full code→token happy path with curl + browser**

With dev server + convex dev running and a registered client (sub-plan 2 Task 10 curl):

```bash
# 1. Register a client with a loopback redirect
curl -s -X POST http://localhost:3000/api/oauth/register -H "Content-Type: application/json" \
  -d '{"client_name":"Manual Test","redirect_uris":["http://localhost:9999/cb"]}'
# note the client_id → CID

# 2. PKCE pair (verifier + challenge)
VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CHALLENGE="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

# 3. In a signed-in browser, open:
#   http://localhost:3000/oauth/authorize?client_id=CID&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcb&response_type=code&code_challenge=$CHALLENGE&code_challenge_method=S256&state=xyz
#   Click Approve → browser lands on http://localhost:9999/cb?code=...&state=xyz (connection refused is fine — copy the code from the URL bar).

# 4. Exchange it
curl -s -X POST http://localhost:3000/api/oauth/token \
  -d "grant_type=authorization_code&code=<CODE>&code_verifier=$VERIFIER&client_id=<CID>&redirect_uri=http://localhost:9999/cb"
# → { access_token, refresh_token, expires_in: 900, scope: "read write" }
```

Also verify: Deny lands on `...?error=access_denied&state=xyz`; a bad `client_id` renders the error card without redirecting; `response_type=token` bounces with `error=unsupported_response_type&state=xyz`; signed-out visit round-trips through `/signin?redirect=...` back to the consent card.

- [ ] **Step 4: Gate + commit**

```bash
bun run typecheck && bun run lint && bun run test:run
git add src/app/oauth
git commit -m "feat: add OAuth consent page with exact error/redirect semantics"
```

---

### Task 3: Connected-apps section (test-first)

**Files:**
- Create: `my-app/src/components/connected-apps.tsx`
- Create: `my-app/src/components/connected-apps.test.tsx`

**Interfaces:**
- Consumes: `api.oauth.listGrants` / `api.oauth.revokeGrant` (sub-plan 2 Task 6), `ConfirmDeleteButton` (existing two-click pattern: parent owns `confirming` state), `formatWearDate` from `@/lib/format`.
- Produces: `<ConnectedApps />` — self-contained client section used by Task 5's page.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/connected-apps.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { ConnectedApps } from "./connected-apps";

const mockUseQuery = vi.fn();
const mockRevoke = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => mockRevoke,
}));

const GRANT = {
  _id: "grant1",
  clientName: "Claude",
  scope: "read write",
  createdAt: Date.UTC(2026, 0, 5, 12),
  lastUsedAt: undefined,
};

describe("ConnectedApps", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockRevoke.mockReset().mockResolvedValue(null);
  });

  test("shows an empty state when there are no grants", () => {
    mockUseQuery.mockReturnValue([]);
    render(<ConnectedApps />);
    expect(screen.getByText(/no connected apps/i)).toBeInTheDocument();
  });

  test("lists grants and revokes on double-click confirm", async () => {
    mockUseQuery.mockReturnValue([GRANT]);
    const user = userEvent.setup();
    render(<ConnectedApps />);
    expect(screen.getByText("Claude")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /revoke claude/i });
    await user.click(button); // arm
    expect(mockRevoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirm revoke/i })); // confirm
    expect(mockRevoke).toHaveBeenCalledWith({ grantId: "grant1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/components/connected-apps.test.tsx`
Expected: FAIL — cannot resolve `./connected-apps`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/connected-apps.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { formatWearDate } from "@/lib/format";

export function ConnectedApps() {
  const grants = useQuery(api.oauth.listGrants);
  const revokeGrant = useMutation(api.oauth.revokeGrant);
  const [confirmingId, setConfirmingId] = useState<Id<"oauthGrants"> | null>(null);

  const handleRevoke = async (grantId: Id<"oauthGrants">, clientName: string) => {
    if (confirmingId !== grantId) {
      setConfirmingId(grantId);
      return;
    }
    setConfirmingId(null);
    try {
      await revokeGrant({ grantId });
      toast.success(`Disconnected ${clientName}.`);
    } catch {
      toast.error("Could not revoke access. Please try again.");
    }
  };

  return (
    <section>
      <h2 className="font-display text-lg text-text">Connected apps</h2>
      <p className="mt-1 text-sm text-text-secondary">
        AI agents you have granted access to via OAuth. Revoking stops new requests within 15
        minutes (until their current token expires).
      </p>
      {grants === undefined ? (
        <p className="mt-4 text-sm text-text-secondary">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border/40 bg-surface/60 px-4 py-3 text-sm text-text-secondary">
          No connected apps yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border/40 rounded-lg border border-border/40 bg-surface/60">
          {grants.map((grant) => (
            <li key={grant._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{grant.clientName}</p>
                <p className="text-xs text-text-secondary">
                  Connected {formatWearDate(grant.createdAt)}
                  {grant.lastUsedAt ? ` · Last used ${formatWearDate(grant.lastUsedAt)}` : ""}
                </p>
              </div>
              <ConfirmDeleteButton
                confirming={confirmingId === grant._id}
                onClick={() => void handleRevoke(grant._id, grant.clientName)}
                onMouseLeave={() => setConfirmingId(null)}
                idleLabel={`Revoke ${grant.clientName}`}
                confirmLabel="Confirm revoke"
                size="compact"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/components/connected-apps.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/connected-apps.tsx src/components/connected-apps.test.tsx
git commit -m "feat: add connected apps section with grant revocation"
```

---

### Task 4: PAT manager section (test-first)

**Files:**
- Create: `my-app/src/components/pat-manager.tsx`
- Create: `my-app/src/components/pat-manager.test.tsx`

**Interfaces:**
- Consumes: `api.apiTokens.list/create/revoke` (sub-plan 2 Task 7), `randomToken`/`sha256Hex`/`PAT_PREFIX` from `@/lib/mcp/tokens` (isomorphic — runs in the browser), `Dialog` from `@/components/ui/dialog`, `Input`, `Button`, `ConfirmDeleteButton`, `formatWearDate`.
- Produces: `<PatManager />` — list + create-with-copy-once dialog + revoke. **The raw token exists only in browser memory; only its hash is sent to Convex; it is rendered exactly once.**

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pat-manager.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { PatManager } from "./pat-manager";
import { PAT_PREFIX, sha256Hex } from "@/lib/mcp/tokens";

const mockUseQuery = vi.fn();
const mockCreate = vi.fn();
const mockRevoke = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (ref: { _name?: string }) =>
    String(ref).includes("revoke") ? mockRevoke : mockCreate,
}));

describe("PatManager", () => {
  beforeEach(() => {
    mockUseQuery.mockReset().mockReturnValue([]);
    mockCreate.mockReset().mockResolvedValue("tok1");
    mockRevoke.mockReset().mockResolvedValue(null);
  });

  test("creating a token sends only the hash and shows the raw value once", async () => {
    const user = userEvent.setup();
    render(<PatManager />);

    await user.click(screen.getByRole("button", { name: /create token/i }));
    await user.type(screen.getByLabelText(/token name/i), "Claude Code");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    // Raw token displayed once, fgt_-prefixed.
    const rawEl = await screen.findByTestId("raw-token");
    const raw = rawEl.textContent!;
    expect(raw.startsWith(PAT_PREFIX)).toBe(true);

    // The mutation received the SHA-256 of exactly that raw value — never the raw.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0] as { tokenHash: string; name: string };
    expect(args.name).toBe("Claude Code");
    expect(args.tokenHash).toBe(await sha256Hex(raw));
  });
});
```

If the `useMutation` ref-discrimination trick proves brittle, split the mock per test with `vi.mocked` — the assertion that matters is hash-not-raw.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/components/pat-manager.test.tsx`
Expected: FAIL — cannot resolve `./pat-manager`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/pat-manager.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { formatWearDate } from "@/lib/format";
import { PAT_PREFIX, randomToken, sha256Hex } from "@/lib/mcp/tokens";

export function PatManager() {
  const tokens = useQuery(api.apiTokens.list);
  const createToken = useMutation(api.apiTokens.create);
  const revokeToken = useMutation(api.apiTokens.revoke);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<Id<"personalAccessTokens"> | null>(null);

  const handleCreate = async () => {
    if (name.trim().length === 0) return;
    setIsCreating(true);
    try {
      // Raw token never leaves the browser; Convex stores only the hash.
      const raw = PAT_PREFIX + randomToken();
      await createToken({ tokenHash: await sha256Hex(raw), name: name.trim() });
      setRawToken(raw);
    } catch {
      toast.error("Could not create the token. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setName("");
      setRawToken(null);
    }
  };

  const handleRevoke = async (tokenId: Id<"personalAccessTokens">) => {
    if (confirmingId !== tokenId) {
      setConfirmingId(tokenId);
      return;
    }
    setConfirmingId(null);
    try {
      await revokeToken({ tokenId });
      toast.success("Token revoked.");
    } catch {
      toast.error("Could not revoke the token. Please try again.");
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-text">API tokens</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Personal access tokens for CLI clients (Claude Code, curl). Sent as{" "}
            <code className="text-xs">Authorization: Bearer fgt_…</code>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Create token
            </Button>
          </DialogTrigger>
          <DialogContent>
            {rawToken === null ? (
              <>
                <DialogHeader>
                  <DialogTitle>Create API token</DialogTitle>
                  <DialogDescription>
                    Name it after the client that will use it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="pat-name">Token name</Label>
                  <Input
                    id="pat-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Claude Code on laptop"
                  />
                </div>
                <Button onClick={() => void handleCreate()} disabled={isCreating || name.trim() === ""}>
                  Create
                </Button>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Copy your token now</DialogTitle>
                  <DialogDescription>
                    This is the only time it will be shown. Store it like a password.
                  </DialogDescription>
                </DialogHeader>
                <code
                  data-testid="raw-token"
                  className="block break-all rounded-lg border border-border/40 bg-surface-alt px-3 py-2 text-xs"
                >
                  {rawToken}
                </code>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(rawToken);
                    toast.success("Copied to clipboard.");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {tokens === undefined ? (
        <p className="mt-4 text-sm text-text-secondary">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border/40 bg-surface/60 px-4 py-3 text-sm text-text-secondary">
          No API tokens yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border/40 rounded-lg border border-border/40 bg-surface/60">
          {tokens.map((token) => (
            <li key={token._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{token.name}</p>
                <p className="text-xs text-text-secondary">
                  Created {formatWearDate(token.createdAt)}
                  {token.lastUsedAt ? ` · Last used ${formatWearDate(token.lastUsedAt)}` : " · Never used"}
                </p>
              </div>
              <ConfirmDeleteButton
                confirming={confirmingId === token._id}
                onClick={() => void handleRevoke(token._id)}
                onMouseLeave={() => setConfirmingId(null)}
                idleLabel={`Revoke ${token.name}`}
                confirmLabel="Confirm revoke"
                size="compact"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Check `src/components/ui/dialog.tsx` for the exact exported names before importing (the add-bottle dialog is the reference consumer); adjust imports to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/components/pat-manager.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pat-manager.tsx src/components/pat-manager.test.tsx
git commit -m "feat: add PAT manager with hash-only creation and copy-once display"
```

---

### Task 5: `/settings/connections` page + header nav link

**Files:**
- Create: `my-app/src/app/settings/connections/page.tsx`
- Modify: `my-app/src/components/home-page.tsx` (header actions, around line 116)

**Interfaces:**
- Consumes: `<ConnectedApps />` (Task 3), `<PatManager />` (Task 4). Route already protected by Task 1's middleware.
- Produces: the app's first settings route; header gains a gear icon linking to it.

- [ ] **Step 1: Write the page**

```tsx
// src/app/settings/connections/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ConnectedApps } from "@/components/connected-apps";
import { PatManager } from "@/components/pat-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Connections",
};

export default function ConnectionsPage() {
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" aria-label="Back to collection">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-2xl tracking-tight text-text">Connections</h1>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Manage AI agents and API tokens that can access your collection via MCP.
        </p>
        <div className="mt-8 space-y-10">
          <ConnectedApps />
          <PatManager />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add the header link in `home-page.tsx`**

In the header actions `div` (currently `<ThemeToggle />` + sign-out button, line ~116), insert before `<ThemeToggle />`:

```tsx
<Button asChild variant="ghost" size="sm" aria-label="Connections settings">
  <Link href="/settings/connections">
    <Settings className="h-4 w-4" />
  </Link>
</Button>
```

Add imports: `Settings` to the existing `lucide-react` import; `import Link from "next/link";`.

- [ ] **Step 3: Verify in the browser**

`bun dev`: gear icon appears in the header; clicking it opens `/settings/connections`; create a PAT, copy it, revoke it; connect via the Task 2 curl flow and see the grant appear under Connected apps; revoke it and confirm a subsequent refresh-token grant fails with `invalid_grant`.

- [ ] **Step 4: Full gate + commit + PR**

```bash
bun run typecheck && bun run lint && bun run test:run && bun run build
git add src/app/settings src/components/home-page.tsx
git commit -m "feat: add /settings/connections page and header nav link"
git push -u origin feat/mcp-consent-settings
gh pr create --title "feat: OAuth consent page, sign-in redirect passthrough, connections settings" --body "Sub-plan 4/5 of docs/mcp-server-plan.md (issue #65): safe ?redirect= through sign-in (middleware + page + screen), /oauth/authorize with locked RFC 6749 error semantics (render vs bounce, state passthrough), /settings/connections with grant revocation and copy-once PATs. Completes the OAuth code→token happy path.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
