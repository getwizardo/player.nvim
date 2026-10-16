import { searchJioSaavn } from "./providers/jiosaavn.js";
import { searchLrclib } from "./providers/lrclib.js";
import type { LyricCandidate } from "./types.js";

export async function searchLyrics(query: string): Promise<LyricCandidate[]> {
  const term = query.trim();
  if (!term) throw new Error("Enter a song title, artist, or lyric phrase.");
  const [lrclib, jiosaavn] = await Promise.allSettled([
    searchLrclib(term),
    searchJioSaavn(term),
  ]);
  const candidates: LyricCandidate[] = [];
  if (lrclib.status === "fulfilled") candidates.push(...lrclib.value);
  if (jiosaavn.status === "fulfilled") candidates.push(...jiosaavn.value);
  if (!candidates.length) {
    const failures = [lrclib, jiosaavn].filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    throw new Error(failures.map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)).join("; ") || "No lyrics matches found.");
  }
  return candidates.slice(0, 35);
}
