// Browser-safe opaque-token helpers. Keep this module free of server-only
// imports so the PAT manager can generate and hash credentials client-side.
export const PAT_PREFIX = "fgt_";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Opaque secret (refresh tokens, auth codes, PAT bodies): base64url, no padding. */
export function randomToken(bytes = 32): string {
  const bin = String.fromCharCode(...randomBytes(bytes));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Public identifiers (client_id): lowercase hex. */
export function randomHex(bytes = 16): string {
  return Array.from(randomBytes(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
