import { describe, expect, test } from "vitest";
import { randomHex, randomToken, sha256Hex } from "./token-crypto";

describe("sha256Hex", () => {
  test("hashes to the known vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("randomToken / randomHex", () => {
  test("randomToken is base64url and unique", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars
    expect(randomToken()).not.toBe(a);
  });

  test("randomHex is lowercase hex of requested length", () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
  });
});
