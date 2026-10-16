import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface LyricWord { start: number; finish: number; text: string }
export interface LyricLine { start: number; finish: number; text: string; words?: LyricWord[]; translation?: string }
export interface LyricCandidate {
  provider: "LRCLIB" | "JioSaavn";
  id: string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  isrc?: string;
  url?: string;
  hasSyncedLyrics?: boolean;
  hasLyrics?: boolean;
  language?: string;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function xmlAttribute(attrs: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
}

function timing(value: string | undefined, frameRate: number, tickRate: number): number {
  if (!value) return 0;
  const clock = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const frames = value.match(/^(\d+):(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (frames) return Number(frames[1]) * 3600 + Number(frames[2]) * 60 + Number(frames[3]) + Number(frames[4]) / frameRate;
  const offset = value.match(/^(\d+(?:\.\d+)?)(ms|s|t)$/);
  if (offset) {
    const amount = Number(offset[1]);
    return offset[2] === "ms" ? amount / 1000 : offset[2] === "t" ? amount / tickRate : amount;
  }
  return Number(value) || 0;
}

function plainText(value: string): string {
  return decodeXml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function tagBlocks(xml: string, localName: string): Array<{ attrs: string; body: string }> {
  const tag = new RegExp(`<([\\w.-]+:)?${localName}\\b([^>]*)>([\\s\\S]*?)<\\/([\\w.-]+:)?${localName}\\s*>`, "gi");
  return [...xml.matchAll(tag)].map((match) => ({ attrs: match[2], body: match[3] }));
}

export function parseTtml(xml: string): LyricLine[] {
  const rootAttrs = xml.match(/<(?:[\w.-]+:)?tt\b([^>]*)>/i)?.[1] ?? "";
  const rateMatch = xmlAttribute(rootAttrs, "ttp:frameRate")?.match(/^(\d+)(?:\s+(\d+)\s+(\d+))?$/);
  const frameRate = rateMatch ? Number(rateMatch[1]) * (rateMatch[2] ? Number(rateMatch[2]) / Number(rateMatch[3]) : 1) : 30;
  const tickRate = Number(xmlAttribute(rootAttrs, "ttp:tickRate")) || frameRate;
  const rows: LyricLine[] = [];
  for (const paragraph of tagBlocks(xml, "p")) {
    const start = timing(xmlAttribute(paragraph.attrs, "begin"), frameRate, tickRate);
    const finish = timing(xmlAttribute(paragraph.attrs, "end"), frameRate, tickRate);
    const words: LyricWord[] = [];
    for (const span of tagBlocks(paragraph.body, "span")) {
      const text = plainText(span.body);
      const rawStart = timing(xmlAttribute(span.attrs, "begin"), frameRate, tickRate);
      const rawFinish = timing(xmlAttribute(span.attrs, "end"), frameRate, tickRate);
      if (text && (xmlAttribute(span.attrs, "begin") || xmlAttribute(span.attrs, "end"))) {
        const wordStart = rawStart < start ? start + rawStart : rawStart;
        const wordFinish = rawFinish > 0 && rawFinish < start ? start + rawFinish : rawFinish;
        words.push({ start: wordStart, finish: wordFinish, text });
      }
    }
    const text = plainText(paragraph.body);
    if (text) {
      const row: LyricLine = { start, finish, text };
      if (words.length) {
        row.words = words.sort((a, b) => a.start - b.start);
        row.words.forEach((word, index) => {
          if (word.finish === 0) word.finish = row.words?.[index + 1]?.start ?? finish;
        });
      }
      rows.push(row);
    }
  }
  return rows.sort((a, b) => a.start - b.start);
}

export async function fetchTtml(isrc: string): Promise<LyricLine[]> {
  const normalized = isrc.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\\d{7}$/.test(normalized)) throw new Error("Invalid ISRC. Expected a 12-character recording code.");
  const response = await fetch(`https://lrc.red/s/${encodeURIComponent(normalized)}.ttml`, {
    headers: { "user-agent": "player.nvim/0.2 (https://github.com/getwizardo/player.nvim)", accept: "application/ttml+xml, application/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`lrc.red returned HTTP ${response.status} for ${normalized}.`);
  const rows = parseTtml(await response.text());
  if (!rows.length) throw new Error("The TTML document contained no timed lyric lines.");
  return rows;
}

export function parseLrc(lrc: string): LyricLine[] {
  const rows: LyricLine[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const stamp = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/);
    if (!stamp) continue;
    const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
    const text = stamp[4].trim();
    if (text) rows.push({ start: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, finish: 0, text });
  }
  return rows.sort((a, b) => a.start - b.start);
}

async function getJson(url: string, app = "player.nvim/0.2"): Promise<any> {
  const response = await fetch(url, { headers: { "user-agent": `${app} (https://github.com/getwizardo/player.nvim)`, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
}

function artistsOf(song: any): string {
  const primary = song?.artists?.primary;
  if (Array.isArray(primary)) return primary.map((artist: any) => artist.name).filter(Boolean).join(", ");
  return song?.primaryArtists ?? song?.singers ?? "";
}

export async function searchLyrics(query: string): Promise<LyricCandidate[]> {
  const q = query.trim();
  if (!q) throw new Error("Enter a song title, artist, or lyric phrase.");
  const lrclib = new URL("https://lrclib.net/api/search");
  lrclib.searchParams.set("q", q);
  const saavnBase = (process.env.PLAYER_JIOSAAVN_API || "https://saavn.sumit.co").replace(/\/$/, "");
  const saavn = new URL(`${saavnBase}/api/search/songs`);
  saavn.searchParams.set("query", q);
  saavn.searchParams.set("page", "0");
  saavn.searchParams.set("limit", "10");
  const [lrclibResult, saavnResult] = await Promise.allSettled([getJson(lrclib.toString()), getJson(saavn.toString())]);
  const candidates: LyricCandidate[] = [];
  if (lrclibResult.status === "fulfilled" && Array.isArray(lrclibResult.value)) {
    for (const item of lrclibResult.value) candidates.push({
      provider: "LRCLIB", id: String(item.id), title: item.trackName || item.name || "Unknown title",
      artist: item.artistName || "Unknown artist", album: item.albumName || "", duration: Number(item.duration) || undefined,
      isrc: item.isrc || undefined, hasSyncedLyrics: Boolean(item.syncedLyrics), hasLyrics: Boolean(item.syncedLyrics || item.plainLyrics),
    });
  }
  if (saavnResult.status === "fulfilled") {
    const results = saavnResult.value?.data?.results;
    if (Array.isArray(results)) for (const song of results) candidates.push({
      provider: "JioSaavn", id: String(song.id), title: song.name || song.title || "Unknown title",
      artist: artistsOf(song) || song.primaryArtists || "Unknown artist", album: song.album?.name || song.album || "",
      duration: Number(song.duration) || undefined, url: song.url || undefined, hasLyrics: Boolean(song.hasLyrics), language: song.language || undefined,
    });
  }
  if (!candidates.length) {
    const failures = [lrclibResult, saavnResult].filter((x) => x.status === "rejected") as PromiseRejectedResult[];
    throw new Error(failures.map((x) => x.reason instanceof Error ? x.reason.message : String(x.reason)).join("; ") || "No lyrics matches found.");
  }
  return candidates.slice(0, 35);
}

async function lrcRecord(id: string): Promise<any> {
  return getJson(`https://lrclib.net/api/get/${encodeURIComponent(id)}`);
}

async function lrcBySignature(candidate: LyricCandidate): Promise<any> {
  const url = new URL("https://lrclib.net/api/get");
  url.searchParams.set("track_name", candidate.title);
  url.searchParams.set("artist_name", candidate.artist);
  if (candidate.album) url.searchParams.set("album_name", candidate.album);
  if (candidate.duration) url.searchParams.set("duration", String(Math.round(candidate.duration)));
  return getJson(url.toString());
}

export async function getLyrics(candidate: LyricCandidate): Promise<{ candidate: LyricCandidate; lines: LyricLine[]; source: string }> {
  if (candidate.isrc) {
    try {
      const response = await fetch(`https://lrc.red/s/${encodeURIComponent(candidate.isrc.toUpperCase())}.ttml`, {
        headers: { "user-agent": "player.nvim/0.2 (https://github.com/getwizardo/player.nvim)", accept: "application/ttml+xml, application/xml" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const lines = parseTtml(await response.text());
        if (lines.length) return { candidate, lines, source: "lrc.red · TTML" };
      }
    } catch { /* Try the searchable lyric catalog below. */ }
  }
  const record = candidate.provider === "LRCLIB" ? await lrcRecord(candidate.id) : await lrcBySignature(candidate);
  let lines = record.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
  if (!lines.length && record.plainLyrics) lines = record.plainLyrics.split(/\r?\n/).filter(Boolean).map((text: string) => ({ start: 0, finish: 0, text }));
  if (!lines.length) throw new Error("No lyric text is available for this result.");
  const resolved = { ...candidate, isrc: candidate.isrc || record.isrc || undefined };
  return { candidate: resolved, lines, source: record.syncedLyrics ? "LRCLIB · synced LRC" : "LRCLIB · plain text" };
}

export async function translateLines(lines: LyricLine[], target: string, source = "auto"): Promise<string[]> {
  const endpoint = (process.env.PLAYER_TRANSLATE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
  const body: Record<string, string> = { q: lines.map((line) => line.text).join("\n"), source, target, format: "text" };
  if (process.env.PLAYER_TRANSLATE_API_KEY) body.api_key = process.env.PLAYER_TRANSLATE_API_KEY;
  const response = await fetch(`${endpoint}/translate`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Translator returned HTTP ${response.status}. Check PLAYER_TRANSLATE_URL and its API key.`);
  const payload = await response.json() as { translatedText?: string };
  if (!payload.translatedText) throw new Error("Translator response did not contain translatedText.");
  const translated = payload.translatedText.split(/\r?\n/);
  if (translated.length !== lines.length) throw new Error("Translator changed the lyric line count; translation was not attached to avoid misaligning karaoke timing.");
  return translated;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "search") {
    process.stdout.write(`${JSON.stringify(await searchLyrics(args.join(" ")))}\n`);
    return;
  }
  if (command === "lyrics") {
    const [candidateJson] = args;
    if (!candidateJson) throw new Error("Usage: player-lyrics lyrics '<candidate-json>'");
    const candidate = JSON.parse(candidateJson) as LyricCandidate;
    process.stdout.write(`${JSON.stringify(await getLyrics(candidate))}\n`);
    return;
  }
  if (command === "translate") {
    const [target, source = "auto"] = args;
    if (!target) throw new Error("Usage: player-lyrics translate <target-language> [source-language]");
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const lines = JSON.parse(input) as LyricLine[];
    process.stdout.write(`${JSON.stringify(await translateLines(lines, target, source))}\n`);
    return;
  }
  const isrc = command === "ttml" ? args[0] : command;
  if (!isrc) throw new Error("Usage: player-lyrics ttml <ISRC> | search <query> | lyrics <candidate-json> | translate <target>");
  const lines = await fetchTtml(isrc);
  process.stdout.write(`${JSON.stringify(lines)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
