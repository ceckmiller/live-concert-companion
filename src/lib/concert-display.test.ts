import { describe, expect, it } from "vitest";
import { showLongRecordingsSection, soleConcertRecording } from "./concert-display";

describe("concert display policy", () => {
  it("links concert title only for a single recording", () => {
    const one = [{ title: "Full show", url: "https://youtube.com/watch?v=abc", duration: "1:30:00" }];
    expect(soleConcertRecording(one)?.url).toContain("youtube.com");
    expect(soleConcertRecording([])).toBeNull();
    expect(soleConcertRecording(undefined)).toBeNull();
    expect(soleConcertRecording([...one, { ...one[0], title: "Alt angle" }])).toBeNull();
  });

  it("shows longer recordings section only when there are multiple", () => {
    const one = [{ title: "A", url: "https://youtube.com/a", duration: "1:00:00" }];
    expect(showLongRecordingsSection(one)).toBe(false);
    expect(showLongRecordingsSection([one[0], { ...one[0], title: "B" }])).toBe(true);
    expect(showLongRecordingsSection(undefined)).toBe(false);
  });
});
