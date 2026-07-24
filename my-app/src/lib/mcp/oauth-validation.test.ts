// src/lib/mcp/oauth-validation.test.ts
import { describe, expect, test } from "vitest";
import {
  isValidRedirectUri,
  matchesRegisteredRedirect,
  computeS256Challenge,
  isSafeInternalPath,
} from "./oauth-validation";

describe("isValidRedirectUri", () => {
  test.each([
    ["https://claude.ai/api/mcp/auth_callback", true],
    ["https://example.com/cb?flavor=a", true],
    ["http://localhost:33418/callback", true],
    ["http://127.0.0.1:8976/oauth/cb", true],
    ["http://evil.com/cb", false], // http on non-loopback
    ["https://example.com/cb#frag", false], // fragments forbidden (RFC 6749 §3.1.2)
    ["ftp://example.com/cb", false],
    ["not a url", false],
    ["", false],
  ])("%s → %s", (uri, ok) => {
    expect(isValidRedirectUri(uri)).toBe(ok);
  });
});

describe("matchesRegisteredRedirect", () => {
  const registered = ["https://a.example/cb", "http://localhost:1234/cb"];
  test("exact match passes", () => {
    expect(matchesRegisteredRedirect("https://a.example/cb", registered)).toBe(true);
  });
  test.each([
    "https://a.example/cb/extra", // prefix is not enough
    "https://a.example/CB", // case-sensitive
    "https://a.example/cb?x=1", // query must match exactly
    "http://localhost:9999/cb", // different port
  ])("non-exact %s fails", (uri) => {
    expect(matchesRegisteredRedirect(uri, registered)).toBe(false);
  });
});

describe("computeS256Challenge", () => {
  test("matches the RFC 7636 appendix B vector", async () => {
    expect(await computeS256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("isSafeInternalPath", () => {
  test.each([
    ["/", true],
    ["/oauth/authorize?client_id=x&state=y", true],
    ["//evil.com", false],
    ["https://evil.com", false],
    ["/a\\b", false],
    ["", false],
  ])("%s → %s", (path, ok) => {
    expect(isSafeInternalPath(path)).toBe(ok);
  });
});
