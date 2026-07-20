import { describe, expect, it } from "vitest";
import { parseSetlistFmSongs } from "./setlist-fm-fetch";

describe("parseSetlistFmSongs", () => {
  it("parses song titles from setlist.fm HTML", () => {
    const html = `
      <ul class="setlistList">
        <li class="setlistParts">
          <div class="songPart">Song One</div>
        </li>
        <li class="setlistParts">
          <div class="songPart">Song Two (cover)</div>
        </li>
      </ul>
    `;
    expect(parseSetlistFmSongs(html)).toEqual(["Song One", "Song Two (cover)"]);
  });
});
