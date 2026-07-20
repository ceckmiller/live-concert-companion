import { describe, expect, it } from "vitest";
import {
  isAllowedPosterUpload,
  isValidPosterPath,
  posterTitleFromFilename,
  posterUploadExtension,
  POSTER_UPLOAD_MAX_BYTES,
} from "./poster-upload";

describe("poster upload", () => {
  it("accepts common image formats up to 10 MB", () => {
    expect(isAllowedPosterUpload("image/jpeg", 1024)).toBe(true);
    expect(isAllowedPosterUpload("image/png", POSTER_UPLOAD_MAX_BYTES)).toBe(true);
    expect(isAllowedPosterUpload("image/jpeg", POSTER_UPLOAD_MAX_BYTES + 1)).toBe(false);
    expect(isAllowedPosterUpload("application/pdf", 1024)).toBe(false);
  });

  it("maps mime types to safe extensions", () => {
    expect(posterUploadExtension("image/webp", "poster.webp")).toBe(".webp");
    expect(posterUploadExtension("image/jpeg", "foo.jpeg")).toBe(".jpg");
  });

  it("accepts remote and local poster paths", () => {
    expect(isValidPosterPath("https://example.com/poster.jpg")).toBe(true);
    expect(isValidPosterPath("/posters/uploads/abc.jpg")).toBe(true);
    expect(isValidPosterPath("../secret")).toBe(false);
  });

  it("derives a readable title from filenames", () => {
    expect(posterTitleFromFilename("Peter Fox LIVE 2023.jpg")).toBe("Peter Fox LIVE 2023");
  });
});
