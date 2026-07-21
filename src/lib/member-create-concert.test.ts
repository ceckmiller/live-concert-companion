import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("member create concert access", () => {
  it("lets any logged-in user open the create-concert page (not admin-only)", () => {
    const src = readFileSync(
      path.join(__dirname, "../app/admin/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/requireUser\s*\(/);
    expect(src).not.toMatch(/requireAdmin\s*\(/);
  });

  it("createConcert authenticates via requireUser (members included)", () => {
    const src = readFileSync(path.join(__dirname, "actions.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function createConcert"));
    expect(fn).toMatch(/await requireUser\s*\(/);
    expect(fn.slice(0, 400)).not.toMatch(/requireAdmin\s*\(/);
  });
});
