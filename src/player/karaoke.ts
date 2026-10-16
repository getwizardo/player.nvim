/**
 * The karaoke float.
 *
 * Lines are rendered once; every tick only the extmarks change, so word-level
 * TTML highlighting stays cheap:
 *
 *   - the active line gets `PlayerLyricActive`
 *   - words already sung get `PlayerKaraokeSung`
 *   - the word being sung gets `PlayerKaraokeWord`
 *   - translations sit on their own muted row
 */

import { get as getOptions } from "./config";
import * as highlights from "./highlights";
import * as lyrics from "./lyrics";
import * as mpv from "./mpv";
import * as translate from "./translate";
import type { LyricSet } from "./types";
import { clamp, formatStamp, indexOf, notify, rep, trim } from "./util";

interface WordSpan {
  start: number;
  end: number;
}

interface Row {
  /** Index into `set.lines`. */
  index: number;
  /** 0-based buffer row of the lyric text. */
  bufferRow: number;
  /** 0-based byte column where the lyric text starts. */
  column: number;
  words: WordSpan[];
  translationRow?: number;
}

interface Active {
  set?: LyricSet;
  buf?: number;
  win?: number;
  timer?: UvTimer;
  rows: Row[];
  current: number;
  follow: boolean;
}

const namespace = vim.api.nvim_create_namespace("player.nvim.karaoke");
const active: Active = { rows: [], current: -1, follow: true };
/** Last known playback position, reused when the buffer is re-rendered. */
let lastPosition = 0;

function stopTimer(): void {
  if (active.timer !== undefined) {
    active.timer.stop();
    if (!active.timer.is_closing()) active.timer.close();
    active.timer = undefined;
  }
}

export function close(): void {
  stopTimer();
  if (active.win !== undefined && vim.api.nvim_win_is_valid(active.win)) {
    pcall(() => vim.api.nvim_win_close(active.win as number, true));
  }
  active.win = undefined;
  active.buf = undefined;
  active.rows = [];
  active.current = -1;
  active.set = undefined;
}

export function isOpen(): boolean {
  return active.win !== undefined && vim.api.nvim_win_is_valid(active.win);
}

export function hasLyrics(): boolean {
  return active.set !== undefined && active.set.lines.length > 0;
}

/**
 * Byte column of every word inside the rendered line text. The result is
 * index-aligned with the input words; `start < 0` marks a word that could not
 * be located (the line text then keeps its plain highlight).
 */
function wordSpans(text: string, column: number, words: Array<{ text: string }>): WordSpan[] {
  const spans: WordSpan[] = [];
  let cursor = 1;
  for (const word of words) {
    const found = indexOf(text, word.text, cursor);
    if (found === undefined) {
      spans.push({ start: -1, end: -1 });
      continue;
    }
    spans.push({ start: column + found - 1, end: column + found - 1 + word.text.length });
    cursor = found + word.text.length;
  }
  return spans;
}

