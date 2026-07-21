import { describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({
  createSession: vi.fn(async () => "token"),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  }),
}));

import { loginWithPassword } from "./password-login";

describe("loginWithPassword", () => {
  it("rejects unknown credentials with a clear message (no crash payload)", async () => {
    await expect(loginWithPassword("Nope", "wrong")).rejects.toThrow(
      "Ungültiger Benutzername oder Passwort",
    );
  });

  it("rejects empty credentials", async () => {
    await expect(loginWithPassword("", "")).rejects.toThrow(
      "Benutzername und Passwort erforderlich",
    );
  });
});
