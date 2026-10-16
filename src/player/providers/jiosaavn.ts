/**
 * JioSaavn — catalogue metadata through an unofficial third-party wrapper
 * (default `https://saavn.sumit.co`).
 *
 *   GET <base>/api/search/songs?query=&page=0&limit=10
 *
 * The plugin only uses the public song permalink plus metadata; it never
 * consumes the wrapper's `downloadUrl` entries and does not decrypt media.
 * Playback of the permalink is delegated to yt-dlp's JioSaavn extractor.
 * Set `lyric.jiosaavn_api = ""` to switch this source off.
 */

import { get as getOptions } from "../config";
import { getJson } from "../http";
import type { LyricCandidate, TrackResult } from "../types";
import { asArray, asNumber, asRecord, asText, buildUrl, match, trim } from "../util";

export interface JioSaavnSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  duration: number;
  language: string;
  hasLyrics: boolean;
  /** Page permalink, used for lyric lookups. */
  url: string;
  /** Direct audio file (the highest quality `downloadUrl`), what mpv plays. */
  stream: string;
}

/** The highest-bitrate entry of the wrapper's `downloadUrl` list. */
function streamUrl(song: Record<string, unknown>): string {
  let best = "";
  let bestRate = -1;
  for (const entry of asArray(song.downloadUrl)) {
    const item = asRecord(entry);
    const url = asText(item.url);
    if (url === "") continue;
    const rate = tonumber(match(asText(item.quality), "(%d+)")[0] ?? "") ?? -1;
    if (rate >= bestRate) {
      bestRate = rate;
      best = url;
    }
  }
  return best;
}

function base(): string {
  return getOptions().lyric.jiosaavn_api;
}

function primaryArtists(song: Record<string, unknown>): string {
  const artists = asRecord(song.artists);
  const names: string[] = [];
  for (const entry of asArray(artists.primary)) {
    const name = asText(asRecord(entry).name);
    if (name !== "") names.push(name);
  }
  if (names.length > 0) return names.join(", ");
  return asText(song.primaryArtists, asText(song.singers));
}

function readSongs(payload: unknown): JioSaavnSong[] {
  const results = asArray(asRecord(asRecord(payload).data).results);
  const songs: JioSaavnSong[] = [];
  for (const entry of results) {
    const song = asRecord(entry);
    const url = asText(song.url);
    const id = asText(song.id);
    if (url === "" && id === "") continue;
    songs.push({
      id,
      title: asText(song.name, asText(song.title, "Unknown title")),
      artist: primaryArtists(song) || "Unknown artist",
      album: asText(asRecord(song.album).name, asText(song.album)),
      year: asText(song.year),
      duration: asNumber(song.duration) ?? 0,
      language: asText(song.language),
      hasLyrics: song.hasLyrics === true,
      url,
      stream: streamUrl(song),
    });
  }
  return songs;
}

export function search(query: string, callback: (songs: JioSaavnSong[], error?: string) => void): void {
  const endpoint = trim(base());
  if (endpoint === "") {
    callback([], "JioSaavn search is disabled (lyric.jiosaavn_api is empty).");
    return;
  }
  const term = trim(query);
  if (term === "") {
    callback([], "Enter a song title or artist to search JioSaavn.");
    return;
  }
  const url = buildUrl(endpoint, "/api/search/songs", { query: term, page: 0, limit: 10 });
  getJson<unknown>(url, { headers: { accept: "application/json" }, timeout: getOptions().lyric.timeout }, (payload, error) => {
    if (payload === undefined) {
      callback([], error);
      return;
    }
    callback(readSongs(payload));
  });
}

export function toCandidates(songs: JioSaavnSong[]): LyricCandidate[] {
  return songs.map((song) => {
    const candidate: LyricCandidate = {
      provider: "JioSaavn",
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      sync: "none",
    };
    if (song.url !== "") candidate.url = song.url;
    if (song.duration > 0) candidate.duration = song.duration;
    if (song.language !== "") candidate.language = song.language;
    const year = tonumber(song.year);
    if (year !== undefined) candidate.year = year;
    return candidate;
  });
}

export function toTracks(songs: JioSaavnSong[]): TrackResult[] {
  const tracks: TrackResult[] = [];
  for (const song of songs) {
    if (song.stream === "" && song.url === "") continue;
    const track: TrackResult = {
      provider: "JioSaavn",
      title: song.title,
      artist: song.artist,
      // The permalink is an HTML page; the CDN file is what mpv can actually play.
      url: song.stream !== "" ? song.stream : song.url,
    };
    if (song.album !== "") track.album = song.album;
    if (song.duration > 0) track.duration = song.duration;
    tracks.push(track);
  }
  return tracks;
}
