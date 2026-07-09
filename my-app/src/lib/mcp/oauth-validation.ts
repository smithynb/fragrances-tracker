// src/lib/mcp/oauth-validation.ts
// Pure validation helpers for the OAuth server. No env access, no I/O —
// importable from Next routes, server actions, and Convex functions alike.

/** Registered redirect URIs must be https, or http on loopback only. Fragments are forbidden. */
export function isValidRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/** OAuth redirect_uri matching is exact string comparison — no prefixes, no wildcards. */
export function matchesRegisteredRedirect(uri: string, registered: string[]): boolean {
  return registered.includes(uri);
}

/** PKCE S256: base64url(SHA-256(ascii(code_verifier))), unpadded (RFC 7636 §4.2). */
export async function computeS256Challenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const bin = String.fromCharCode(...new Uint8Array(digest));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Guard for `?redirect=` params: same-origin path only, no scheme-relative or backslash tricks. */
export function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}
