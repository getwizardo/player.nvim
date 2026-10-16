import { getJson } from "../http.js";
/**
 * The LRCLIB provider.
 *
 * LRCLIB is a free and open lyrics database; its API needs no key.
 */
const BASE = "https://lrclib.net/api";
/** Turn a record of the API into a candidate. */
export function toCandidate(item) {
    return {
        provider: "LRCLIB",
        id: String(item.id ?? ""),
        title: item.trackName || "Unknown title",
        artist: item.artistName || "Unknown artist",
        album: item.albumName || "",
        duration: Number(item.duration) || undefined,
        isrc: item.isrc || undefined,
        hasSyncedLyrics: Boolean(item.syncedLyrics),
        hasLyrics: Boolean(item.syncedLyrics || item.plainLyrics),
    };
}
/** Search the lyrics of LRCLIB. */
export async function searchLrclib(query) {
    const url = new URL(`${BASE}/search`);
    url.searchParams.set("q", query);
    const payload = await getJson(url.toString());
    if (!Array.isArray(payload)) {
        return [];
    }
    return payload
        .filter((item) => typeof item === "object" && item !== null)
        .map(toCandidate)
        .filter((candidate) => candidate.id !== "");
}
/**
 * Fetch the lyrics of a candidate.
 *
 * The identifier is used when it is known, otherwise the track, the artist
 * and the duration are looked up.
 */
export async function getLrclibRecord(candidate) {
    if (candidate.provider === "LRCLIB" && candidate.id) {
        return getJson(`${BASE}/get/${encodeURIComponent(candidate.id)}`);
    }
    const url = new URL(`${BASE}/get`);
    url.searchParams.set("track_name", candidate.title);
    url.searchParams.set("artist_name", candidate.artist);
    if (candidate.album) {
        url.searchParams.set("album_name", candidate.album);
    }
    if (candidate.duration) {
        url.searchParams.set("duration", String(Math.round(candidate.duration)));
    }
    return getJson(url.toString());
}
/**
 * Look a track up when the search did not return anything.
 *
 * The search API of LRCLIB is strict about the query, the lookup API is not.
 */
export async function lookupLrclib(title, artist, duration) {
    const url = new URL(`${BASE}/get`);
    url.searchParams.set("track_name", title);
    url.searchParams.set("artist_name", artist);
    if (duration) {
        url.searchParams.set("duration", String(Math.round(duration)));
    }
    try {
        const record = await getJson(url.toString());
        if (!record || typeof record !== "object") {
            return undefined;
        }
        return toCandidate(record);
    }
    catch {
        return undefined;
    }
}
