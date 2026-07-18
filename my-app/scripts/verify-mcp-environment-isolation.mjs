// Proves that a non-production signing key is not trusted by the production
// MCP endpoint. The private key is read from the environment and never sent.
import { importPKCS8, SignJWT } from "jose";

const base = new URL(process.argv[2] ?? "");
if (base.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(base.hostname)) {
  throw new Error("Pass the HTTPS production app origin as the only argument.");
}

const privateKeyPem = process.env.MCP_DEV_JWT_PRIVATE_KEY;
const kid = process.env.MCP_DEV_JWT_KID;
if (!privateKeyPem || !kid) {
  throw new Error("Set MCP_DEV_JWT_PRIVATE_KEY and MCP_DEV_JWT_KID to a non-production keypair.");
}

const key = await importPKCS8(privateKeyPem.replaceAll("\\n", "\n"), "RS256");
const token = await new SignJWT({ client_id: "environment-isolation-probe", scope: "read" })
  .setProtectedHeader({ alg: "RS256", kid })
  .setSubject("isolation-probe|mcp:untrusted-key")
  // Deliberately claim the production issuer. Key trust, not the issuer string,
  // must prevent this token from authenticating.
  .setIssuer(base.origin)
  .setAudience("fragrances-mcp")
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(key);

const response = await fetch(new URL("/api/mcp", base), {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});

if (response.status !== 401) {
  throw new Error(`Environment isolation failed: production returned HTTP ${response.status}.`);
}

console.log("PASS: production rejected the non-production signing key with HTTP 401.");
