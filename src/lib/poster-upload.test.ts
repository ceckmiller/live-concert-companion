import { describe, expect, it } from "vitest";
import {
  isAllowedPosterUpload,
  isBlobPosterUrl,
  isValidPosterPath,
  parsePosterUploadFilename,
  posterTitleFromFilename,
  posterUploadExtension,
  POSTER_UPLOAD_MAX_BYTES,
  readPosterUploadFromFormData,
  resolvePosterLabel,
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
    expect(isValidPosterPath("/api/posters/550e8400-e29b-41d4-a716-446655440000.jpg")).toBe(true);
    expect(isValidPosterPath("../secret")).toBe(false);
  });

  it("reads upload blobs from FormData without requiring File", async () => {
    const fd = new FormData();
    fd.set("file", new File([Uint8Array.from([1, 2, 3])], "phone.jpg", { type: "image/jpeg" }));
    const parsed = await readPosterUploadFromFormData(fd);
    expect(parsed.name).toBe("phone.jpg");
    expect(parsed.type).toBe("image/jpeg");
    expect(parsed.buffer.length).toBe(3);
  });

  it("parses uploaded poster filenames", () => {
    expect(parsePosterUploadFilename("550e8400-e29b-41d4-a716-446655440000.jpg")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(parsePosterUploadFilename("not-a-uuid.png")).toBeNull();
  });

  it("derives a readable title from filenames", () => {
    expect(posterTitleFromFilename("Peter Fox LIVE 2023.jpg")).toBe("Peter Fox LIVE 2023");
  });

  it("detects blob preview urls", () => {
    expect(isBlobPosterUrl("blob:http://localhost/abc")).toBe(true);
    expect(isBlobPosterUrl("/posters/uploads/abc.jpg")).toBe(false);
  });

  it("keeps the existing label when only adjusting crop", () => {
    expect(
      resolvePosterLabel({
        posterTitle: "Aktuelles Plakat",
        tourName: "Never Let Me Down Tour",
        posterUrl: "/posters/uploads/abc.jpg",
        existingPosterPath: "/posters/uploads/abc.jpg",
        existingPosterLabel: "Tourplakat: Never Let Me Down Tour",
      }),
    ).toBe("Tourplakat: Never Let Me Down Tour");
  });
});
