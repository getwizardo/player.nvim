import { getJson } from "../http.js";
import type { LyricCandidate } from "../types.js";

/**
 * The JioSaavn provider.
 *
 * JioSaavn has no public API, the plugin talks to the small wrapper that
 * the community maintains. The base URL can be changed with the environment
 * variable `PLAYER_JIOSAAVN_API`.
 */

/** A song of the JioSaavn API. */
interface JioSaavnSong {
  id?: string | number;
  name?: string;
  title?: string;
  album?: { name?: string } | string;
  duration?: string | number;
  url?: string;
  hasLyrics?: boolean;
  language?: string;
  primaryArtists?: string;
  singers?: string;
  artists?: { primary?: Array<{ name?: string }> };
}

/** The answer of the search endpoint. */
interface JioSaavnAnswer {
  data?: { results?: JioSaavnSong[] };
}

/** The artists of a song. */
export function artistsOf(song: JioSaavnSong): string {
  const primary = song.artists?.primary;
  if (Array.isArray(primary)) {
    return primary
      .map((artist) => artist?.name ?? "")
      .filter(Boolean)
      .join(", ");
  }
  return song.primaryArtists ?? song.singers ?? "";
}

/** The base URL of the wrapper. */
export function jiosaavnBase(): string {
  return (process.env.PLAYER_JIOSAAVN_API || "https://saavn.sumit.co").replace(/\/$/, "");
}

/** Search the catalog of JioSaavn. */
export async function searchJioSaavn(query: string): Promise<LyricCandidate[]> {
  const url = new URL(`${jiosaavnBase()}/api/search/songs`);
  url.searchParams.set("query", query);
  url.searchParams.set("page", "0");
  url.searchParams.set("limit", "10");
  const payload = await getJson<JioSaavnAnswer>(url.toString());
  const results = payload?.data?.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map((song): LyricCandidate => ({
    provider: "JioSaavn",
    id: String(song.id ?? ""),
    title: song.name || song.title || "Unknown title",
    artist: artistsOf(song) || song.primaryArtists || "Unknown artist",
    album: typeof song.album === "string" ? song.album : song.album?.name || "",
    duration: Number(song.duration) || undefined,
    url: song.url || undefined,
    hasLyrics: Boolean(song.hasLyrics),
    language: song.language || undefined,
  }));
}
