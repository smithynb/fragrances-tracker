const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
    // MCP access tokens: RS256 JWTs minted by the Next.js OAuth server under a
    // dedicated keypair. `sub` is "userId|mcp:grantId" or "userId|pat:tokenId",
    // which getAuthUserId() resolves via sub.split("|")[0] — same shape Convex
    // Auth itself uses ("userId|sessionId").
    {
      type: "customJwt",
      applicationID: "fragrances-mcp",
      issuer: process.env.MCP_JWT_ISSUER,
      jwks: process.env.MCP_JWKS_URL,
      algorithm: "RS256",
    },
  ],
};

export default authConfig;
