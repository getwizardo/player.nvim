/**
 * Optional Invidious/Piped instance search.
 *
 *   GET <instance>/api/v1/search?q=<query>&type=music
 *
 * Public instances come and go and often rate limit, so this source is disabled
 * until `search.invidious` is set to an instance URL. Results are handed to
 * mpv/yt-dlp as ordinary YouTube watch URLs — the plugin never scrapes YouTube
 * itself.
 */

import { get as getOptions } from "../config";
import { getJson } from "../http";
import type { TrackResult } from "../types";
import { asArray, asNumber, asRecord, asText, buildUrl, formatTime, trim } from "../util";

export function enabled(): boolean {
  return getOptions().search.invidious !== "";
}

export function search(query: string, callback: (tracks: TrackResult[], error?: string) => void): void {
  const instance = getOptions().search.invidious;
  if (instance === "") {
    callback([], "Set search.invidious to an instance URL to use this source.");
    return;
  }
  const term = trim(query);
  if (term === "") {
    callback([], "Enter a search term.");
    return;
  }
  const url = buildUrl(instance, "/api/v1/search", { q: term, type: "music" });
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: getOptions().search.timeout }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    const limit = getOptions().search.limit > 0 ? getOptions().search.limit : 12;
    const tracks: TrackResult[] = [];
    for (const entry of asArray(payload)) {
      const video = asRecord(entry);
      const id = asText(video.videoId);
      if (id === "") continue;
      const track: TrackResult = {
        provider: asText(video.author, "Invidious"),
        title: asText(video.title, id),
        artist: asText(video.author),
        url: `https://www.youtube.com/watch?v=${id}`,
      };
      const duration = asNumber(video.lengthSeconds);
      if (duration !== undefined && duration > 0) track.duration = duration;
      tracks.push(track);
      if (tracks.length >= limit) break;
    }
    callback(tracks);
  });
}

/** `title — artist [m:ss]` used by pickers. */
export function format(track: TrackResult): string {
  const duration = track.duration !== undefined ? ` [${formatTime(track.duration)}]` : "";
  const artist = track.artist === "" ? "" : ` — ${track.artist}`;
  return `${track.title}${artist}${duration}`;
}
