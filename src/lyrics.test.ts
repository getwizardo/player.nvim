import test from "node:test";
import assert from "node:assert/strict";
import { fetchTtml, parseLrc, parseTtml } from "./lyrics.js";

test("parses namespaced TTML paragraphs and clock offsets", () => {
  const xml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00:02.500" end="00:00:04.000">Hello <span>world</span> &amp; you</p><p begin="00:00:01.000">Earlier</p></div></body></tt>`;
  assert.deepEqual(parseTtml(xml), [
    { start: 1, finish: 0, text: "Earlier" },
    { start: 2.5, finish: 4, text: "Hello world & you" },
  ]);
});

test("parses second-based and millisecond-based offsets", () => {
  assert.deepEqual(parseTtml('<tt><p begin="2.25s">One</p><p begin="1500ms">Two</p></tt>'), [
    { start: 1.5, finish: 0, text: "Two" },
    { start: 2.25, finish: 0, text: "One" },
  ]);
});

test("parses TTML word timing for karaoke spans", () => {
  const rows = parseTtml('<tt xmlns:ttp="urn:ttp" ttp:frameRate="30"><body><p begin="00:00:02.000" end="00:00:04.000"><span begin="00:00:02.100" end="00:00:02.600">Hello</span> <span begin="00:00:02.700" end="00:00:03.200">world</span></p></body></tt>');
  assert.equal(rows[0].text, "Hello world");
  assert.deepEqual(rows[0].words, [
    { start: 2.1, finish: 2.6, text: "Hello" },
    { start: 2.7, finish: 3.2, text: "world" },
  ]);
});

test("parses synced LRC timestamps", () => {
  assert.deepEqual(parseLrc("[00:01.50]First line\n[01:02.25]Second line"), [
    { start: 1.5, finish: 0, text: "First line" },
    { start: 62.25, finish: 0, text: "Second line" },
  ]);
});

test("rejects malformed ISRCs before making a request", async () => {
  await assert.rejects(fetchTtml("not-an-isrc"), /Invalid ISRC/);
});
