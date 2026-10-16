import { matchCapture, push, split } from "./lua-util";
import type { LyricLine, LyricWord } from "./types";

/**
 * Minimal TTML and LRC parsers.
 *
 * The Node helper ships a much richer parser; these are only used by the
 * offline fallback that downloads TTML with `curl` when Node.js is not
 * installed.
 */

/** A raw XML element with its attributes and its body. */
interface Block {
  attributes: string;
  body: string;
}

function sortByStart(rows: LyricLine[]): void {
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    let position = index;
    while (position > 0 && rows[position - 1].start > current.start) {
      const swap = rows[position - 1];
      rows[position - 1] = current;
      rows[position] = swap;
      position -= 1;
    }
  }
}

function decodeXml(text: string): string {
  let out = string.gsub(text, "&#x([%da-fA-F]+);", (hex: string): string => {
    return vim.fn.nr2char(tonumber(hex, 16) as number);
  });
  out = string.gsub(out, "&#(%d+);", (decimal: string): string => {
    return vim.fn.nr2char(tonumber(decimal) as number);
  });
  out = string.gsub(out, "&lt;", "<");
  out = string.gsub(out, "&gt;", ">");
  out = string.gsub(out, "&quot;", "\"");
  out = string.gsub(out, "&apos;", "'");
  out = string.gsub(out, "&amp;", "&");
  return out;
}

function attribute(attributes: string, name: string): string | undefined {
  const quoted = matchCapture(attributes, name + "%s*=%s*\"([^\"]*)\"");
  if (quoted !== undefined) {
    return quoted;
  }
  return matchCapture(attributes, name + "%s*=%s*'([^']*)'");
}

function clean(text: string): string {
  let out = string.gsub(text, "<br%s*/?>", " ");
  out = string.gsub(out, "<[^>]+>", " ");
  out = decodeXml(out);
  out = string.gsub(out, "%s+", " ");
  return string.gsub(out, "^%s*(.-)%s*$", "%1");
}

/** Convert a TTML time expression into seconds. */
export function toSeconds(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const frames = matchCapture(value, "^(%d+):%d+:%d+:%d+%.?%d*$");
  if (frames !== undefined) {
    const hours = tonumber(matchCapture(value, "^(%d+)")) || 0;
    const minutes = tonumber(matchCapture(value, "^%d+:(%d+)")) || 0;
    const seconds = tonumber(matchCapture(value, "^%d+:%d+:(%d+)")) || 0;
    const framesCount = tonumber(matchCapture(value, "^%d+:%d+:%d+:(%d+%.?%d*)")) || 0;
    return hours * 3600 + minutes * 60 + seconds + framesCount / 30;
  }
  const clock = matchCapture(value, "^%d+:%d+:%d+%.?%d*$");
  if (clock !== undefined) {
    const hours = tonumber(matchCapture(value, "^(%d+)")) || 0;
    const minutes = tonumber(matchCapture(value, "^%d+:(%d+)")) || 0;
    const seconds = tonumber(matchCapture(value, "^%d+:%d+:(%d+%.?%d*)")) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  const seconds = matchCapture(value, "^(%d+%.?%d*)s$");
  if (seconds !== undefined) {
    return tonumber(seconds) || 0;
  }
  const milliseconds = matchCapture(value, "^(%d+%.?%d*)ms$");
  if (milliseconds !== undefined) {
    return (tonumber(milliseconds) || 0) / 1000;
  }
  const ticks = matchCapture(value, "^(%d+%.?%d*)t$");
  if (ticks !== undefined) {
    return tonumber(ticks) || 0;
  }
  return tonumber(value) || 0;
}

function collect(xml: string, pattern: string, out: Block[]): void {
  string.gsub(xml, pattern, (...args: string[]): string => {
    out[out.length] = {
      attributes: args.length > 1 ? args[1] : "",
      body: args.length > 2 ? args[2] : "",
    };
    return "";
  });
}

function blocks(xml: string, name: string): Block[] {
  const out: Block[] = [];
  collect(xml, "(<" + name + "([^>]*)>(.-)</" + name + "%s*>)", out);
  collect(xml, "(<[%w_.-]+:" + name + "([^>]*)>(.-)</[%w_.-]+:" + name + "%s*>)", out);
  return out;
}

/** Parse a TTML document into timed lyric lines. */
export function parseTtml(xml: string): LyricLine[] {
  const rows: LyricLine[] = [];
  const paragraphs = blocks(xml, "p");
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const start = toSeconds(attribute(paragraph.attributes, "begin"));
    const finish = toSeconds(attribute(paragraph.attributes, "end"));
    const words: LyricWord[] = [];
    const spans = blocks(paragraph.body, "span");
    for (let spanIndex = 0; spanIndex < spans.length; spanIndex += 1) {
      const span = spans[spanIndex];
      const text = clean(span.body);
      const begin = attribute(span.attributes, "begin");
      const end = attribute(span.attributes, "end");
      if (text !== "" && (begin !== undefined || end !== undefined)) {
        const rawStart = toSeconds(begin);
        const rawFinish = toSeconds(end);
        const word: LyricWord = {
          start: rawStart > 0 && rawStart < start ? start + rawStart : rawStart,
          finish: rawFinish > 0 && rawFinish < start ? start + rawFinish : rawFinish,
          text: text,
        };
        words[words.length] = word;
      }
    }
    const text = clean(paragraph.body);
    if (text !== "") {
      const row: LyricLine = { start: start, finish: finish, text: text };
      if (words.length > 0) {
        for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
          const previous = words[wordIndex];
          const current = words[wordIndex + 1];
          if (previous.start > current.start) {
            const swap = previous.start;
            previous.start = current.start;
            current.start = swap;
          }
        }
        for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
          const word = words[wordIndex];
          if (word.finish === 0) {
            const next = words[wordIndex + 1];
            word.finish = next !== undefined ? next.start : finish;
          }
        }
        row.words = words;
      }
      rows[rows.length] = row;
    }
  }
  sortByStart(rows);
  return rows;
}

/** Parse a synced LRC document into timed lyric lines. */
export function parseLrc(lrc: string): LyricLine[] {
  const rows: LyricLine[] = [];
  const lines = split(lrc, "\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let rest = string.gsub(lines[lineIndex], "\r", "");
    const stamps: number[] = [];
    while (true) {
      const stamp = matchCapture(rest, "^%[(.-)%]");
      if (stamp === undefined) {
        break;
      }
      const minutes = tonumber(matchCapture(stamp, "^(%d+):"));
      const seconds = tonumber(matchCapture(stamp, "^%d+:(%d+)"));
      const fractionText = matchCapture(stamp, "[%.:](%d+)$");
      let fraction = 0;
      if (fractionText !== undefined) {
        const divisor = fractionText.length === 1 ? 10 : fractionText.length === 2 ? 100 : 1000;
        fraction = (tonumber(fractionText) || 0) / divisor;
      }
      if (minutes === undefined || seconds === undefined) {
        break;
      }
      stamps[stamps.length] = minutes * 60 + seconds + fraction;
      rest = string.sub(rest, stamp.length + 3);
    }
    if (stamps.length === 0) {
      continue;
    }
    const text = string.gsub(rest, "^%s*(.-)%s*$", "%1");
    if (text === "") {
      continue;
    }
    for (let index = 0; index < stamps.length; index += 1) {
      push(rows, { start: stamps[index], finish: 0, text: text });
    }
  }
  sortByStart(rows);
  return rows;
}
