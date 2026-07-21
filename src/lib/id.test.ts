import { describe, expect, it } from "vitest";
import { looksLikeUuid } from "./id";

describe("looksLikeUuid", () => {
  it("accepts standard UUIDs", () => {
    expect(looksLikeUuid("c83250b9-6880-4b89-874c-00ca8675d990")).toBe(true);
  });

  it("rejects slugs", () => {
    expect(looksLikeUuid("madstock")).toBe(false);
    expect(looksLikeUuid("placebo-2022-10-06")).toBe(false);
  });
});
