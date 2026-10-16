/**
 * LRCLIB — the free, key-less, crowdsourced lyric database (https://lrclib.net/docs).
 *
 *   GET /api/search?q=<query>            search across track/artist/album
 *   GET /api/get/{id}                    a single record by numeric id
 *   GET /api/get?track_name=&artist_name=&album_name=&duration=
 *                                        exact signature lookup
 *
 * Every record carries `syncedLyrics` (LRC), `plainLyrics` and a `lyricsfile`
 * YAML document; the plugin uses the LRC text and falls back to plain lines.
 * LRCLIB asks clients to identify themselves, which `http.ts` does through its
 * `user-agent` header.
 */

import { get as getOptions } from "../config";
import { getJson } from "../http";
import { parseLrc } from "../format/lrc";
import type { LyricCandidate, LyricLine } from "../types";
import { asArray, asNumber, asRecord, asText, buildUrl, splitLines, trim } from "../util";

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  hasWordSync: boolean;
  syncedLyrics: string;
  plainLyrics: string;
}

function base(): string {
  return getOptions().lyric.lrclib;
}

function readRecord(value: unknown): LrclibRecord | undefined {
  const record = asRecord(value);
  const id = asNumber(record.id);
  if (id === undefined) return undefined;
  return {
    id,
    trackName: asText(record.trackName, asText(record.name, "Unknown title")),
    artistName: asText(record.artistName, "Unknown artist"),
    albumName: asText(record.albumName),
    duration: asNumber(record.duration) ?? 0,
    instrumental: record.instrumental === true,
    hasWordSync: record.hasWordSync === true,
    syncedLyrics: asText(record.syncedLyrics),
    plainLyrics: asText(record.plainLyrics),
  };
}

export function search(query: string, callback: (candidates: LyricCandidate[], error?: string) => void): void {
  const term = trim(query);
  if (term === "") {
    callback([], "Enter a song title or artist to search LRCLIB.");
    return;
  }
  const url = buildUrl(base(), "/api/search", { q: term });
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: getOptions().lyric.timeout }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    const candidates: LyricCandidate[] = [];
    for (const entry of asArray(payload)) {
      const record = readRecord(entry);
      if (record === undefined || record.instrumental) continue;
      const candidate: LyricCandidate = {
        provider: "LRCLIB",
        id: tostring(record.id),
        title: record.trackName,
        artist: record.artistName,
        album: record.albumName,
        sync: record.syncedLyrics !== "" ? "line" : "none",
      };
      if (record.duration > 0) candidate.duration = record.duration;
      candidates.push(candidate);
    }
    callback(candidates);
  });
}

export function getById(id: number, callback: (record: LrclibRecord | undefined, error?: string) => void): void {
  getJson<unknown>(buildUrl(base(), `/api/get/${id}`), { headers: { accept: "application/json" }, timeout: getOptions().lyric.timeout }, (payload, error) => {
    if (payload === undefined) {
      callback(undefined, error);
      return;
    }
    callback(readRecord(payload));
  });
}

export function getBySignature(
  track: string,
  artist: string,
  album: string | undefined,
  duration: number | undefined,
  callback: (record: LrclibRecord | undefined, error?: string) => void,
): void {
  if (trim(track) === "" || trim(artist) === "") {
    callback(undefined, "LRCLIB signature lookup needs a title and an artist.");
    return;
  }
  const url = buildUrl(base(), "/api/get", {
    track_name: trim(track),
    artist_name: trim(artist),
    album_name: album === undefined || trim(album) === "" ? undefined : trim(album),
    duration: duration !== undefined && duration > 0 ? math.floor(duration) : undefined,
  });
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: getOptions().lyric.timeout }, (payload, error) => {
    if (payload === undefined) {
      callback(undefined, error);
      return;
    }
    callback(readRecord(payload));
  });
}

/** Resolve a record's text into timed (or plain) lyric lines. */
export function linesFrom(record: LrclibRecord): { lines: LyricLine[]; source: string } {
  if (record.syncedLyrics !== "") {
    const parsed = parseLrc(record.syncedLyrics);
    if (parsed.lines.length > 0) return { lines: parsed.lines, source: "LRCLIB · synced LRC" };
  }
  const plain = splitLines(record.plainLyrics)
    .map((text) => trim(text))
    .filter((text) => text !== "")
    .map((text) => ({ start: 0, finish: 0, text }));
  return { lines: plain, source: "LRCLIB · plain text" };
}
