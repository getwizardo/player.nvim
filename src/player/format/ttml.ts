/**
 * TTML (Timed Text Markup Language) reader for karaoke lyrics.
 *
 * Handles the Apple-Music-flavoured documents lrc.red serves:
 *   - `<p begin="27.395" end="28.960" lrc:key="L1" ttm:agent="v1">` paragraphs
 *   - per-word `<span begin="27.395" end="27.549">I</span>` karaoke spans
 *   - `lrc:timing` / `itunes:timing` (Word | Line | None)
 *   - `role="x-bg"` background vocals, `role="x-translation"` translations,
 *     `role="x-roman"` romanisation
 *   - `<ttm:agent xml:id="v1"><ttm:name type="full">Vocal 1</ttm:name>` singers
 *   - document level `<translations><translation xml:lang="ja"><text for="L1">`
 *   - clock (`0:00:01.000`, `3:10.387`), offset (`1500ms`, `1.5s`) and frame
 *     (`00:00:01:12` with `ttp:frameRate`) time expressions
 */

import type { LyricLine, LyricWord, SyncMode } from "../types";
import { attr, childrenNamed, findAll, findFirst, parseXml, textOf, type XmlNode } from "./xml";
import { inlineText, lower, match, plainText, trim } from "../util";

export interface TtmlDocument {
  lines: LyricLine[];
  songwriters: string[];
  language: string;
  timing: SyncMode;
  duration: number;
}

const EMPTY: TtmlDocument = { lines: [], songwriters: [], language: "", timing: "none", duration: 0 };

/** Convert any TTML time expression to seconds. */
export function timing(value: string | undefined, frameRate: number, tickRate: number): number {
  if (value === undefined) return 0;
  const text = trim(value);
  if (text === "") return 0;
  const frames = match(text, "^(%d+):(%d+):(%d+):(%d+%.?%d*)$");
  if (frames.length === 4) {
    return (
      (tonumber(frames[0]) ?? 0) * 3600 +
      (tonumber(frames[1]) ?? 0) * 60 +
      (tonumber(frames[2]) ?? 0) +
      (tonumber(frames[3]) ?? 0) / frameRate
    );
  }
  const clock = match(text, "^(%d+):(%d+):(%d+%.?%d*)$");
  if (clock.length === 3) return (tonumber(clock[0]) ?? 0) * 3600 + (tonumber(clock[1]) ?? 0) * 60 + (tonumber(clock[2]) ?? 0);
  const short = match(text, "^(%d+):(%d+%.?%d*)$");
  if (short.length === 2) return (tonumber(short[0]) ?? 0) * 60 + (tonumber(short[1]) ?? 0);
  // Lua patterns have no alternation, so read the unit separately.
  const offset = match(text, "^(%d+%.?%d*)(%a*)$");
  if (offset.length === 2) {
    const amount = tonumber(offset[0]) ?? 0;
    const unit = offset[1];
    if (unit === "ms") return amount / 1000;
    if (unit === "t") return tickRate > 0 ? amount / tickRate : amount;
    return amount;
  }
  return tonumber(text) ?? 0;
}

function readRates(root: XmlNode): { frameRate: number; tickRate: number } {
  const rate = attr(root, "ttp:frameRate");
  let frameRate = 30;
  if (rate !== undefined) {
    const fraction = match(rate, "^(%d+)%s+(%d+)%s+(%d+)$");
    const numerator = fraction.length === 3 ? tonumber(fraction[1]) : undefined;
    const denominator = fraction.length === 3 ? tonumber(fraction[2]) : undefined;
    const base = tonumber(match(rate, "^(%d+)")[0] ?? "") ?? 30;
    frameRate = numerator !== undefined && denominator !== undefined && denominator > 0 ? (base * numerator) / denominator : base;
  }
  const ticks = tonumber(attr(root, "ttp:tickRate") ?? "");
  return { frameRate: frameRate > 0 ? frameRate : 30, tickRate: ticks !== undefined && ticks > 0 ? ticks : frameRate };
}

function readAgents(root: XmlNode): Record<string, string> {
  const agents: Record<string, string> = {};
  for (const agent of findAll(root, "agent")) {
    const id = attr(agent, "xml:id") ?? attr(agent, "id");
    if (id === undefined) continue;
    const name = findFirst(agent, "name");
    if (name === undefined) continue;
    agents[id] = trim(textOf(name));
  }
  return agents;
}

function readTranslations(root: XmlNode): Record<string, string> {
  const map: Record<string, string> = {};
  for (const container of findAll(root, "translations")) {
    for (const translation of childrenNamed(container, "translation")) {
      for (const text of childrenNamed(translation, "text")) {
        const target = attr(text, "for");
        if (target === undefined) continue;
        const value = plainText(textOf(text));
        if (value === "") continue;
        map[target] = map[target] === undefined ? value : `${map[target]} ${value}`;
      }
    }
  }
  return map;
}

