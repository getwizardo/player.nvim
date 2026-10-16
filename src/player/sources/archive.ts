/**
 * Internet Archive (archive.org) — free, key-less, and full of netlabels, live
 * concerts and public-domain audio.
 *
 *   GET /advancedsearch.php?q=<query>&fl[]=identifier&fl[]=title&fl[]=creator&rows=N&output=json
 *   GET /metadata/<identifier>          file list used to build stream URLs
 *
 * Files stream straight from `https://archive.org/download/<identifier>/<file>`,
 * which mpv plays directly.
 */

import { get as getOptions } from "../config";
import { getJson } from "../http";
import type { TrackResult } from "../types";
import { asArray, asNumber, asRecord, asText, buildUrl, pathEncode, trim } from "../util";

/** Derivative/original formats worth offering for playback. */
const AUDIO_FORMATS = [
  "VBR MP3",
  "128Kbps MP3",
  "MP3",
  "64Kbps MP3",
  "Flac",
  "24bit Flac",
  "Ogg Vorbis",
  "Apple Lossless",
  "WAV",
];

function base(): string {
  return getOptions().search.archive;
}

function timeout(): number {
  return getOptions().search.timeout;
}

/** Restrict the search to audio items and skip the per-file sub-items. */
function audioQuery(query: string): string {
  return `${query} AND mediatype:(audio) AND !format:(Cue Sheet)`;
}

export function search(query: string, callback: (tracks: TrackResult[], error?: string) => void): void {
  const term = trim(query);
  if (term === "") {
    callback([], "Enter a search term for the Internet Archive.");
    return;
  }
  const limit = getOptions().search.limit > 0 ? getOptions().search.limit : 12;
  const url = `${buildUrl(base(), "/advancedsearch.php", {
    q: audioQuery(term),
    rows: limit,
    page: 1,
    output: "json",
  })}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year`;
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: timeout() }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    const docs = asArray(asRecord(asRecord(payload).response).docs);
    const tracks: TrackResult[] = [];
    for (const entry of docs) {
      const doc = asRecord(entry);
      const identifier = asText(doc.identifier);
      if (identifier === "") continue;
      const title = asText(doc.title, identifier);
      const track: TrackResult = {
        provider: "Archive",
        title,
        artist: asText(doc.creator, asText(doc.collection)),
        url: buildUrl(base(), `/download/${identifier}/`),
      };
      const year = asNumber(doc.year);
      if (year !== undefined) track.album = tostring(year);
      tracks.push(track);
    }
    callback(tracks);
  });
}

/** List the playable audio files inside an archive item. */
export function tracks(identifier: string, callback: (tracks: TrackResult[], error?: string) => void): void {
  const url = buildUrl(base(), `/metadata/${identifier}`);
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: timeout() }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    const files = asArray(asRecord(payload).files);
    const found: TrackResult[] = [];
    for (const entry of files) {
      const file = asRecord(entry);
      const format = asText(file.format);
      const name = asText(file.name);
      if (name === "" || !AUDIO_FORMATS.includes(format)) continue;
      const track: TrackResult = {
        provider: "Archive",
        title: asText(file.title, name),
        artist: asText(file.creator, asText(file.artist)),
        url: `${buildUrl(base(), "/download/")}${pathEncode(identifier)}/${pathEncode(name)}`,
      };
      const length = tonumber(asText(file.length));
      if (length !== undefined && length > 0) track.duration = length;
      const album = asText(file.album);
      if (album !== "") track.album = album;
      found.push(track);
    }
    found.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
    callback(found);
  });
}
