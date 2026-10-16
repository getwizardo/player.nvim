import test from "node:test";
import assert from "node:assert/strict";

import { fetchTtml, isValidIsrc } from "./lrc-red.js";
import { decodeXml, parseLrc, parseTtml, plainText, tagBlocks, timing, xmlAttribute } from "./parsers.js";
import { hasWordTimings, plainLines } from "./lyrics-service.js";
import { dedupe, playableOnly } from "./search.js";
import { artistsOf } from "./providers/jiosaavn.js";
import { toCandidate } from "./providers/lrclib.js";
import { artistOf, isrcOf, toCandidate as toMusicBrainzCandidate } from "./providers/musicbrainz.js";
import { toCandidate as toItunesCandidate } from "./providers/itunes.js";
import { parseJson } from "./cli.js";
import type { LyricCandidate } from "./types.js";

test("parses namespaced TTML paragraphs and clock offsets", () => {
  const xml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00:02.500" end="00:00:04.000">Hello <span>world</span> &amp; you</p><p begin="00:00:01.000">Earlier</p></div></body></tt>`;
  assert.deepEqual(parseTtml(xml), [
    { start: 1, finish: 2.5, text: "Earlier" },
    { start: 2.5, finish: 4, text: "Hello world & you" },
  ]);
});

test("parses second-based and millisecond-based offsets", () => {
  assert.deepEqual(parseTtml('<tt><p begin="2.25s">One</p><p begin="1500ms">Two</p></tt>'), [
    { start: 1.5, finish: 2.25, text: "Two" },
    { start: 2.25, finish: 0, text: "One" },
  ]);
});

test("parses TTML word timing for karaoke spans", () => {
  const rows = parseTtml(
    '<tt xmlns:ttp="urn:ttp" ttp:frameRate="30"><body><p begin="00:00:02.000" end="00:00:04.000"><span begin="00:00:02.100" end="00:00:02.600">Hello</span> <span begin="00:00:02.700" end="00:00:03.200">world</span></p></body></tt>',
  );
  assert.equal(rows[0].text, "Hello world");
  assert.deepEqual(rows[0].words, [
    { start: 2.1, finish: 2.6, text: "Hello" },
    { start: 2.7, finish: 3.2, text: "world" },
  ]);
});

test("keeps the attributes that contain the other quote character", () => {
  assert.equal(xmlAttribute(`title="it's here"`, "title"), "it's here");
  assert.equal(xmlAttribute(`title='say "hi"'`, "title"), 'say "hi"');
  assert.equal(xmlAttribute(`other="x" title="y"`, "title"), "y");
  assert.equal(xmlAttribute(`data-title="x"`, "title"), undefined);
});

test("decodes the XML entities", () => {
  assert.equal(decodeXml("a &amp; b &lt;c&gt; &quot;d&quot; &#65;"), `a & b <c> "d" A`);
});

test("reads the text of a fragment", () => {
  assert.equal(plainText("  <span>Hello</span> <br/> world  "), "Hello world");
});

test("reads the blocks of a tag", () => {
  const blocks = tagBlocks('<p begin="1">one</p><p begin="2">two</p>', "p");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].body, "one");
  assert.equal(blocks[1].attrs.trim(), 'begin="2"');
});

test("converts the time expressions", () => {
  assert.equal(timing("00:00:01.500", 30, 30), 1.5);
  assert.equal(timing("01:00:00:15", 30, 30), 3600.5);
  assert.equal(timing("250ms", 30, 30), 0.25);
  assert.equal(timing("12s", 30, 30), 12);
  assert.equal(timing("60t", 30, 60), 1);
  assert.equal(timing(undefined, 30, 30), 0);
});

test("parses synced LRC timestamps", () => {
  assert.deepEqual(parseLrc("[00:01.50]First line\n[01:02.25]Second line"), [
    { start: 1.5, finish: 0, text: "First line" },
    { start: 62.25, finish: 0, text: "Second line" },
  ]);
});

test("parses a LRC line with several timestamps", () => {
  assert.deepEqual(parseLrc("[00:10.00][01:10.00]Repeated"), [
    { start: 10, finish: 0, text: "Repeated" },
    { start: 70, finish: 0, text: "Repeated" },
  ]);
});

test("ignores the LRC lines without a timestamp", () => {
  assert.deepEqual(parseLrc("plain text\n[00:01.00]timed"), [{ start: 1, finish: 0, text: "timed" }]);
});

test("turns the plain lyrics into lines", () => {
  assert.deepEqual(plainLines("first\n\nsecond\r\n"), [
    { start: 0, finish: 0, text: "first" },
    { start: 0, finish: 0, text: "second" },
  ]);
});

