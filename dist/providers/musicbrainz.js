import { getJson } from "../http.js";
/**
 * The MusicBrainz provider.
 *
 * MusicBrainz is the open music encyclopedia. Its recordings carry the ISRC
 * of the release, which is the key lrc.red uses, so a match here can be
 * turned into a word level TTML document.
 */
const BASE = "https://musicbrainz.org/ws/2";
/** The artists of a recording. */
export function artistOf(recording) {
    const credit = recording["artist-credit"];
    if (!Array.isArray(credit) || !credit.length) {
        return "";
    }
    const names = [];
    for (const entry of credit) {
        if (entry && typeof entry.name === "string" && entry.name !== "") {
            names.push(entry.name);
        }
    }
    return names.join(", ");
}
/** The album of a recording. */
export function albumOf(recording) {
    const releases = recording.releases;
    if (!Array.isArray(releases) || !releases.length) {
        return "";
    }
    const first = releases[0];
    return first && typeof first.title === "string" ? first.title : "";
}
/** The ISRC of a recording, when it has one. */
export function isrcOf(recording) {
    const isrcs = recording.isrcs;
    if (!Array.isArray(isrcs)) {
        return undefined;
    }
    for (const isrc of isrcs) {
        if (typeof isrc === "string" && isrc.trim() !== "") {
            return isrc.trim().toUpperCase();
        }
    }
    return undefined;
}
/** Turn a recording into a candidate. */
export function toCandidate(recording) {
    const isrc = isrcOf(recording);
    const candidate = {
        provider: "MusicBrainz",
        id: String(recording.id ?? ""),
        title: recording.title || "Unknown title",
        artist: artistOf(recording) || "Unknown artist",
        album: albumOf(recording),
        // The lyrics are resolved through lrc.red, which is keyed by the ISRC.
        hasLyrics: true,
        hasSyncedLyrics: Boolean(isrc),
    };
    if (typeof recording.length === "number" && recording.length > 0) {
        candidate.duration = Math.round(recording.length / 1000);
    }
    if (isrc) {
        candidate.isrc = isrc;
    }
    return candidate;
}
/** Search the recordings of MusicBrainz. */
export async function searchMusicBrainz(query) {
    const url = new URL(`${BASE}/recording/`);
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "25");
    const payload = await getJson(url.toString());
    const recordings = payload?.recordings;
    if (!Array.isArray(recordings)) {
        return [];
    }
    return recordings
        .filter((item) => typeof item === "object" && item !== null)
        .map(toCandidate)
        .filter((candidate) => candidate.id !== "");
}
