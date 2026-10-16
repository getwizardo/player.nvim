/**
 * lrc.red — a free, public TTML lyric catalogue (29M+ tracks).
 *
 * Documented routes (see https://lrc.red/docs):
 *   GET /s/<ISRC>            lyrics page
 *   GET /s/<ISRC>.ttml       word-synced TTML
 *   GET /s/<ISRC>.lrc        line-synced LRC
 *   GET /s/<ISRC>.json       metadata (title, artist, songwriters, sync mode)
 *
 * The service also answers free-text lookups, which the plugin uses to find an
 * ISRC without asking the user for one:
 *   GET /match.json?track=&artist=&album=&duration=   weighted match, `score`
 *   GET /search.json?q=                               full text search
 */

import { get as getOptions } from "../config";
import { getJson, getText } from "../http";
import { parseTtml, type TtmlDocument } from "../format/ttml";
import type { LyricCandidate } from "../types";
import { asArray, asNumber, asRecord, asText, buildUrl, match as matchPattern, trim, upper } from "../util";

export interface LrcRedHit {
  isrc: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  duration?: number;
  score?: number;
  cover?: string;
}

export interface LrcRedMetadata {
  isrc: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  language: string;
  sync: string;
  lines: number;
  songwriters: string[];
  ttml?: string;
  lrc?: string;
}

export type HitsCallback = (hits: LrcRedHit[], error?: string) => void;

function base(): string {
  return getOptions().lyric.lrc_red;
}

function timeout(): number {
  return getOptions().lyric.timeout;
}

function readHits(payload: unknown): LrcRedHit[] {
  const hits: LrcRedHit[] = [];
  for (const entry of asArray(asRecord(payload).hits)) {
    const record = asRecord(entry);
    const isrc = upper(trim(asText(record.isrc)));
    if (isrc === "") continue;
    const hit: LrcRedHit = {
      isrc,
      title: asText(record.title, "Unknown title"),
      artist: asText(record.artist, "Unknown artist"),
      album: asText(record.album),
    };
    const year = asNumber(record.year);
    const duration = asNumber(record.duration);
    const score = asNumber(record.score);
    if (year !== undefined) hit.year = year;
    if (duration !== undefined) hit.duration = duration;
    if (score !== undefined) hit.score = score;
    const cover = asText(record.cover);
    if (cover !== "") hit.cover = cover;
    hits.push(hit);
  }
  return hits;
}

/** Full text search: `GET /search.json?q=<query>`. */
export function search(query: string, callback: HitsCallback): void {
  const term = trim(query);
  if (term === "") {
    callback([], "Enter a song title or artist to search lrc.red.");
    return;
  }
  const url = buildUrl(base(), "/search.json", { q: term });
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: timeout() }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    callback(readHits(payload));
  });
}

/** Weighted match used to find the ISRC of the track that is playing. */
export function match(track: string, artist: string, album: string | undefined, duration: number | undefined, callback: HitsCallback): void {
  if (trim(track) === "" && trim(artist) === "") {
    callback([], "lrc.red matching needs a title or an artist.");
    return;
  }
  const url = buildUrl(base(), "/match.json", {
    track: trim(track) === "" ? undefined : trim(track),
    artist: trim(artist) === "" ? undefined : trim(artist),
    album: album === undefined || trim(album) === "" ? undefined : trim(album),
    duration: duration !== undefined && duration > 0 ? math.floor(duration) : undefined,
  });
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: timeout() }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    callback(readHits(payload));
  });
}

/** `GET /s/<ISRC>.json` — metadata, including whether word sync exists. */
export function metadata(isrc: string, callback: (meta: LrcRedMetadata | undefined, error?: string) => void): void {
  const code = upper(trim(isrc));
  if (code === "") {
    callback(undefined, "An ISRC is required.");
    return;
  }
  const url = buildUrl(base(), `/s/${code}.json`);
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: timeout() }, (payload, error) => {
    if (payload === undefined) {
      callback(undefined, error);
      return;
    }
    const record = asRecord(payload);
    const writers: string[] = [];
    for (const writer of asArray(record.songwriters)) {
      const name = asText(writer);
      if (name !== "") writers.push(name);
    }
    const files = asRecord(record.files);
    const meta: LrcRedMetadata = {
      isrc: asText(record.isrc, code),
      title: asText(record.title),
      artist: asText(record.artist),
      album: asText(record.album),
      duration: asNumber(record.duration) ?? 0,
      language: asText(record.language),
      sync: asText(record.sync),
      lines: asNumber(record.lines) ?? 0,
      songwriters: writers,
    };
    const ttml = asText(files.ttml);
    const lrc = asText(files.lrc);
    if (ttml !== "") meta.ttml = ttml;
    if (lrc !== "") meta.lrc = lrc;
    callback(meta);
  });
}

/** `GET /s/<ISRC>.ttml` parsed into timed lyric lines. */
export function fetchTtml(isrc: string, callback: (document: TtmlDocument | undefined, error?: string) => void): void {
  const code = upper(trim(isrc));
  if (matchPattern(code, "^[A-Z][A-Z][A-Z0-9][A-Z0-9][A-Z0-9]%d%d%d%d%d%d%d$").length === 0) {
    callback(undefined, `"${isrc}" is not a 12 character ISRC (for example GBUM71029604).`);
    return;
  }
  const url = buildUrl(base(), `/s/${code}.ttml`);
  getText(url, { headers: { accept: "application/ttml+xml, application/xml" }, timeout: timeout() }, (body, error) => {
    if (body === undefined) {
      callback(undefined, error);
      return;
    }
    const document = parseTtml(body);
    if (document.lines.length === 0) {
      callback(undefined, `lrc.red returned a TTML document with no timed lines for ${code}.`);
      return;
    }
    callback(document);
  });
}

/** Turn catalogue hits into selectable lyric candidates. */
export function toCandidates(hits: LrcRedHit[]): LyricCandidate[] {
  return hits.map((hit) => {
    const candidate: LyricCandidate = {
      provider: "lrc.red",
      id: hit.isrc,
      title: hit.title,
      artist: hit.artist,
      album: hit.album,
      isrc: hit.isrc,
    };
    if (hit.duration !== undefined) candidate.duration = hit.duration;
    if (hit.score !== undefined) candidate.score = hit.score;
    if (hit.year !== undefined) candidate.year = hit.year;
    return candidate;
  });
}
