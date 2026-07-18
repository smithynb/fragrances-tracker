// src/lib/mcp/tokens.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, createLocalJWKSet } from "jose";
import { mintAccessToken, mintPatBridgeToken, getPublicJwks, MCP_JWT_AUDIENCE } from "./tokens";

const ISSUER = "https://example.test";
const TEST_KID = "mcp-test-1";

afterEach(() => vi.unstubAllEnvs());

async function testPem(): Promise<string> {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return await exportPKCS8(privateKey);
}

describe("mintAccessToken", () => {
  test("mints an RS256 JWT verifiable via the derived JWKS with expected claims", async () => {
    const pem = await testPem();
    const token = await mintAccessToken({
      userId: "user123",
      grantId: "grant456",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: pem,
      issuer: ISSUER,
      kid: TEST_KID,
    });
    const jwks = createLocalJWKSet(await getPublicJwks(pem, TEST_KID));
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: MCP_JWT_AUDIENCE,
    });
    expect(protectedHeader.alg).toBe("RS256");
    expect(protectedHeader.kid).toBe(TEST_KID);
    expect(payload.sub).toBe("user123|mcp:grant456");
    expect(payload.client_id).toBe("client789");
    expect(payload.scope).toBe("read write");
    const ttl = (payload.exp as number) - (payload.iat as number);
    expect(ttl).toBe(900);
  });

  test("token signed by one key fails verification against another key's JWKS", async () => {
    const pemA = await testPem();
    const pemB = await testPem();
    const token = await mintAccessToken({
      userId: "u",
      grantId: "g",
      clientId: "c",
      scope: "read write",
      privateKeyPem: pemA,
      issuer: ISSUER,
      kid: TEST_KID,
    });
    const jwksB = createLocalJWKSet(await getPublicJwks(pemB, TEST_KID));
    await expect(
      jwtVerify(token, jwksB, { issuer: ISSUER, audience: MCP_JWT_AUDIENCE }),
    ).rejects.toThrow();
  });

  test("canonicalizes the configured app origin for the default issuer", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");
    const pem = await testPem();
    const token = await mintAccessToken({
      userId: "user123",
      grantId: "grant456",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: pem,
      kid: TEST_KID,
    });
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet(await getPublicJwks(pem, TEST_KID)),
      {
        issuer: ISSUER,
        audience: MCP_JWT_AUDIENCE,
      },
    );
    expect(payload.iss).toBe(ISSUER);
  });

  test("rejects a configured app URL with path, query, or fragment", async () => {
    const pem = await testPem();
    for (const value of [
      "https://example.test/oauth",
      "https://example.test/?env=prod",
      "https://example.test/#issuer",
      "https://example.test/?",
      "https://example.test/#",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", value);
      await expect(
        mintAccessToken({
          userId: "user123",
          grantId: "grant456",
          clientId: "client789",
          scope: "read write",
          privateKeyPem: pem,
          kid: TEST_KID,
        }),
      ).rejects.toThrow("NEXT_PUBLIC_APP_URL must be an origin without a path, query, or fragment");
    }
  });
});

describe("mintPatBridgeToken", () => {
  test("uses pat-prefixed subject and 300s TTL", async () => {
    const pem = await testPem();
    const token = await mintPatBridgeToken({
      userId: "user123",
      tokenId: "tok789",
      privateKeyPem: pem,
      issuer: ISSUER,
      kid: TEST_KID,
    });
    const jwks = createLocalJWKSet(await getPublicJwks(pem, TEST_KID));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: MCP_JWT_AUDIENCE,
    });
    expect(payload.sub).toBe("user123|pat:tok789");
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
  });
});

