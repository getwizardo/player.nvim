/**
 * Music search across several sources at once.
 *
 * `:PlayerSearch [source] <query>` fans the query out to every enabled source,
 * merges the results and lets the user pick one track to play.
 *
 *   ytdlp      yt-dlp search (YouTube by default; see `search.youtube`)
 *   youtube    shortcut for ytsearch
 *   ytmusic    shortcut for ytmsearch (YouTube Music)
 *   soundcloud shortcut for scsearch
 *   archive    Internet Archive audio
 *   audius     Audius
 *   invidious  an Invidious instance (opt-in through `search.invidious`)
 *   jiosaavn   JioSaavn catalogue metadata (unofficial wrapper)
 */

import { get as getOptions } from "./config";
import * as archive from "./sources/archive";
import * as audius from "./sources/audius";
import * as invidious from "./sources/invidious";
import * as jiosaavn from "./providers/jiosaavn";
import * as ytdlp from "./sources/ytdlp";
import type { TrackResult } from "./types";
import { endsWith, formatTime, lower, match, notify, trim } from "./util";

export const SOURCES = ["ytdlp", "youtube", "ytmusic", "soundcloud", "archive", "audius", "invidious", "jiosaavn"];

export interface SearchRequest {
  query: string;
  sources?: string[];
}

type SourceFn = (query: string, callback: (tracks: TrackResult[], error?: string) => void) => void;

function prefixFor(source: string): string {
  const options = getOptions().search;
  if (source === "youtube") return "ytsearch";
  if (source === "ytmusic") return "ytmsearch";
  if (source === "soundcloud") return "scsearch";
  return options.youtube === "" ? "ytsearch" : options.youtube;
}

function sourceFunction(source: string): SourceFn | undefined {
  const limit = getOptions().search.limit;
  if (source === "ytdlp" || source === "youtube" || source === "ytmusic" || source === "soundcloud") {
    const prefix = prefixFor(source);
    return (query, callback) => ytdlp.search(prefix, query, limit, callback);
  }
  if (source === "archive") return (query, callback) => archive.search(query, callback);
  if (source === "audius") return (query, callback) => audius.search(query, callback);
  if (source === "invidious") return (query, callback) => invidious.search(query, callback);
  if (source === "jiosaavn") {
    return (query, callback) =>
      jiosaavn.search(query, (songs, error) => {
        if (songs.length === 0) {
          callback([], error);
          return;
        }
        callback(jiosaavn.toTracks(songs));
      });
  }
  return undefined;
}

/** Query every requested source and merge what came back. */
export function run(request: SearchRequest, callback: (tracks: TrackResult[], errors: string[]) => void): void {
  const query = trim(request.query);
  if (query === "") {
    callback([], ["Enter a search term."]);
    return;
  }
  const wanted = request.sources ?? getOptions().search.sources;
  const names: string[] = [];
  for (const name of wanted) {
    const key = lower(trim(name));
    if (key !== "" && !names.includes(key)) names.push(key);
  }
  if (names.length === 0) {
    callback([], ["No search sources are enabled. Set search.sources."]);
    return;
  }
  const tracks: TrackResult[] = [];
  const errors: string[] = [];
  let pending = names.length;
  const finish = (): void => {
    pending -= 1;
    if (pending > 0) return;
    const seen: Record<string, boolean> = {};
    const unique: TrackResult[] = [];
    for (const track of tracks) {
      if (seen[track.url] === true) continue;
      seen[track.url] = true;
      unique.push(track);
    }
    callback(unique, errors);
  };
  for (const name of names) {
    const search = sourceFunction(name);
    if (search === undefined) {
      errors.push(`Unknown search source "${name}".`);
      finish();
      continue;
    }
    search(query, (results, error) => {
      if (error !== undefined) errors.push(`${name}: ${error}`);
      for (const track of results) tracks.push(track);
      finish();
    });
  }
}

/** An Archive result points at an item; expand it into playable files. */
export function resolve(track: TrackResult, callback: (tracks: TrackResult[]) => void): void {
  if (track.provider !== "Archive" || !endsWith(track.url, "/")) {
    callback([track]);
    return;
  }
  const identifier = match(track.url, "/download/([^/]+)/$")[0];
  if (identifier === undefined) {
    callback([track]);
    return;
  }
  notify(`Listing audio files in ${identifier}…`);
  archive.tracks(identifier, (files, error) => {
    if (files.length === 0) {
      if (error !== undefined) notify(error, vim.log.levels.WARN);
      callback([track]);
      return;
    }
    callback(files);
  });
}

/** `title — artist [m:ss] · source` used by pickers. */
export function format(track: TrackResult): string {
  const duration = track.duration !== undefined ? ` [${formatTime(track.duration)}]` : "";
  const artist = track.artist === "" ? "" : ` — ${track.artist}`;
  return `${track.title}${artist}${duration} · ${track.provider}`;
}
