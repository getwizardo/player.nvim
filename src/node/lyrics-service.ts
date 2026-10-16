import { fetchTtml } from "./lrc-red.js";
import { parseLrc } from "./parsers.js";
import { getLrclibRecord, lookupLrclib } from "./providers/lrclib.js";
import type { LyricCandidate, LyricLine, LyricsAnswer } from "./types.js";

/**
 * The lyrics of a candidate.
 *
 * lrc.red is asked first: its TTML documents carry the word level timings the
 * karaoke view needs, and the ISRC of a recording is the key of the service.
 * LRCLIB is the fallback, it knows the plain and the synced lyrics.
 */

/** The plain lyrics of a record, one line per entry. */
export function plainLines(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => ({ start: 0, finish: 0, text: line }));
}

/** True when the lines carry word level timings. */
export function hasWordTimings(lines: LyricLine[]): boolean {
  return lines.some((line) => Array.isArray(line.words) && line.words.length > 0);
}

/**
 * The ISRC of a candidate.
 *
 * The candidate is asked first; the lookup API of LRCLIB finds the ISRC of a
 * track that the search did not return one for.
 */
export async function findIsrc(candidate: LyricCandidate): Promise<string | undefined> {
  if (candidate.isrc) {
    return candidate.isrc;
  }
  const found = await lookupLrclib(candidate.title, candidate.artist, candidate.duration);
  return found?.isrc;
}

/** Fetch the lyrics of a candidate. */
export async function getLyrics(candidate: LyricCandidate): Promise<LyricsAnswer> {
  const isrc = await findIsrc(candidate);
  if (isrc) {
    try {
      const rows = await fetchTtml(isrc);
      return {
        candidate: { ...candidate, isrc },
        lines: rows,
        source: hasWordTimings(rows) ? "lrc.red · TTML (word level)" : "lrc.red · TTML",
      };
    } catch {
      // lrc.red does not know this recording; the other services are asked.
    }
  }
  const record = await getLrclibRecord(candidate);
  const synced = record?.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
  let lines = synced;
  let source = "LRCLIB · plain text";
  if (lines.length) {
    source = "LRCLIB · synced LRC";
  } else if (record?.plainLyrics) {
    lines = plainLines(record.plainLyrics);
  }
  if (!lines.length) {
    throw new Error("None of the lyric services knows this track; the lrc.red TTML and the LRCLIB lyrics are empty.");
  }
  const resolved: LyricCandidate = {
    ...candidate,
    isrc: candidate.isrc || record?.isrc || undefined,
  };
  return { candidate: resolved, lines, source };
}
