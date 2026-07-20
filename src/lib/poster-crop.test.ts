import { describe, expect, it } from "vitest";
import {
  clampPan,
  containedImageSize,
  maxPanForZoom,
  normalizePosterCrop,
  parsePosterCropJson,
  posterCropEditorStyle,
  posterCropLayout,
  serializePosterCropJson,
} from "./poster-crop";

describe("poster crop", () => {
  it("clamps pan to visible range for zoom level (legacy cover)", () => {
    const max = maxPanForZoom(2, 200, 200);
    expect(max.x).toBe(100);
    expect(clampPan({ x: 999, y: -999 }, { zoom: 2, panX: 0, panY: 0 }, 200, 200)).toEqual({
      x: 100,
      y: -100,
    });
  });

  it("allows vertical pan for landscape images on portrait frame", () => {
    const frame = { width: 280, height: 374 };
    const image = { width: 800, height: 600 };
    const base = containedImageSize(image.width, image.height, frame.width, frame.height);
    expect(base.width).toBe(280);
    expect(base.height).toBe(210);
    const max = maxPanForZoom(1, frame.width, frame.height, image);
    expect(max.x).toBe(0);
    expect(max.y).toBe(82);
    expect(
      clampPan({ x: 0, y: 120 }, { zoom: 1, panX: 0, panY: 0, imageW: 800, imageH: 600 }, frame.width, frame.height),
    ).toEqual({ x: 0, y: 82 });
  });

  it("allows horizontal pan for portrait images on portrait frame", () => {
    const frame = { width: 280, height: 374 };
    const image = { width: 600, height: 900 };
    const base = containedImageSize(image.width, image.height, frame.width, frame.height);
    expect(base.height).toBe(374);
    expect(Math.round(base.width)).toBe(249);
    const max = maxPanForZoom(1, frame.width, frame.height, image);
    expect(max.y).toBe(0);
    expect(max.x).toBeGreaterThan(0);
  });

  it("normalizes invalid crop payloads", () => {
    expect(normalizePosterCrop({ zoom: 8, panX: 40, panY: -10, imageW: 1000, imageH: 500 })).toMatchObject({
      zoom: 4,
      panX: 40,
      panY: -10,
      imageW: 1000,
      imageH: 500,
    });
    expect(normalizePosterCrop({ zoom: "bad" })).toBeNull();
    expect(normalizePosterCrop({ zoom: 0.2, panX: 0, panY: 0, imageW: 100, imageH: 100 })).toMatchObject({
      zoom: 0.5,
    });
  });

  it("parses stored crop json", () => {
    expect(
      parsePosterCropJson(JSON.stringify({ zoom: 1.5, panX: 12, panY: -8, imageW: 640, imageH: 480 })),
    ).toEqual({
      zoom: 1.5,
      panX: 12,
      panY: -8,
      imageW: 640,
      imageH: 480,
    });
  });

  it("drops default crop when serializing", () => {
    expect(serializePosterCropJson({ zoom: 1, panX: 0, panY: 0 })).toBeNull();
    expect(serializePosterCropJson({ zoom: 1, panX: 0, panY: 0, imageW: 800, imageH: 600 })).toBe(
      JSON.stringify({ zoom: 1, panX: 0, panY: 0, imageW: 800, imageH: 600 }),
    );
    expect(serializePosterCropJson({ zoom: 1.2, panX: 5, panY: 0, imageW: 300, imageH: 400 })).toBe(
      JSON.stringify({ zoom: 1.2, panX: 5, panY: 0, imageW: 300, imageH: 400 }),
    );
  });

  it("builds contain layout for the fixed crop editor viewport", () => {
    const crop = { zoom: 1.5, panX: 20, panY: -10, imageW: 800, imageH: 600 };
    const layout = posterCropLayout(crop);
    expect(layout).not.toBeNull();
    expect(layout!.width).toBe(420);
    expect(layout!.height).toBe(315);
    expect(posterCropEditorStyle(crop)).toMatchObject({
      position: "absolute",
      left: "50%",
      top: "50%",
    });
  });
});
