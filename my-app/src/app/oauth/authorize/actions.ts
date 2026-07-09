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
