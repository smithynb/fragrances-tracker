// src/app/api/oauth/register/route.ts
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import { corsJson, corsPreflight } from "@/lib/mcp/cors";
import { randomHex } from "@/lib/mcp/token-crypto";
import { isValidRedirectUri } from "@/lib/mcp/oauth-validation";

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function registrationError(error: string, description: string): Response {
  return corsJson({ error, error_description: description }, { status: 400 });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return registrationError("invalid_client_metadata", "Request body must be JSON.");
  }
  const meta = body as { client_name?: unknown; redirect_uris?: unknown };

  const clientName =
    typeof meta.client_name === "string" && meta.client_name.trim().length > 0
      ? meta.client_name.trim().slice(0, 200)
      : null;
  if (!clientName) {
    return registrationError("invalid_client_metadata", "client_name is required.");
  }

  const uris = meta.redirect_uris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every((u) => typeof u === "string" && u.length <= MAX_URI_LENGTH)
  ) {
    return registrationError(
      "invalid_redirect_uri",
      `redirect_uris must be 1-${MAX_REDIRECT_URIS} strings.`,
    );
  }
  const bad = (uris as string[]).find((u) => !isValidRedirectUri(u));
  if (bad) {
    return registrationError(
      "invalid_redirect_uri",
      `Invalid redirect URI (must be https, or http://localhost, no fragment): ${bad}`,
    );
  }

  const clientId = randomHex(16);
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  try {
    await convex.mutation(api.oauth.registerClient, {
      clientId,
      clientName,
      redirectUris: uris as string[],
      ip: clientIp(req),
    });
  } catch (error) {
    if (error instanceof ConvexError) {
      const data = error.data as { code?: string; message?: string };
      if (data.code === "invalid_redirect_uri") {
        return registrationError("invalid_redirect_uri", data.message ?? "Invalid redirect URI.");
      }
      // Rate limiter throws ConvexError with retryAfter.
      return corsJson({ error: "rate_limited" }, { status: 429 });
    }
    throw error;
  }

  return corsJson(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
