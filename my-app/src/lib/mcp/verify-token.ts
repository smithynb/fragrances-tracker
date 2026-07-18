// Dual-mode bearer verification for /api/mcp (epic §3.3):
//   fgt_* → PAT: hash → Convex lookup → 5-min bridge JWT as the Convex credential.
//   else  → OAuth access token: local RS256 verify (no DB, no network); the JWT
//           itself is the Convex credential (customJwt provider trusts it).
// Any failure returns undefined; withMcpAuth converts that into the 401 +
// WWW-Authenticate discovery response.
import { createLocalJWKSet, jwtVerify } from "jose";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { getPublicJwks, mintPatBridgeToken, MCP_JWT_AUDIENCE } from "./tokens";
import { PAT_PREFIX, sha256Hex } from "./token-crypto";
import { appOrigin } from "./cors";

export type McpExtra = { userId: string; convexToken: string };

export type McpAuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  extra: McpExtra;
};

type PatRecord = { userId: string; tokenId: string; scopes: string[] };

type VerifierDeps = {
  privateKeyPem?: string;
  issuer?: string;
  validatePat?: (tokenHash: string) => Promise<PatRecord | null>;
};

function defaultValidatePat(tokenHash: string): Promise<PatRecord | null> {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  return convex.mutation(api.apiTokens.validate, { tokenHash });
}

export function createMcpTokenVerifier(deps: VerifierDeps = {}) {
  const validatePat = deps.validatePat ?? defaultValidatePat;

  return async function verifyMcpToken(
    _req: Request,
    bearer?: string,
  ): Promise<McpAuthInfo | undefined> {
    if (!bearer) return undefined;

    if (bearer.startsWith(PAT_PREFIX)) {
      const pat = await validatePat(await sha256Hex(bearer));
      if (!pat) return undefined;
      const convexToken = await mintPatBridgeToken({
        userId: pat.userId,
        tokenId: pat.tokenId,
        privateKeyPem: deps.privateKeyPem,
        issuer: deps.issuer,
      });
      return {
        token: bearer,
        clientId: "personal-access-token",
        scopes: pat.scopes,
        extra: { userId: pat.userId, convexToken },
      };
    }

    try {
      const jwks = createLocalJWKSet(await getPublicJwks(deps.privateKeyPem));
      const { payload } = await jwtVerify(bearer, jwks, {
        issuer: deps.issuer ?? appOrigin(),
        audience: MCP_JWT_AUDIENCE,
        // Pin the algorithm: our tokens are always RS256. Defense-in-depth
        // against alg-confusion (jose already refuses HS*/none for an RSA key).
        algorithms: ["RS256"],
      });
      const [userId] = (payload.sub as string).split("|");
      return {
        token: bearer,
        clientId: (payload.client_id as string) ?? "unknown",
        scopes: ((payload.scope as string) ?? "").split(" ").filter(Boolean),
        extra: { userId, convexToken: bearer },
      };
    } catch {
      return undefined;
    }
  };
}

/** Default instance used by the /api/mcp route. */
export const verifyMcpToken = createMcpTokenVerifier();
