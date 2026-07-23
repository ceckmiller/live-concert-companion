import { describe, expect, it } from "vitest";
import {
  extractSetlistLinks,
  parseSetlistFmMarkdownSongs,
  parseSetlistFmSongs,
} from "./setlist-fm-fetch";

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

describe("parseSetlistFmMarkdownSongs", () => {
  it("parses Portishead Arena Berlin 1998 setlist from jina markdown", () => {
    const markdown = `
## Setlist
1. [Humming](http://www.setlist.fm/stats/songs/portishead-23d6889f.html?songid=73d44629)
2. [Numb](http://www.setlist.fm/stats/songs/portishead-23d6889f.html?songid=6bd45e6e)
3. [Glory Box](http://www.setlist.fm/stats/songs/portishead-23d6889f.html?songid=33d6c84d)
14. Encore:
15. [Sour Times](http://www.setlist.fm/stats/songs/portishead-23d6889f.html?songid=3bd7b8fc)
16. [Strangers](http://www.setlist.fm/stats/songs/portishead-23d6889f.html?songid=bd7b17e)
`;
    expect(parseSetlistFmMarkdownSongs(markdown)).toEqual([
      "Humming",
      "Numb",
      "Glory Box",
      "Sour Times",
      "Strangers",
    ]);
  });
});

describe("extractSetlistLinks", () => {
  it("finds absolute markdown setlist links from search results", () => {
    const md = `[Portishead at Arena Berlin](https://www.setlist.fm/setlist/portishead/1998/arena-berlin-berlin-germany-43cdd33b.html)`;
    expect(extractSetlistLinks(md)).toEqual([
      {
        url: "https://www.setlist.fm/setlist/portishead/1998/arena-berlin-berlin-germany-43cdd33b.html",
        label: "https://www.setlist.fm/setlist/portishead/1998/arena-berlin-berlin-germany-43cdd33b.html",
      },
    ]);
  });
});
