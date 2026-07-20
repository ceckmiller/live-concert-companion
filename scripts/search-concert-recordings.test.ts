import { describe, expect, it } from "vitest";
import { formatDuration, listRecordingSearchTasks, recordingSearchQueries } from "./search-concert-recordings.mjs";
import { songVideoSearchQueries } from "./search-concert-youtube.mjs";

describe("search-concert-recordings", () => {
  it("prefers venue in recording search queries", () => {
    const queries = recordingSearchQueries({
      artistName: "Danger Dan",
      city: "Berlin",
      venue: "Parkbühne Wuhlheide",
      sort: "2023-06-02",
      title: "Danger Dan - Wuhlheide",
    });
    expect(queries[0]).toContain("Parkbühne Wuhlheide");
    expect(queries.some((q) => q.includes("2023"))).toBe(true);
  });

  it("lists concerts without manual recordings", () => {
    const tasks = listRecordingSearchTasks({ concertId: "danger-dan-2023-06-02" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].venue).toBe("Parkbühne Wuhlheide");
  });

  it("formats duration for Mitschnitte labels", () => {
    expect(formatDuration(9651)).toBe("2:40:51");
    expect(formatDuration(118)).toBe("1:58");
  });
});

describe("search-concert-youtube venue queries", () => {
  it("includes venue before city-only fallback for Danger Dan Wuhlheide", () => {
    const queries = songVideoSearchQueries({
      artistName: "Danger Dan",
      city: "Berlin",
      venue: "Parkbühne Wuhlheide",
      sort: "2023-06-02",
      song: "Lauf davon",
    });
    expect(queries[0]).toContain("Parkbühne Wuhlheide");
    expect(queries.some((q) => q.includes("Lauf davon"))).toBe(true);
  });
});
