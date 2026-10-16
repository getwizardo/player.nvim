import { parseLrc } from "./parsers.js";
import { getLrclibRecord } from "./providers/lrclib.js";
export async function getLyrics(candidate) {
    const record = await getLrclibRecord(candidate);
    let lines = record.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
    if (!lines.length && record.plainLyrics) {
        lines = record.plainLyrics.split(/\r?\n/).filter(Boolean).map((text) => ({ start: 0, finish: 0, text }));
    }
    if (!lines.length)
        throw new Error("No lyric text is available for this result.");
    const resolved = { ...candidate, isrc: candidate.isrc || record.isrc || undefined };
    return {
        candidate: resolved,
        lines,
        source: record.syncedLyrics ? "LRCLIB · synced LRC" : "LRCLIB · plain text",
    };
}
