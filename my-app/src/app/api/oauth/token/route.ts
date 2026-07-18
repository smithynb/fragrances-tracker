// src/app/api/oauth/token/route.ts
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import { corsJson, corsPreflight } from "@/lib/mcp/cors";
import { ACCESS_TOKEN_TTL_SECONDS, mintAccessToken } from "@/lib/mcp/tokens";
import { randomToken, sha256Hex } from "@/lib/mcp/token-crypto";
import { computeS256Challenge, isValidCodeVerifier } from "@/lib/mcp/oauth-validation";
import { oauthInternalSecret } from "@/lib/mcp/internal-secret";

function tokenError(error: string, description?: string, status = 400): Response {
  return corsJson(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function mapConvexError(error: unknown): Response {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string; retryAfter?: number };
    if (data.code === "invalid_grant") return tokenError("invalid_grant", data.message);
    if (typeof data.retryAfter === "number") return tokenError("rate_limited", undefined, 429);
  }
  throw error;
}

async function successResponse(
  grant: { userId: string; grantId: string; scope: string },
  clientId: string,
  refreshToken: string,
): Promise<Response> {
  const accessToken = await mintAccessToken({
    userId: grant.userId,
    grantId: grant.grantId,
    clientId,
    scope: grant.scope,
  });
  return corsJson(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scope,
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export async function POST(req: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await req.text());
  } catch {
    return tokenError("invalid_request", "Body must be application/x-www-form-urlencoded.");
  }
  const grantType = form.get("grant_type");
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const ip = clientIp(req);

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const codeVerifier = form.get("code_verifier");
    const clientId = form.get("client_id");
    const redirectUri = form.get("redirect_uri");
    if (!code || !codeVerifier || !clientId || !redirectUri) {
      return tokenError(
        "invalid_request",
        "code, code_verifier, client_id and redirect_uri are required.",
      );
    }
    if (!isValidCodeVerifier(codeVerifier)) {
      return tokenError("invalid_request", "code_verifier has invalid PKCE syntax.");
    }
    const refreshToken = randomToken();
    try {
      const result = await convex.mutation(api.oauth.exchangeAuthCode, {
        codeHash: await sha256Hex(code),
        clientId,
        redirectUri,
        codeChallenge: await computeS256Challenge(codeVerifier),
        refreshTokenHash: await sha256Hex(refreshToken),
        ip,
        internalSecret: oauthInternalSecret(),
      });
      if ("revoked" in result)
        return tokenError("invalid_grant", "Authorization code already used.");
      return await successResponse(result, clientId, refreshToken);
    } catch (error) {
      return mapConvexError(error);
    }
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    const clientId = form.get("client_id");
    if (!refreshToken || !clientId) {
      return tokenError("invalid_request", "refresh_token and client_id are required.");
    }
    const newRefreshToken = randomToken();
    try {
      const result = await convex.mutation(api.oauth.rotateRefreshToken, {
        tokenHash: await sha256Hex(refreshToken),
        newTokenHash: await sha256Hex(newRefreshToken),
        clientId,
        ip,
        internalSecret: oauthInternalSecret(),
      });
      if ("revoked" in result)
        return tokenError("invalid_grant", "Refresh token reuse detected; grant revoked.");
      return await successResponse(result, clientId, newRefreshToken);
    } catch (error) {
      return mapConvexError(error);
    }
  }

  return tokenError("unsupported_grant_type");
}

export function OPTIONS() {
  return corsPreflight();
}
