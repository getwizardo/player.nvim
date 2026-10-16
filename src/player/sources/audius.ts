/**
 * Audius — a decentralised music platform with a free, key-less API.
 *
 *   GET https://api.audius.co                 discovery: list of API hosts
 *   GET <host>/v1/tracks/search?query=&app_name=
 *   GET <host>/v1/tracks/<id>/stream?app_name=   302 to the audio file
 *
 * mpv follows the redirect, so the stream URL is directly playable.
 */

import { get as getOptions } from "../config";
import { getJson } from "../http";
import type { TrackResult } from "../types";
import { asArray, asNumber, asRecord, asText, buildUrl, findPattern, trim } from "../util";

const APP_NAME = "player.nvim";
let host: string | undefined;

function discovery(): string {
  return getOptions().search.audius;
}

function timeout(): number {
  return getOptions().search.timeout;
}

/** Pick an API host (cached) and hand it to `callback`. */
function withHost(callback: (base: string | undefined, error?: string) => void): void {
  if (host !== undefined) {
    callback(host);
    return;
  }
  getJson<unknown>(discovery(), { headers: { accept: "application/json" }, timeout: timeout() }, (payload, error) => {
    if (payload === undefined) {
      callback(undefined, error);
      return;
    }
    for (const entry of asArray(asRecord(payload).data)) {
      const candidate = asText(entry);
      if (findPattern(candidate, "^https?://") !== undefined) {
        host = candidate;
        callback(host);
        return;
      }
    }
    callback(undefined, "The Audius discovery endpoint returned no usable host.");
  });
}

export function search(query: string, callback: (tracks: TrackResult[], error?: string) => void): void {
  const term = trim(query);
  if (term === "") {
    callback([], "Enter a search term for Audius.");
    return;
  }
  withHost((base, error) => {
    if (base === undefined) {
      callback([], error);
      return;
    }
    const limit = getOptions().search.limit > 0 ? getOptions().search.limit : 12;
    const url = buildUrl(base, "/v1/tracks/search", { query: term, app_name: APP_NAME });
    getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: timeout() }, (payload, err) => {
      if (payload === undefined) {
        callback([], err);
        return;
      }
      const tracks: TrackResult[] = [];
      for (const entry of asArray(asRecord(payload).data)) {
        const track = asRecord(entry);
        const id = asText(track.id);
        if (id === "") continue;
        const result: TrackResult = {
          provider: "Audius",
          title: asText(track.title, "Untitled"),
          artist: asText(asRecord(track.user).name, asText(asRecord(track.user).handle)),
          url: buildUrl(base, `/v1/tracks/${id}/stream`, { app_name: APP_NAME }),
        };
        const duration = asNumber(track.duration);
        if (duration !== undefined && duration > 0) result.duration = duration;
        const genre = asText(track.genre);
        if (genre !== "") result.album = genre;
        tracks.push(result);
        if (tracks.length >= limit) break;
      }
      callback(tracks);
    });
  });
}
