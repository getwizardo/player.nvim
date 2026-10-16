import { request } from "./http.js";
import { parseTtml } from "./parsers.js";
import type { LyricLine } from "./types.js";

/**
 * The lrc.red provider.
 *
 * lrc.red serves the TTML documents of a recording; the ISRC identifies the
 * recording.
 */

/** True when the value is a valid ISRC. */
export function isValidIsrc(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value.trim().toUpperCase());
}

/** Fetch the TTML of a recording. */
export async function fetchTtml(isrc: string, timeoutMs = 20_000): Promise<LyricLine[]> {
  const normalized = isrc.trim().toUpperCase();
  if (!isValidIsrc(normalized)) {
    throw new Error("Invalid ISRC. Expected a 12-character recording code.");
  }
  const response = await request(`https://lrc.red/s/${encodeURIComponent(normalized)}.ttml`, {
    timeout: timeoutMs,
    accept: "application/ttml+xml, application/xml",
  });
  if (!response.ok) {
    throw new Error(`lrc.red returned HTTP ${response.status} for ${normalized}.`);
  }
  const rows = parseTtml(await response.text());
  if (!rows.length) {
    throw new Error("The TTML document contained no timed lyric lines.");
  }
  return rows;
}
