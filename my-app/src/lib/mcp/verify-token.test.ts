import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { mintAccessToken } from "./tokens";
import { sha256Hex } from "./token-crypto";
import { createMcpTokenVerifier, McpExtra } from "./verify-token";

const ISSUER = "https://example.test";
const REQ = new Request("https://example.test/api/mcp");

beforeEach(() => vi.stubEnv("MCP_JWT_KID", "mcp-test-1"));
afterEach(() => vi.unstubAllEnvs());

async function makeVerifier(overrides: Partial<Parameters<typeof createMcpTokenVerifier>[0]> = {}) {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const pem = await exportPKCS8(privateKey);
  return {
    pem,
    verify: createMcpTokenVerifier({
      privateKeyPem: pem,
      issuer: ISSUER,
      validatePat: async () => null,
      ...overrides,
    }),
  };
}

describe("verifyMcpToken — OAuth JWT path", () => {
  test("valid JWT yields authInfo whose convexToken is the JWT itself", async () => {
    const { pem, verify } = await makeVerifier();
    const jwt = await mintAccessToken({
      userId: "user123",
      grantId: "grant456",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: pem,
      issuer: ISSUER,
    });
    const info = await verify(REQ, jwt);
    expect(info?.clientId).toBe("client789");
    expect(info?.scopes).toEqual(["read", "write"]);
    expect(info?.extra as McpExtra).toEqual({ userId: "user123", convexToken: jwt });
  });

  test("JWT signed by a different key is rejected", async () => {
    const { verify } = await makeVerifier();
    const other = await generateKeyPair("RS256", { extractable: true });
    const forged = await mintAccessToken({
      userId: "user123",
      grantId: "g",
      clientId: "c",
      scope: "read write",
      privateKeyPem: await exportPKCS8(other.privateKey),
      issuer: ISSUER,
    });
    expect(await verify(REQ, forged)).toBeUndefined();
  });

  test("missing bearer and garbage bearer are rejected", async () => {
    const { verify } = await makeVerifier();
    expect(await verify(REQ, undefined)).toBeUndefined();
    expect(await verify(REQ, "not-a-jwt")).toBeUndefined();
  });

  test("uses the canonical app origin for the default issuer", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");
    const { pem, verify } = await makeVerifier({ issuer: undefined });
    const jwt = await mintAccessToken({
      userId: "user123",
      grantId: "grant456",
      clientId: "client789",
      scope: "read write",
      privateKeyPem: pem,
      issuer: ISSUER,
    });

    expect(await verify(REQ, jwt)).toMatchObject({ clientId: "client789" });
  });
});

describe("verifyMcpToken — PAT path", () => {
  test("valid PAT is hash-looked-up and bridged to a convex JWT", async () => {
    const pat = "fgt_test-token-value";
    const expectedHash = await sha256Hex(pat);
    let seenHash: string | null = null;
    const { verify } = await makeVerifier({
      validatePat: async (tokenHash: string) => {
        seenHash = tokenHash;
        return { userId: "user123", tokenId: "tok1", scopes: ["read", "write"] };
      },
    });
    const info = await verify(REQ, pat);
    expect(seenHash).toBe(expectedHash);
    expect(info?.clientId).toBe("personal-access-token");
    const extra = info?.extra as McpExtra;
    expect(extra.userId).toBe("user123");
    expect(extra.convexToken.split(".")).toHaveLength(3); // bridge JWT, not the PAT
  });

  test("revoked/unknown PAT is rejected", async () => {
    const { verify } = await makeVerifier({ validatePat: async () => null });
    expect(await verify(REQ, "fgt_revoked")).toBeUndefined();
  });
});