test("rejects malformed ISRCs before making a request", async () => {
  await assert.rejects(fetchTtml("not-an-isrc"), /Invalid ISRC/);
  assert.equal(isValidIsrc("gbum71029604"), true);
  assert.equal(isValidIsrc("GBUM7102960"), false);
});

test("removes the duplicated candidates", () => {
  const first: LyricCandidate = {
    provider: "LRCLIB",
    id: "1",
    title: "Song",
    artist: "Artist",
    album: "",
  };
  const second: LyricCandidate = { ...first, provider: "JioSaavn", id: "2" };
  const third: LyricCandidate = { ...first, title: "Another song" };
  assert.equal(dedupe([first, second, third]).length, 2);
});

test("reads the artists of a JioSaavn song", () => {
  assert.equal(artistsOf({ artists: { primary: [{ name: "A" }, { name: "B" }] } }), "A, B");
  assert.equal(artistsOf({ primaryArtists: "C" }), "C");
  assert.equal(artistsOf({}), "");
});

test("turns a LRCLIB record into a candidate", () => {
  const candidate = toCandidate({
    id: 42,
    trackName: "Song",
    artistName: "Artist",
    albumName: "Album",
    duration: 210,
    syncedLyrics: "[00:01.00]hi",
  });
  assert.equal(candidate.id, "42");
  assert.equal(candidate.duration, 210);
  assert.equal(candidate.hasSyncedLyrics, true);
  assert.equal(candidate.hasLyrics, true);
});

test("reports a readable error for a broken JSON document", () => {
  assert.throws(() => parseJson("{", "candidate"), /candidate is not valid JSON/);
  assert.deepEqual(parseJson('{"a":1}', "candidate"), { a: 1 });
});

test("turns a MusicBrainz recording into a candidate", () => {
  const candidate = toMusicBrainzCandidate({
    id: "abc",
    title: "Bohemian Rhapsody",
    length: 355000,
    "artist-credit": [{ name: "Queen" }],
    releases: [{ title: "A Night at the Opera" }],
    isrcs: ["gbum71029604"],
  });
  assert.equal(candidate.provider, "MusicBrainz");
  assert.equal(candidate.artist, "Queen");
  assert.equal(candidate.album, "A Night at the Opera");
  assert.equal(candidate.isrc, "GBUM71029604");
  assert.equal(candidate.duration, 355);
  assert.equal(candidate.hasSyncedLyrics, true);
});

test("joins the artists of a MusicBrainz recording", () => {
  assert.equal(artistOf({ "artist-credit": [{ name: "A" }, { name: "B" }] }), "A, B");
  assert.equal(artistOf({}), "");
  assert.equal(isrcOf({ isrcs: ["", "usug11904206"] }), "USUG11904206");
  assert.equal(isrcOf({}), undefined);
});

test("turns an iTunes song into a candidate", () => {
  const candidate = toItunesCandidate({
    trackId: 12345,
    trackName: "Song",
    artistName: "Artist",
    collectionName: "Album",
    trackTimeMillis: 210000,
    previewUrl: "https://example.com/preview.m4a",
  });
  assert.equal(candidate.provider, "iTunes");
  assert.equal(candidate.duration, 210);
  assert.equal(candidate.url, "https://example.com/preview.m4a");
});

test("removes the candidates that share an ISRC", () => {
  const first: LyricCandidate = {
    provider: "LRCLIB",
    id: "1",
    title: "Song",
    artist: "Artist",
    album: "",
    isrc: "GBUM71029604",
  };
  const second: LyricCandidate = { ...first, provider: "MusicBrainz", id: "2", title: "Song (Live)" };
  const third: LyricCandidate = { ...first, id: "3", title: "Another song", isrc: "USUG11904206" };
  assert.equal(dedupe([first, second, third]).length, 2);
});

test("detects the word level timings", () => {
  assert.equal(hasWordTimings([{ start: 0, finish: 1, text: "a" }]), false);
  assert.equal(
    hasWordTimings([{ start: 0, finish: 1, text: "a", words: [{ start: 0, finish: 1, text: "a" }] }]),
    true,
  );
});

test("keeps only the candidates that can be played", () => {
  const playable: LyricCandidate = {
    provider: "iTunes",
    id: "1",
    title: "Song",
    artist: "Artist",
    album: "",
    url: "https://example.com/preview.m4a",
  };
  const silent: LyricCandidate = { ...playable, id: "2", url: undefined };
  assert.deepEqual(
    playableOnly([playable, silent]).map((candidate) => candidate.id),
    ["1"],
  );
});
