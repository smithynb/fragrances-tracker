import "server-only";

export function oauthInternalSecret(): string {
  const secret = process.env.OAUTH_INTERNAL_SECRET;
  if (!secret) throw new Error("Missing required env var OAUTH_INTERNAL_SECRET.");
  return secret;
}
