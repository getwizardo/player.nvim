/**
 * Optional translation of the open lyric lines through a
 * LibreTranslate-compatible endpoint (default: local `127.0.0.1:5000`).
 *
 *   POST /translate   {"q": "...", "source": "auto", "target": "vi", "format": "text"}
 *
 * The whole lyric is sent as one request first. If the provider changes the
 * number of lines, the plugin retries line by line so karaoke timing can never
 * be misaligned by a translation.
 */

import { get as getOptions } from "./config";
import { postJson } from "./http";
import type { LyricLine } from "./types";
import { replace, splitLines, trim } from "./util";

function endpoint(): string {
  return replace(trim(getOptions().translator.url), "/+$", "");
}

function bodyFor(text: string, target: string): Record<string, string> {
  const translator = getOptions().translator;
  const body: Record<string, string> = {
    q: text,
    source: translator.source === "" ? "auto" : translator.source,
    target,
    format: "text",
  };
  if (translator.api_key !== "") body.api_key = translator.api_key;
  return body;
}

function translateOne(text: string, target: string, callback: (value: string | undefined, error?: string) => void): void {
  const url = `${endpoint()}/translate`;
  postJson<unknown>(url, bodyFor(text, target), { timeout: 60 }, (payload, error) => {
    if (payload === undefined) {
      callback(undefined, error);
      return;
    }
    const record = payload as Record<string, unknown>;
    const translated = record.translatedText;
    if (type(translated) !== "string") {
      callback(undefined, "The translator response did not contain translatedText.");
      return;
    }
    callback(translated as string);
  });
}

function translateEach(texts: string[], target: string, index: number, out: string[], callback: (values: string[] | undefined, error?: string) => void): void {
  if (index >= texts.length) {
    callback(out);
    return;
  }
  translateOne(texts[index], target, (value, error) => {
    if (value === undefined) {
      callback(undefined, error);
      return;
    }
    out.push(trim(value));
    translateEach(texts, target, index + 1, out, callback);
  });
}

/** Translate every line, keeping the 1:1 mapping with the original lines. */
export function translateLines(lines: LyricLine[], target: string, callback: (values: string[] | undefined, error?: string) => void): void {
  const language = trim(target);
  if (language === "") {
    callback(undefined, "Enter a target language code (en, vi, ja, hi, ...).");
    return;
  }
  if (endpoint() === "") {
    callback(undefined, "translator.url is empty, so there is nowhere to send the lyrics.");
    return;
  }
  const texts = lines.map((line) => line.text);
  translateOne(texts.join("\n"), language, (value, error) => {
    if (value === undefined) {
      callback(undefined, error);
      return;
    }
    const translated = splitLines(value);
    if (translated.length === texts.length) {
      callback(translated.map((line) => trim(line)));
      return;
    }
    // The provider merged or split lines; retry line by line.
    translateEach(texts, language, 0, [], (each, eachError) => {
      if (each === undefined) callback(undefined, eachError);
      else callback(each);
    });
  });
}
