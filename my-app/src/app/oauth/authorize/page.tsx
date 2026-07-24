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