describe("getPublicJwks", () => {
  test("contains no private-key fields and carries kid/alg/use", async () => {
    const { keys } = await getPublicJwks(await testPem(), TEST_KID);
    expect(keys).toHaveLength(1);
    const k = keys[0] as Record<string, unknown>;
    for (const f of ["d", "p", "q", "dp", "dq", "qi"]) expect(k[f]).toBeUndefined();
    expect(k.kid).toBe(TEST_KID);
    expect(k.alg).toBe("RS256");
    expect(k.use).toBe("sig");
  });

  test("uses MCP_JWT_KID for both minted tokens and the primary JWK", async () => {
    vi.stubEnv("MCP_JWT_KID", "mcp-stage-1");
    const pem = await testPem();
    const token = await mintAccessToken({
      userId: "user123",
      grantId: "grant456",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: pem,
      issuer: ISSUER,
    });
    const { keys } = await getPublicJwks(pem);
    const { protectedHeader } = await jwtVerify(token, createLocalJWKSet({ keys }), {
      issuer: ISSUER,
      audience: MCP_JWT_AUDIENCE,
    });

    expect(protectedHeader.kid).toBe("mcp-stage-1");
    expect((keys[0] as Record<string, unknown>).kid).toBe("mcp-stage-1");
  });

  test("verifies old and new unexpired tokens during key rotation overlap", async () => {
    const oldPem = await testPem();
    const newPem = await testPem();
    const oldToken = await mintAccessToken({
      userId: "user123",
      grantId: "old-grant",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: oldPem,
      issuer: ISSUER,
      kid: "mcp-old-1",
    });
    const newToken = await mintAccessToken({
      userId: "user123",
      grantId: "new-grant",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: newPem,
      issuer: ISSUER,
      kid: "mcp-new-1",
    });
    const oldJwk = (await getPublicJwks(oldPem, "mcp-old-1")).keys[0];
    vi.stubEnv("MCP_EXTRA_PUBLIC_JWKS", JSON.stringify([oldJwk]));
    const jwks = createLocalJWKSet(await getPublicJwks(newPem, "mcp-new-1"));

    const oldResult = await jwtVerify(oldToken, jwks, {
      issuer: ISSUER,
      audience: MCP_JWT_AUDIENCE,
    });
    const newResult = await jwtVerify(newToken, jwks, {
      issuer: ISSUER,
      audience: MCP_JWT_AUDIENCE,
    });

    expect(oldResult.protectedHeader.kid).toBe("mcp-old-1");
    expect(newResult.protectedHeader.kid).toBe("mcp-new-1");
  });

  test("accepts only distinct public RSA signing keys from MCP_EXTRA_PUBLIC_JWKS", async () => {
    const primaryPem = await testPem();
    const { publicKey } = await generateKeyPair("RS256", { extractable: true });
    const extra = { ...(await exportJWK(publicKey)), kid: "mcp-old-1", use: "sig" };
    vi.stubEnv("MCP_EXTRA_PUBLIC_JWKS", JSON.stringify([extra]));

    const { keys } = await getPublicJwks(primaryPem, "mcp-new-1");
    expect(keys).toHaveLength(2);
    expect(keys[1]).toEqual(extra);
  });

  test.each([
    [{ kty: "EC", use: "sig", alg: "RS256", kid: "extra" }, "kty"],
    [{ kty: "RSA", use: "enc", alg: "RS256", kid: "extra" }, "use"],
    [{ kty: "RSA", use: "sig", alg: "RS512", kid: "extra" }, "alg"],
    [{ kty: "RSA", use: "sig", alg: "RS256", kid: "" }, "kid"],
    [{ kty: "RSA", use: "sig", alg: "RS256", kid: "primary" }, "duplicate kid"],
    [{ kty: "RSA", use: "sig", alg: "RS256", kid: "extra", d: "private" }, "private"],
  ])("rejects an unsafe extra JWK %#", async (extra, message) => {
    vi.stubEnv("MCP_EXTRA_PUBLIC_JWKS", JSON.stringify([extra]));
    await expect(getPublicJwks(await testPem(), "primary")).rejects.toThrow(message);
  });

  test("rejects duplicate kids among extra JWKs", async () => {
    vi.stubEnv(
      "MCP_EXTRA_PUBLIC_JWKS",
      JSON.stringify([
        { kty: "RSA", use: "sig", kid: "old" },
        { kty: "RSA", use: "sig", kid: "old" },
      ]),
    );
    await expect(getPublicJwks(await testPem(), "primary")).rejects.toThrow("duplicate kid");
  });
});
