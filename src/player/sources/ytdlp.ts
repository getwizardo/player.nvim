/**
 * yt-dlp as a search source.
 *
 * yt-dlp resolves hundreds of sites; the plugin only drives its search prefixes
 * and never extracts media URLs itself:
 *   ytsearch10:<query>   YouTube
 *   scsearch10:<query>   SoundCloud
 *   ytmsearch10:<query>  YouTube Music
 *   bilisearch10:<query> Bilibili
 */

import { get as getOptions } from "../config";
import type { TrackResult } from "../types";
import { asArray, asNumber, asRecord, asText, decodeJson, fail, findPattern, notify, splitLines, trim } from "../util";

/** Known prefixes, used for command completion. */
export const PREFIXES = ["ytsearch", "ytmsearch", "scsearch", "bilisearch", "mixcloud", "bandcamp"];

export function available(): boolean {
  return vim.fn.executable(getOptions().yt_dlp) === 1;
}

function readEntries(payload: unknown): TrackResult[] {
  const tracks: TrackResult[] = [];
  for (const entry of asArray(asRecord(payload).entries)) {
    const record = asRecord(entry);
    const id = asText(record.id);
    let url = asText(record.webpage_url);
    if (url === "") url = asText(record.original_url);
    if (url === "") url = asText(record.url);
    if (url === "" && id !== "") url = `https://www.youtube.com/watch?v=${id}`;
    if (url === "") continue;
    const track: TrackResult = {
      provider: asText(record.extractor_key, "yt-dlp"),
      title: asText(record.title, asText(record.fulltitle, id === "" ? "Untitled" : id)),
      artist: asText(record.uploader, asText(record.channel, asText(record.creator))),
      url,
    };
    const duration = asNumber(record.duration);
    if (duration !== undefined && duration > 0) track.duration = duration;
    const album = asText(record.album);
    if (album !== "") track.album = album;
    tracks.push(track);
  }
  return tracks;
}

/** Search one yt-dlp source and return playable URLs. */
export function search(prefix: string, query: string, limit: number, callback: (tracks: TrackResult[], error?: string) => void): void {
  if (!available()) {
    callback([], `${getOptions().yt_dlp} is required for this source. Install yt-dlp or disable it in search.sources.`);
    return;
  }
  const count = limit > 0 ? limit : 10;
  const command = [
    getOptions().yt_dlp,
    "--flat-playlist",
    "--dump-single-json",
    "--no-warnings",
    `${prefix}${count}:${query}`,
  ];
  notify(`Searching ${prefix} for "${query}"…`);
  vim.system(command, { text: true }, (result) => {
    vim.schedule(() => {
      if (result.code !== 0) {
        const stderr = trim(result.stderr ?? "");
        const first = splitLines(stderr)[0];
        callback([], first === undefined ? `${prefix} search failed (exit ${result.code})` : first);
        return;
      }
      const decoded = decodeJson(result.stdout ?? "");
      if (decoded === undefined) {
        callback([], "yt-dlp returned output that is not JSON.");
        return;
      }
      const payload = asRecord(decoded);
      // A single video (not a playlist) has no `entries`; wrap it.
      const tracks = asArray(payload.entries).length > 0 ? readEntries(payload) : readEntries({ entries: [payload] });
      if (tracks.length === 0) fail(`No ${prefix} results for "${query}".`);
      callback(tracks);
    });
  });
}

/** Extract audio to the configured download directory. */
export function download(url: string, callback?: (ok: boolean, message: string) => void): void {
  if (!available()) {
    fail(`${getOptions().yt_dlp} is required for downloads.`);
    return;
  }
  if (findPattern(url, "^https?://") === undefined) {
    fail("Download expects an http(s) URL.");
    return;
  }
  const options = getOptions();
  vim.fn.mkdir(options.download_dir, "p");
  const command = [
    options.yt_dlp,
    "--extract-audio",
    "--audio-format",
    "best",
    "--no-playlist",
    "--output",
    "%(title)s.%(ext)s",
    "--paths",
    options.download_dir,
    url,
  ];
  notify(`Downloading to ${options.download_dir}…`);
  vim.system(command, { text: true }, (result) => {
    vim.schedule(() => {
      if (result.code === 0) {
        notify(`Download complete: ${options.download_dir}`);
        if (callback !== undefined) callback(true, options.download_dir);
        return;
      }
      const message = splitLines(trim(result.stderr ?? ""))[0] ?? `Download failed (exit ${result.code})`;
      fail(message);
      if (callback !== undefined) callback(false, message);
    });
  });
}
