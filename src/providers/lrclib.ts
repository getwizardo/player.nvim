import { getJson } from "../http.js";
import type { LyricCandidate } from "../types.js";

export async function searchLrclib(query: string): Promise<LyricCandidate[]> {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("q", query);
  const payload = await getJson(url.toString());
  if (!Array.isArray(payload)) return [];
  return payload.map((item: any): LyricCandidate => ({
    provider: "LRCLIB",
    id: String(item.id),
    title: item.trackName || item.name || "Unknown title",
    artist: item.artistName || "Unknown artist",
    album: item.albumName || "",
    duration: Number(item.duration) || undefined,
    isrc: item.isrc || undefined,
    hasSyncedLyrics: Boolean(item.syncedLyrics),
    hasLyrics: Boolean(item.syncedLyrics || item.plainLyrics),
  }));
}

export async function getLrclibRecord(candidate: LyricCandidate): Promise<any> {
  if (candidate.provider === "LRCLIB") {
    return getJson(`https://lrclib.net/api/get/${encodeURIComponent(candidate.id)}`);
  }
  const url = new URL("https://lrclib.net/api/get");
  url.searchParams.set("track_name", candidate.title);
  url.searchParams.set("artist_name", candidate.artist);
  if (candidate.album) url.searchParams.set("album_name", candidate.album);
  if (candidate.duration) url.searchParams.set("duration", String(Math.round(candidate.duration)));
  return getJson(url.toString());
}