function readSongwriters(root: XmlNode): string[] {
  const writers: string[] = [];
  for (const container of findAll(root, "songwriters")) {
    for (const writer of childrenNamed(container, "songwriter")) {
      const name = trim(textOf(writer));
      if (name !== "") writers.push(name);
    }
  }
  return writers;
}

interface SpanInfo {
  words: LyricWord[];
  background: string[];
  translation: string[];
  roman: string[];
}

function roleOf(node: XmlNode): string {
  return lower(attr(node, "role") ?? "");
}

/** Collect timed spans (including nested background vocals) from a paragraph. */
function readSpans(paragraph: XmlNode, frameRate: number, tickRate: number, background: boolean): SpanInfo {
  const info: SpanInfo = { words: [], background: [], translation: [], roman: [] };
  const push = (child: SpanInfo): void => {
    for (const word of child.words) info.words.push(word);
    for (const value of child.background) info.background.push(value);
    for (const value of child.translation) info.translation.push(value);
    for (const value of child.roman) info.roman.push(value);
  };
  for (const span of childrenNamed(paragraph, "span")) {
    const role = roleOf(span);
    const isBackground = background || role === "x-bg";
    const nested = readSpans(span, frameRate, tickRate, isBackground);
    const begin = attr(span, "begin");
    const end = attr(span, "end");
    const text = plainText(textOf(span));
    if (role === "x-translation") {
      if (text !== "") info.translation.push(text);
      push(nested);
      continue;
    }
    if (role === "x-roman") {
      if (text !== "") info.roman.push(text);
      push(nested);
      continue;
    }
    if (begin === undefined && end === undefined) {
      // Untimed wrapper span: keep its timed children.
      push(nested);
      continue;
    }
    const word: LyricWord = {
      start: timing(begin, frameRate, tickRate),
      finish: timing(end, frameRate, tickRate),
      text,
    };
    if (isBackground) word.background = true;
    if (text !== "") {
      info.words.push(word);
      if (isBackground) info.background.push(text);
    }
    push(nested);
  }
  return info;
}

export function parseTtml(xml: string): TtmlDocument {
  const root = parseXml(xml);
  if (root === undefined) return EMPTY;
  const { frameRate, tickRate } = readRates(root);
  const agents = readAgents(root);
  const translations = readTranslations(root);
  const lines: LyricLine[] = [];

  const walk = (node: XmlNode, part: string | undefined): void => {
    for (const child of node.children) {
      if (child.local === "p") {
        const start = timing(attr(child, "begin"), frameRate, tickRate);
        const finish = timing(attr(child, "end"), frameRate, tickRate);
        const spans = readSpans(child, frameRate, tickRate, false);
        spans.words.sort((a, b) => a.start - b.start);
        const text = inlineText(child.inner);
        if (text === "") continue;
        const line: LyricLine = { start, finish: finish > start ? finish : 0, text };
        if (spans.words.length > 0) {
          spans.words.forEach((word, index) => {
            if (word.finish <= word.start) word.finish = spans.words[index + 1]?.start ?? line.finish;
          });
          line.words = spans.words;
        }
        if (spans.translation.length > 0) line.translation = spans.translation.join(" ");
        if (spans.background.length > 0) line.background = spans.background.join(" ");
        const key = attr(child, "lrc:key") ?? attr(child, "itunes:key");
        if (key !== undefined) {
          const translated = translations[key];
          if (translated !== undefined && line.translation === undefined) line.translation = translated;
        }
        const singer = attr(child, "ttm:agent") ?? attr(child, "itunes:agent");
        if (singer !== undefined && agents[singer] !== undefined) line.singer = agents[singer];
        line.part = attr(child, "lrc:songPart") ?? attr(child, "itunes:songPart") ?? part;
        lines.push(line);
        continue;
      }
      walk(child, attr(child, "lrc:songPart") ?? attr(child, "itunes:songPart") ?? part);
    }
  };

  const body = findFirst(root, "body") ?? root;
  walk(body, undefined);
  lines.sort((a, b) => a.start - b.start);

  const declared = lower(attr(root, "lrc:timing") ?? attr(root, "itunes:timing") ?? "");
  const inferred: SyncMode = lines.some((line) => line.words !== undefined)
    ? "word"
    : lines.length > 0 && lines.some((line) => line.start > 0)
      ? "line"
      : "none";
  const timingMode: SyncMode = declared === "word" ? "word" : declared === "line" ? "line" : declared === "none" ? "none" : inferred;

  return {
    lines,
    songwriters: readSongwriters(root),
    language: attr(root, "xml:lang") ?? attr(root, "lang") ?? "",
    timing: timingMode,
    duration: timing(attr(body, "dur"), frameRate, tickRate),
  };
}
