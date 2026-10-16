/**
 * LRC reader.
 *
 * Supports classic line timestamps, repeated timestamps on one line, the
 * metadata header (`[ti:]`, `[ar:]`, `[al:]`, `[offset:]`) and the "A2"
 * enhanced word timestamps (`<mm:ss.xx>word`) used by several catalogues.
 */

import type { LyricLine, LyricWord } from "../types";
import { lower, match, matchList, matchTriples, replace, trim } from "../util";

export interface LrcMeta {
  title: string;
  artist: string;
  album: string;
  /** Milliseconds added to every timestamp by the `[offset:]` tag. */
  offset: number;
}

export interface LrcDocument {
  lines: LyricLine[];
  meta: LrcMeta;
}

function stampSeconds(minutes: string, seconds: string): number {
  return (tonumber(minutes) ?? 0) * 60 + (tonumber(seconds) ?? 0);
}

/** Parse enhanced word timestamps out of an LRC line body. */
function readWords(body: string): LyricWord[] {
  const words: LyricWord[] = [];
  for (const [minutes, seconds, text] of matchTriples(body, "<(%d+):(%d+%.?%d*)>([^<]*)")) {
    const value = trim(text);
    if (value === "") continue;
    words.push({ start: stampSeconds(minutes, seconds), finish: 0, text: value });
  }
  return words;
}

function cleanBody(body: string): string {
  return trim(replace(replace(body, "<[^>]+>", " "), "%s+", " "));
}

export function parseLrc(lrc: string): LrcDocument {
  const meta: LrcMeta = { title: "", artist: "", album: "", offset: 0 };
  const raw: LyricLine[] = [];
  for (const source of matchList(lrc, "[^\r\n]+")) {
    const line = trim(source);
    if (line === "") continue;
    // Lua's gmatch cannot anchor, so peel the leading stamps off one at a time.
    const stamps: number[] = [];
    let rest = line;
    while (true) {
      const parts = match(rest, "^%[(%d+):(%d+%.?%d*)%]%s*(.*)$");
      if (parts.length < 3) break;
      stamps.push(stampSeconds(parts[0], parts[1]));
      rest = parts[2];
    }
    const body = rest;
    if (stamps.length === 0) {
      const tagged = match(line, "^%[([%a#]+):(.*)%]$");
      if (tagged.length === 2) {
        const key = lower(tagged[0]);
        const value = trim(tagged[1]);
        if (key === "offset") meta.offset = tonumber(value) ?? 0;
        else if (key === "ti" || key === "title") meta.title = value;
        else if (key === "ar" || key === "artist") meta.artist = value;
        else if (key === "al" || key === "album") meta.album = value;
        continue;
      }
      if (body === "") continue;
      raw.push({ start: 0, finish: 0, text: cleanBody(body) });
      continue;
    }
    if (body === "") continue;
    const words = readWords(body);
    const text = words.length > 0 ? words.map((word) => word.text).join(" ") : cleanBody(body);
    for (const stamp of stamps) {
      const entry: LyricLine = { start: stamp, finish: 0, text };
      if (words.length > 0) entry.words = words.map((word) => ({ ...word }));
      raw.push(entry);
    }
  }

  const offset = meta.offset / 1000;
  for (const line of raw) {
    line.start = math.max(0, line.start + offset);
    if (line.words !== undefined) {
      for (const word of line.words) word.start = math.max(0, word.start + offset);
    }
  }
  raw.sort((a, b) => a.start - b.start);
  raw.forEach((line, index) => {
    if (line.finish === 0 && raw[index + 1] !== undefined) line.finish = raw[index + 1].start;
    if (line.words !== undefined) {
      line.words.forEach((word, position) => {
        if (word.finish === 0) word.finish = line.words?.[position + 1]?.start ?? line.finish;
      });
    }
  });
  return { lines: raw, meta };
}
