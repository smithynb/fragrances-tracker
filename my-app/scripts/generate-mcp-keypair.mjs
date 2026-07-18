// scripts/generate-mcp-keypair.mjs
// One-off: generates the MCP signing keypair. Run per environment; never commit output.
//   bun scripts/generate-mcp-keypair.mjs
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";

const kid = process.argv[2] ?? "mcp-1";
const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const pkcs8 = await exportPKCS8(privateKey);
const jwk = await exportJWK(privateKey);
for (const f of ["d", "p", "q", "dp", "dq", "qi"]) delete jwk[f];

console.log("── MCP_JWT_KID (set beside the private key) ──");
console.log(kid);
console.log("── MCP_JWT_PRIVATE_KEY (set in Vercel / .env.local) ──");
console.log(pkcs8);
console.log("── Public JWK (informational; served by /api/oauth/jwks) ──");
console.log(JSON.stringify({ ...jwk, kid, alg: "RS256", use: "sig" }, null, 2));
