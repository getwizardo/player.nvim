import { parseLrc } from "./parsers.js";
import { getLrclibRecord } from "./providers/lrclib.js";
import type { LyricCandidate, LyricLine } from "./types.js";

export async function getLyrics(candidate: LyricCandidate): Promise<{ candidate: LyricCandidate; lines: LyricLine[]; source: string }> {
  const record = await getLrclibRecord(candidate) as any;
  let lines = record.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
  if (!lines.length && record.plainLyrics) {
    lines = record.plainLyrics.split(/\r?\n/).filter(Boolean).map((text: string) => ({ start: 0, finish: 0, text }));
  }
  if (!lines.length) throw new Error("No lyric text is available for this result.");
  const resolved = { ...candidate, isrc: candidate.isrc || record.isrc || undefined };
  return {
    candidate: resolved,
    lines,
    source: record.syncedLyrics ? "LRCLIB · synced LRC" : "LRCLIB · plain text",
  };
}
