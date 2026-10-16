import { searchItunes } from "./providers/itunes.js";
import { searchJioSaavn } from "./providers/jiosaavn.js";
import { lookupLrclib, searchLrclib } from "./providers/lrclib.js";
import { searchMusicBrainz } from "./providers/musicbrainz.js";
/**
 * The lyric search.
 *
 * Every service is asked at the same time; the results are merged and
 * de-duplicated, so that the same song does not show up twice.
 *
 * LRCLIB and MusicBrainz know the ISRC of a recording, which is the key of
 * lrc.red: a match there can be turned into a word level TTML document. The
 * iTunes catalogue adds the songs that the lyric services do not know, and
 * the JioSaavn catalog adds the tracks that can be played right away.
 */
/** The key that identifies a track by its title and its artist. */
function titleKey(candidate) {
    const title = candidate.title.toLowerCase().replace(/\s+/g, " ");
    const artist = candidate.artist.toLowerCase().replace(/\s+/g, " ");
    return `title:${title}|${artist}`;
}
/** The keys a candidate is known by. */
function keysOf(candidate) {
    const keys = [titleKey(candidate)];
    if (candidate.isrc) {
        keys.push(`isrc:${candidate.isrc}`);
    }
    return keys;
}
/** Remove the duplicates of a list of candidates. */
export function dedupe(candidates) {
    const seen = new Set();
    const out = [];
    for (const candidate of candidates) {
        const keys = keysOf(candidate);
        if (keys.some((key) => seen.has(key))) {
            continue;
        }
        for (const key of keys) {
            seen.add(key);
        }
        out.push(candidate);
    }
    return out;
}
/** Search every lyric service. */
export async function searchLyrics(query) {
    const term = query.trim();
    if (!term) {
        throw new Error("Enter a song title, artist, or lyric phrase.");
    }
    const results = await Promise.allSettled([
        searchLrclib(term),
        searchMusicBrainz(term),
        searchItunes(term),
        searchJioSaavn(term),
    ]);
    const candidates = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            candidates.push(...result.value);
        }
    }
    if (!candidates.length) {
        // The search API of LRCLIB is picky, the lookup API is not.
        const fallback = await lookupLrclib(term, term);
        if (fallback) {
            candidates.push(fallback);
        }
    }
    if (!candidates.length) {
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length === results.length) {
            const reasons = failures.map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
            throw new Error(`The lyric services could not be reached: ${reasons.join(" / ")}`);
        }
        throw new Error("No lyrics matches found.");
    }
    return dedupe(candidates).slice(0, 40);
}
/** Keep the candidates that come with a playable link. */
export function playableOnly(candidates) {
    return candidates.filter((candidate) => Boolean(candidate.url));
}
/**
 * Search the catalogues that know a playable track.
 *
 * The iTunes catalogue and the JioSaavn catalog return a link for every
 * song; the link of the iTunes preview is a short audio file, the link of
 * JioSaavn is the permalink of the song.
 */
export async function searchTracks(query) {
    const term = query.trim();
    if (!term) {
        throw new Error("Enter a song title or an artist.");
    }
    const results = await Promise.allSettled([searchItunes(term), searchJioSaavn(term)]);
    const candidates = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            candidates.push(...playableOnly(result.value));
        }
    }
    if (!candidates.length) {
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length === results.length) {
            const reasons = failures.map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
            throw new Error(`The track services could not be reached: ${reasons.join(" / ")}`);
        }
    }
    return dedupe(candidates).slice(0, 30);
}