function render(): void {
  const set = active.set;
  const buf = active.buf;
  if (set === undefined || buf === undefined || !vim.api.nvim_buf_is_valid(buf)) return;
  const header = [
    "  KARAOKE",
    `  ${set.title === "" ? "Lyrics" : set.title}`,
    `  ${set.artist}${set.album === "" ? "" : ` · ${set.album}`}`,
    `  ${lyrics.describeSet(set)}`,
    "",
  ];
  const lines: string[] = [];
  for (const line of header) lines.push(line);
  const rows: Row[] = [];
  let lastPart = "";
  set.lines.forEach((line, index) => {
    if (line.part !== undefined && line.part !== lastPart) {
      lastPart = line.part;
      lines.push(`  ── ${line.part} ──`);
    }
    const prefix = line.start > 0 ? `  ${formatStamp(line.start)}   ` : "  ";
    const bufferRow = lines.length;
    lines.push(`${prefix}${line.text}`);
    const row: Row = {
      index,
      bufferRow,
      column: prefix.length,
      words: line.words !== undefined ? wordSpans(line.text, prefix.length, line.words) : [],
    };
    if (line.translation !== undefined && line.translation !== "") {
      lines.push(`${rep(" ", prefix.length)}${line.translation}`);
      row.translationRow = lines.length - 1;
    }
    rows.push(row);
  });
  if (set.lines.length === 0) lines.push("  No lyrics found for this track.");

  vim.bo[buf].modifiable = true;
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines);
  vim.bo[buf].modifiable = false;
  vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1);
  active.rows = rows;
  vim.api.nvim_buf_set_extmark(buf, namespace, 0, 0, { line_hl_group: "PlayerEyebrow", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 1, 0, { line_hl_group: "PlayerTitle", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 2, 0, { line_hl_group: "PlayerMuted", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 3, 0, { line_hl_group: "PlayerAccent", priority: 80 });
  for (const row of rows) {
    vim.api.nvim_buf_set_extmark(buf, namespace, row.bufferRow, 0, {
      end_row: row.bufferRow,
      end_col: row.column,
      hl_group: "PlayerTimestamp",
      priority: 70,
    });
  }
  active.current = -1;
}

function resize(): void {
  const buf = active.buf;
  const win = active.win;
  if (buf === undefined || win === undefined || !vim.api.nvim_win_is_valid(win)) return;
  const width = clamp(vim.o.columns - 8, 30, 84);
  const height = clamp(vim.api.nvim_buf_line_count(buf) + 1, 8, math.max(8, vim.o.lines - 6));
  vim.api.nvim_win_set_config(win, {
    relative: "editor",
    width,
    height,
    row: math.max(0, math.floor((vim.o.lines - height) / 2)),
    col: math.max(0, math.floor((vim.o.columns - width) / 2)),
    style: "minimal",
    border: "rounded",
    title: "  ♪  player.nvim  ",
    title_pos: "center",
  });
}

function findCurrent(position: number): number {
  const set = active.set;
  if (set === undefined || set.lines.length === 0) return -1;
  let current = -1;
  set.lines.forEach((line, index) => {
    if (line.start <= position) current = index;
  });
  if (current === -1) current = 0;
  return current;
}

/** Redraw the highlight for a playback position (called ~5x per second). */
export function update(position: number): void {
  const set = active.set;
  const buf = active.buf;
  if (set === undefined || buf === undefined || !vim.api.nvim_buf_is_valid(buf)) {
    stopTimer();
    return;
  }
  const current = findCurrent(position);
  const row = active.rows[current];
  const changed = current !== active.current;
  active.current = current;
  vim.api.nvim_buf_clear_namespace(buf, namespace, 4, -1);
  for (const item of active.rows) {
    vim.api.nvim_buf_set_extmark(buf, namespace, item.bufferRow, 0, {
      end_row: item.bufferRow,
      end_col: item.column,
      hl_group: "PlayerTimestamp",
      priority: 70,
    });
  }
  if (row === undefined) return;
  vim.api.nvim_buf_set_extmark(buf, namespace, row.bufferRow, 0, { line_hl_group: "PlayerLyricActive", priority: 90 });
  if (row.translationRow !== undefined) {
    vim.api.nvim_buf_set_extmark(buf, namespace, row.translationRow, 0, {
      line_hl_group: "PlayerTranslation",
      priority: 85,
    });
  }
  const line = set.lines[row.index];
  if (line.words !== undefined) {
    line.words.forEach((word, position2) => {
      const span = row.words[position2];
      if (span === undefined || span.start < 0) return;
      if (word.start > position) return;
      const sung = word.finish > 0 && word.finish <= position;
      vim.api.nvim_buf_set_extmark(buf, namespace, row.bufferRow, span.start, {
        end_row: row.bufferRow,
        end_col: span.end,
        hl_group: sung ? "PlayerKaraokeSung" : "PlayerKaraokeWord",
        priority: sung ? 100 : 120,
      });
    });
  }
  if (!changed || !active.follow) return;
  const win = active.win;
  if (win === undefined || !vim.api.nvim_win_is_valid(win)) return;
  pcall(() => vim.api.nvim_win_set_cursor(win as number, [row.bufferRow + 1, 0]));
  pcall(() => vim.api.nvim_win_call(win as number, () => vim.cmd("normal! zz")));
}

/** Jump playback to a lyric line (`[` / `]` in the float). */
function jump(delta: number): void {
  const set = active.set;
  if (set === undefined || set.lines.length === 0) return;
  const current = active.current < 0 ? 0 : active.current;
  const target = clamp(current + delta, 0, set.lines.length - 1);
  active.current = target;
  mpv.seek(math.max(0, set.lines[target].start - 0.2));
}

export function translateTo(target?: string): void {
  const set = active.set;
  if (set === undefined || set.lines.length === 0) {
    notify("Open lyrics before translating.", vim.log.levels.WARN);
    return;
  }
  const run = (language: string): void => {
    const code = trim(language);
    if (code === "") return;
    notify(`Translating ${set.lines.length} line(s) to ${code}…`);
    translate.translateLines(set.lines, code, (values, error) => {
      if (values === undefined) {
        notify(`Translation: ${error ?? "unknown error"}`, vim.log.levels.ERROR);
        return;
      }
      set.lines.forEach((line, index) => {
        line.translation = values[index];
      });
      render();
      resize();
      update(lastPosition);
      notify(`Lyrics translated to ${code}.`);
    });
  };
  if (target !== undefined && trim(target) !== "") {
    run(target);
    return;
  }
  vim.ui.input({ prompt: "Target language code (en, vi, ja, hi, …): ", default: "en" }, (value) => {
    if (value !== undefined) run(value);
  });
}

function toggleFollow(): void {
  active.follow = !active.follow;
  getOptions().lyric.follow = active.follow;
  notify(`Karaoke follow ${active.follow ? "on" : "off"}.`);
}

function mapKey(key: string, handler: () => void, description: string): void {
  const buf = active.buf;
  if (buf === undefined) return;
  vim.keymap.set("n", key, handler, { buffer: buf, silent: true, desc: description });
}

/** Show a resolved lyric set in the float and start following playback. */
export function open(set: LyricSet): void {
  stopTimer();
  close();
  highlights.define();
  active.set = set;
  active.follow = getOptions().lyric.follow;
  const buf = vim.api.nvim_create_buf(false, true);
  vim.api.nvim_buf_set_name(buf, `player://karaoke-${vim.uv.hrtime()}`);
  vim.bo[buf].buftype = "nofile";
  vim.bo[buf].bufhidden = "wipe";
  vim.bo[buf].swapfile = false;
  vim.bo[buf].filetype = "playerlyrics";
  active.buf = buf;
  render();
  active.win = vim.api.nvim_open_win(buf, true, {
    relative: "editor",
    width: clamp(vim.o.columns - 8, 30, 84),
    height: clamp(vim.api.nvim_buf_line_count(buf) + 1, 8, math.max(8, vim.o.lines - 6)),
    row: math.max(0, math.floor((vim.o.lines - math.min(vim.o.lines - 6, vim.api.nvim_buf_line_count(buf) + 1)) / 2)),
    col: math.max(0, math.floor((vim.o.columns - clamp(vim.o.columns - 8, 30, 84)) / 2)),
    style: "minimal",
    border: "rounded",
    title: "  ♪  player.nvim  ",
    title_pos: "center",
  });
  resize();
  vim.wo[active.win].winhl = highlights.floatHighlights();
  vim.wo[active.win].wrap = true;
  vim.wo[active.win].cursorline = false;
  vim.wo[active.win].number = false;
  vim.wo[active.win].signcolumn = "no";
  vim.wo[active.win].foldenable = false;
  mapKey("q", () => close(), "Close karaoke lyrics");
  mapKey("<Esc>", () => close(), "Close karaoke lyrics");
  mapKey("t", () => translateTo(undefined), "Translate the open lyrics");
  mapKey("f", () => toggleFollow(), "Toggle lyric follow");
  mapKey("[", () => jump(-1), "Seek to the previous lyric line");
  mapKey("]", () => jump(1), "Seek to the next lyric line");
  mapKey("j", () => {
    active.follow = false;
    vim.cmd("normal! j");
  }, "Scroll down (disables follow)");
  mapKey("k", () => {
    active.follow = false;
    vim.cmd("normal! k");
  }, "Scroll up (disables follow)");
  const timer = vim.uv.new_timer();
  active.timer = timer;
  timer.start(
    0,
    200,
    vim.schedule_wrap(() => {
      if (!isOpen()) {
        stopTimer();
        return;
      }
      mpv.poll<number>("time-pos", (value) => {
        if (value === undefined) return;
        lastPosition = value;
        update(value);
      });
    }),
  );
}

/** Keep the header in sync when the track changes. */
export function refresh(): void {
  if (active.set === undefined) return;
  render();
  resize();
}
