import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { SLUG_ALIASES } from "./sync-poster-overrides-to-db";

describe("sync poster overrides slug aliases", () => {
  it("maps legacy Heino Aid override key to current festival slug", () => {
    expect(SLUG_ALIASES["heino-aid-1986-10-18"]).toBe(
      "benefizkonzert-fur-den-wahren-heino-1986-10-18",
    );
  });
});
