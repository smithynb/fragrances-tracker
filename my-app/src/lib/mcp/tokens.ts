// src/lib/mcp/tokens.ts
// Server-only JWT helpers for the MCP OAuth server. The MCP endpoint runs in
// this app's Next.js server route on Vercel; this code is not client payload.
// Convex functions never import it; they only receive minted credentials.
import "server-only";
import { SignJWT, importPKCS8, exportJWK } from "jose";

export const MCP_JWT_AUDIENCE = "fragrances-mcp";
export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
export const PAT_BRIDGE_TTL_SECONDS = 300; // 5 min

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

async function signingKey(privateKeyPem?: string) {
  const pem = privateKeyPem ?? requireEnv(process.env.MCP_JWT_PRIVATE_KEY, "MCP_JWT_PRIVATE_KEY");
  // Env UIs often store the PEM with literal "\n" — normalize.
  return await importPKCS8(pem.replaceAll("\\n", "\n"), "RS256", { extractable: true });
}

async function mint(
  subject: string,
  claims: Record<string, string>,
  ttlSeconds: number,
  privateKeyPem?: string,
  issuer?: string,
  kid?: string,
): Promise<string> {
  const signingKid = kid ?? requireEnv(process.env.MCP_JWT_KID, "MCP_JWT_KID");
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: signingKid })
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
  kid?: string;
}): Promise<string> {
  return await mint(
    `${opts.userId}|mcp:${opts.grantId}`,
    { client_id: opts.clientId, scope: opts.scope },
    opts.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS,
    opts.privateKeyPem,
    opts.issuer,
    opts.kid,
  );
}

/** Short-lived Convex credential minted after a PAT passes hash lookup. */
export async function mintPatBridgeToken(opts: {
  userId: string;
  tokenId: string;
  privateKeyPem?: string;
  issuer?: string;
  kid?: string;
}): Promise<string> {
  return await mint(
    `${opts.userId}|pat:${opts.tokenId}`,
    { client_id: "personal-access-token", scope: "read write" },
    PAT_BRIDGE_TTL_SECONDS,
    opts.privateKeyPem,
    opts.issuer,
    opts.kid,
  );
}

/**
 * Public JWKS derived from the private key (private fields stripped), plus any
 * extra public keys from MCP_EXTRA_PUBLIC_JWKS (JSON array) — used to publish a
 * dev keypair's public half alongside prod (see verification sub-plan).
 */
export async function getPublicJwks(
  privateKeyPem?: string,
  kid?: string,
): Promise<{ keys: object[] }> {
  const jwk = (await exportJWK(await signingKey(privateKeyPem))) as Record<string, unknown>;
  for (const f of ["d", "p", "q", "dp", "dq", "qi"]) delete jwk[f];
  const signingKid = kid ?? requireEnv(process.env.MCP_JWT_KID, "MCP_JWT_KID");
  const keys: object[] = [{ ...jwk, kid: signingKid, alg: "RS256", use: "sig" }];
  const extra = process.env.MCP_EXTRA_PUBLIC_JWKS;
  if (extra) keys.push(...(JSON.parse(extra) as object[]));
  return { keys };
}
