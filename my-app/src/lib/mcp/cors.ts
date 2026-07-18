// Agents (claude.ai, ChatGPT) fetch OAuth metadata from browser contexts on
// other origins, so every metadata/token endpoint must answer CORS preflights.
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export function corsJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...OAUTH_CORS_HEADERS,
      ...init.headers,
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export function appOrigin(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("Missing required env var NEXT_PUBLIC_APP_URL.");
  const url = new URL(value);
  if (url.origin === "null" || url.href !== `${url.origin}/`) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an origin without a path, query, or fragment.");
  }
  return url.origin;
}
