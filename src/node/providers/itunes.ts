import { getJson } from "../http.js";
import type { ItunesResult, ItunesSearch, LyricCandidate } from "../types.js";

/**
 * The iTunes provider.
 *
 * The search API of Apple needs no key and knows the catalogue of the store;
 * every result has a short preview that mpv can play, which makes it a handy
 * fallback when no other service knows the track.
 */

const BASE = "https://itunes.apple.com/search";

/** Turn a song of the API into a candidate. */
export function toCandidate(item: ItunesResult): LyricCandidate {
  const candidate: LyricCandidate = {
    provider: "iTunes",
    id: String(item.trackId ?? item.trackViewUrl ?? ""),
    title: item.trackName || "Unknown title",
    artist: item.artistName || "Unknown artist",
    album: item.collectionName || "",
    // The store has no lyrics, but the track can be previewed.
    hasLyrics: true,
    hasSyncedLyrics: false,
  };
  if (typeof item.trackTimeMillis === "number" && item.trackTimeMillis > 0) {
    candidate.duration = Math.round(item.trackTimeMillis / 1000);
  }
  if (typeof item.previewUrl === "string" && item.previewUrl !== "") {
    candidate.url = item.previewUrl;
  } else if (typeof item.trackViewUrl === "string" && item.trackViewUrl !== "") {
    candidate.url = item.trackViewUrl;
  }
  if (typeof item.primaryGenreName === "string" && item.primaryGenreName !== "") {
    candidate.language = item.primaryGenreName;
  }
  return candidate;
}

/** Search the songs of the iTunes catalogue. */
export async function searchItunes(query: string): Promise<LyricCandidate[]> {
  const url = new URL(BASE);
  url.searchParams.set("term", query);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "25");
  const payload = await getJson<ItunesSearch>(url.toString());
  const results = payload?.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results
    .filter((item): item is ItunesResult => typeof item === "object" && item !== null)
    .map(toCandidate)
    .filter((candidate) => candidate.id !== "");
}
