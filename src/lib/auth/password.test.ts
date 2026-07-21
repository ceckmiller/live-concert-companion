import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("hashes and verifies admin123", () => {
    const stored = hashPassword("admin123");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("admin123", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
    expect(verifyPassword("admin123", null)).toBe(false);
  });
});
