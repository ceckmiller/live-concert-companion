import { describe, expect, it } from "vitest";
import { hashToken, magicLinkUrl, randomToken, tokensEqual } from "./tokens";

describe("auth tokens", () => {
  it("generates unique tokens", () => {
    expect(randomToken()).not.toBe(randomToken());
  });

  it("hashes deterministically and compares safely", () => {
    const a = hashToken("hello");
    expect(hashToken("hello")).toBe(a);
    expect(tokensEqual(a, hashToken("hello"))).toBe(true);
    expect(tokensEqual(a, hashToken("other"))).toBe(false);
  });

  it("builds magic link urls", () => {
    expect(magicLinkUrl("abc")).toContain("/auth/magic?token=abc");
  });
});
