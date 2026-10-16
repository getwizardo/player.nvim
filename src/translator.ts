import type { LyricLine } from "./types.js";

export async function translateLines(lines: LyricLine[], target: string, source = "auto"): Promise<string[]> {
  const endpoint = (process.env.PLAYER_TRANSLATE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
  const body: Record<string, string> = {
    q: lines.map((line) => line.text).join("\n"),
    source,
    target,
    format: "text",
  };
  if (process.env.PLAYER_TRANSLATE_API_KEY) body.api_key = process.env.PLAYER_TRANSLATE_API_KEY;
  const response = await fetch(`${endpoint}/translate`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Translator returned HTTP ${response.status}. Check PLAYER_TRANSLATE_URL and its API key.`);
  const payload = await response.json() as { translatedText?: string };
  if (!payload.translatedText) throw new Error("Translator response did not contain translatedText.");
  const translated = payload.translatedText.split(/\r?\n/);
  if (translated.length !== lines.length) {
    throw new Error("Translator changed the lyric line count; translation was not attached to avoid misaligning karaoke timing.");
  }
  return translated;
}
