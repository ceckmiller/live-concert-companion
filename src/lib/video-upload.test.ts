import { describe, expect, it } from "vitest";
import { isAllowedVideoUpload, isValidVideoPath } from "./video-upload";

describe("video-upload", () => {
  it("accepts mp4 uploads under limit", () => {
    expect(isAllowedVideoUpload("video/mp4", 1024)).toBe(true);
  });

  it("rejects oversize uploads", () => {
    expect(isAllowedVideoUpload("video/mp4", 501 * 1024 * 1024)).toBe(false);
  });

  it("validates local upload paths", () => {
    expect(isValidVideoPath("/videos/uploads/abc.mp4")).toBe(true);
    expect(isValidVideoPath("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isValidVideoPath("/etc/passwd")).toBe(false);
  });
});
