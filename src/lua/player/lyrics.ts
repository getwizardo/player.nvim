import { actions } from "./actions";
import { options } from "./config";
import { helperCall } from "./helper";
import * as mpv from "./mpv";
import { parseLrc, parseTtml } from "./ttml";
import type { LyricLine, LyricMetadata } from "./types";

/** The callback of {@link fetchTtmlWithCurl}. */
/** @noSelf */
export interface TtmlCallback {
  /** @noSelf */
  (rows?: LyricLine[], error?: string): void;
}

/** The callback of the catalog lookups. */
/** @noSelf */
export interface CandidatesCallback {
  /** @noSelf */
  (candidates: Record<string, unknown>[], error?: string): void;
}

/**
 * The karaoke lyric viewer.
 *
 * The lyrics are fetched by the Node helper (LRCLIB, JioSaavn and lrc.red) and
 * rendered in a floating window. When the source provides word level timings
 * the words are highlighted while the track plays.
 */

/** A row of the rendered lyric window. */
/** @noSelf */
export interface DisplayRow {
  /** Line of the buffer the row belongs to. */
  bufferRow: number;
  /** Column the text starts at. */
  textColumn: number;
  /** The lyric line itself. */
  line: LyricLine;
  /** Line of the buffer that holds the translation, 0 when there is none. */
  translationRow: number;
}

/** The state of the lyric viewer. */
/** @noSelf */
export interface LyricsState {
  buffer: number;
  window: number;
  timer: VimTimer | undefined;
  rows: LyricLine[];
  displayRows: DisplayRow[];
  metadata: LyricMetadata;
  source: string;
  previous: number;
  position: number;
  observers: number[];
}

function toLyricLines(value: unknown): LyricLine[] {
  if (type(value) !== "table") {
    return [];
  }
  const rows: LyricLine[] = [];
  const source = value as Record<string, unknown>[];
  for (let index = 0; index < source.length; index += 1) {
    const entry = source[index];
    if (type(entry) !== "table") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const text = record.text;
    if (typeof text !== "string" || text === "") {
      continue;
    }
    const row: LyricLine = {
      start: typeof record.start === "number" ? record.start : 0,
      finish: typeof record.finish === "number" ? record.finish : 0,
      text: text,
    };
    if (record.words !== undefined && type(record.words) === "table") {
      const words = record.words as Record<string, unknown>[];
      const parsed: LyricLine["words"] = [];
      for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
        const word = words[wordIndex];
        if (typeof word.text !== "string" || word.text === "") {
          continue;
        }
        parsed[parsed.length] = {
          start: typeof word.start === "number" ? word.start : 0,
          finish: typeof word.finish === "number" ? word.finish : 0,
          text: word.text,
        };
      }
      if (parsed.length > 0) {
        row.words = parsed;
      }
    }
    if (typeof record.translation === "string" && record.translation !== "") {
      row.translation = record.translation;
    }
    rows[rows.length] = row;
  }
  return rows;
}

const state: LyricsState = {
  buffer: 0,
  window: 0,
  timer: undefined,
  rows: [],
  displayRows: [],
  metadata: { title: "Lyrics", artist: "", album: "" },
  source: "",
  previous: -1,
  position: 0,
  observers: [],
};

const namespace = vim.api.nvim_create_namespace("player.nvim.karaoke");

function notify(message: string, level?: number): void {
  vim.notify(message, level === undefined ? vim.log.levels.INFO : level, { title: "player.nvim" });
}

function setStyle(): void {
  vim.api.nvim_set_hl(0, "PlayerSurface", { bg: "#17151d", fg: "#eeeaf2", default: true });
  vim.api.nvim_set_hl(0, "PlayerBorder", { fg: "#d85c86", bg: "#17151d", default: true });
  vim.api.nvim_set_hl(0, "PlayerEyebrow", { fg: "#e58ca5", bold: true, default: true });
  vim.api.nvim_set_hl(0, "PlayerMuted", { fg: "#aaa1b2", default: true });
  vim.api.nvim_set_hl(0, "PlayerLyricActive", { fg: "#fff7fb", bold: true, default: true });
  vim.api.nvim_set_hl(0, "PlayerKaraokeWord", { fg: "#ff7ba4", bold: true, underline: true, default: true });
  vim.api.nvim_set_hl(0, "PlayerTranslation", { fg: "#aaa1b2", italic: true, default: true });
}

function stopTimer(): void {
  const timer = state.timer;
  if (timer !== undefined) {
    timer.stop(timer);
    timer.close(timer);
    state.timer = undefined;
  }
}

function stopObservers(): void {
  for (let index = 0; index < state.observers.length; index += 1) {
    mpv.unobserve(state.observers[index]);
  }
  state.observers = [];
}

function render(): void {
  if (state.buffer === 0 || !vim.api.nvim_buf_is_valid(state.buffer)) {
    return;
  }
  const lines: string[] = [
    "  NOW PLAYING  /  KARAOKE",
    "  " + (state.metadata.title === "" ? "Lyrics" : state.metadata.title),
    "  " + state.metadata.artist + (state.source === "" ? "" : "  ·  " + state.source),
    "",
  ];
  const displayRows: DisplayRow[] = [];
  for (let index = 0; index < state.rows.length; index += 1) {
    const item = state.rows[index];
    const prefix = item.start > 0 ? string.format("  %02d:%02d   ", math.floor(item.start / 60), math.floor(item.start % 60)) : "  ";
    const row: DisplayRow = { bufferRow: lines.length, textColumn: prefix.length, line: item, translationRow: 0 };
    lines[lines.length] = prefix + item.text;
    if (item.translation !== undefined && item.translation !== "") {
      lines[lines.length] = "           " + item.translation;
      row.translationRow = lines.length - 1;
    }
    displayRows[displayRows.length] = row;
  }
  if (state.rows.length === 0) {
    lines[lines.length] = "  No lyrics found for this track.";
  }
  vim.bo[state.buffer].modifiable = true;
  vim.api.nvim_buf_set_lines(state.buffer, 0, -1, false, lines);
  vim.bo[state.buffer].modifiable = false;
  vim.api.nvim_buf_clear_namespace(state.buffer, namespace, 0, -1);
  state.displayRows = displayRows;
  if (state.window !== 0 && vim.api.nvim_win_is_valid(state.window)) {
    const width = math.max(24, math.min(78, vim.o.columns - 8));
    const height = math.max(8, math.min(vim.o.lines - 6, vim.api.nvim_buf_line_count(state.buffer) + 1));
    vim.api.nvim_win_set_config(state.window, {
      relative: "editor",
      width: width,
      height: height,
      row: math.max(1, math.floor((vim.o.lines - height) / 2)),
      col: math.max(1, math.floor((vim.o.columns - width) / 2)),
      border: "rounded",
      title: "  ♪  PLAYER  ",
      title_pos: "center",
    });
  }
}

function update(position: number): void {
  if (state.buffer === 0 || !vim.api.nvim_buf_is_valid(state.buffer)) {
    stopTimer();
    return;
  }
  state.position = position;
  let hasTiming = false;
  for (let index = 0; index < state.rows.length; index += 1) {
    if (state.rows[index].start > 0 || state.rows[index].words !== undefined) {
      hasTiming = true;
      break;
    }
  }
  if (!hasTiming) {
    return;
  }
  let current = -1;
  for (let index = 0; index < state.rows.length; index += 1) {
    if (state.rows[index].start <= position) {
      current = index;
    } else {
      break;
    }
  }
  const changed = current !== state.previous;
  state.previous = current;
  vim.api.nvim_buf_clear_namespace(state.buffer, namespace, 0, -1);
  if (current < 0) {
    return;
  }
  const display = state.displayRows[current];
  if (display === undefined) {
    return;
  }
  vim.api.nvim_buf_set_extmark(state.buffer, namespace, display.bufferRow, 0, {
    line_hl_group: "PlayerLyricActive",
    priority: 110,
  });
  if (display.translationRow > 0) {
    vim.api.nvim_buf_set_extmark(state.buffer, namespace, display.translationRow, 0, {
      line_hl_group: "PlayerTranslation",
      priority: 90,
    });
  }
  const line = display.line;
  if (line.words !== undefined) {
    let cursor = 1;
    for (let index = 0; index < line.words.length; index += 1) {
      const word = line.words[index];
      const at = string.find(line.text, word.text, cursor, true);
      if (at === undefined) {
        continue;
      }
      cursor = at + word.text.length;
      if (word.start <= position && (word.finish === 0 || word.finish >= position)) {
        const startColumn = display.textColumn + at - 1;
        const endColumn = startColumn + word.text.length;
        vim.api.nvim_buf_set_extmark(state.buffer, namespace, display.bufferRow, startColumn, {
          end_row: display.bufferRow,
          end_col: endColumn,
          hl_group: "PlayerKaraokeWord",
          priority: 180,
        });
      }
    }
  }
  if (changed && options().lyric.follow && state.window !== 0 && vim.api.nvim_win_is_valid(state.window)) {
    vim.api.nvim_win_set_cursor(state.window, [display.bufferRow + 1, 0]);
    vim.api.nvim_win_call(state.window, (): void => {
      vim.cmd("normal! zz");
    });
  }
}

function open(lines: LyricLine[], metadata: LyricMetadata, source: string): void {
  stopTimer();
  stopObservers();
  if (state.window !== 0 && vim.api.nvim_win_is_valid(state.window)) {
    vim.api.nvim_win_close(state.window, true);
  }
  state.window = 0;
  setStyle();
  state.rows = lines;
  state.metadata = metadata;
  state.source = source;
  state.previous = -1;
  state.buffer = vim.api.nvim_create_buf(false, true);
  vim.api.nvim_buf_set_name(state.buffer, "player://karaoke-" + tostring(vim.uv.hrtime()));
  vim.bo[state.buffer].buftype = "nofile";
  vim.bo[state.buffer].bufhidden = "wipe";
  vim.bo[state.buffer].swapfile = false;
  vim.bo[state.buffer].filetype = "playerlyrics";
  render();
  const width = math.max(24, math.min(78, vim.o.columns - 8));
  const height = math.max(8, math.min(vim.o.lines - 6, vim.api.nvim_buf_line_count(state.buffer) + 1));
  state.window = vim.api.nvim_open_win(state.buffer, true, {
    relative: "editor",
    width: width,
    height: height,
    row: math.max(1, math.floor((vim.o.lines - height) / 2)),
    col: math.max(1, math.floor((vim.o.columns - width) / 2)),
    style: "minimal",
    border: "rounded",
    title: "  ♪  PLAYER  ",
    title_pos: "center",
  });
  vim.wo[state.window].wrap = true;
  vim.wo[state.window].winhighlight = "Normal:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow";
  vim.wo[state.window].cursorline = false;
  const buffer = state.buffer;
  vim.keymap.set(
    "n",
    "q",
    (): void => {
      actions().close_lyrics();
    },
    { buffer: buffer, silent: true, desc: "Close karaoke lyrics" },
  );
  vim.keymap.set(
    "n",
    "<Esc>",
    (): void => {
      actions().close_lyrics();
    },
    { buffer: buffer, silent: true },
  );
  vim.keymap.set(
    "n",
    "t",
    (): void => {
      actions().translate_lyrics();
    },
    { buffer: buffer, silent: true, desc: "Translate lyrics" },
  );
  vim.keymap.set(
    "n",
    "f",
    (): void => {
      actions().toggle_follow();
    },
    { buffer: buffer, silent: true, desc: "Toggle lyric follow" },
  );
  state.timer = vim.uv.new_timer();
  state.timer.start(state.timer, 0, options().lyric.interval, (): void => {
    mpv.property("time-pos", (value: unknown): void => {
      if (typeof value === "number") {
        update(value);
      }
    });
  });
  state.observers[state.observers.length] = mpv.observe("time-pos", (value: unknown): void => {
    if (typeof value === "number") {
      update(value);
    }
  });
}

function isValidIsrc(value: string): boolean {
  return string.match(value, "^[A-Z][A-Z][A-Z0-9][A-Z0-9][A-Z0-9]%d%d%d%d%d%d%d$") !== undefined;
}

/** Download the TTML of an ISRC with curl, used when Node.js is missing. */
function fetchTtmlWithCurl(isrc: string, callback: TtmlCallback): void {
  const url = "https://lrc.red/s/" + isrc + ".ttml";
  vim.system(
    ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "20", url],
    { text: true },
    (result: VimSystemResult): void => {
      vim.schedule((): void => {
        if (result.code !== 0) {
          callback(undefined, result.stderr !== "" ? result.stderr : "Could not fetch TTML from lrc.red.");
          return;
        }
        const rows = parseTtml(result.stdout);
        if (rows.length === 0) {
          callback(undefined, "The TTML document contained no timed lyric lines.");
          return;
        }
        callback(rows);
      });
    },
  );
}

/** Fetch the lyrics of an ISRC and show them. */
export function show(isrc?: string): void {
  const load = (value: string): void => {
    const normalized = string.gsub(string.upper(value), "%s+", "");
    if (!isValidIsrc(normalized)) {
      notify("Enter a valid 12 character ISRC (for example, GBUM71029604).", vim.log.levels.ERROR);
      return;
    }
    const ttmlArgs: string[] = ["ttml", normalized];
    helperCall(
      ttmlArgs,
      undefined,
      (value: unknown, error?: string): void => {
        if (value === undefined || value === null) {
          notify("Lyrics: " + tostring(error), vim.log.levels.WARN);
          return;
        }
        const rows = toLyricLines(value);
        if (rows.length === 0) {
          notify("No timed lines found for that ISRC.", vim.log.levels.WARN);
          return;
        }
        open(rows, { title: "ISRC " + normalized, artist: "", album: "" }, "lrc.red · TTML");
      },
      undefined,
      30000,
    );
  };
  if (isrc !== undefined && isrc !== "") {
    load(isrc);
    return;
  }
  mpv.property("metadata/by-key/ISRC", (value: unknown): void => {
    if (typeof value === "string" && value !== "") {
      load(value);
      return;
    }
    vim.ui.input({ prompt: "ISRC for lrc.red TTML lyrics: " }, (answer?: string): void => {
      if (answer !== undefined && answer !== "") {
        load(answer);
      }
    });
  });
}

function toCandidates(value: unknown): Record<string, unknown>[] {
  if (type(value) !== "table") {
    return [];
  }
  const list: Record<string, unknown>[] = [];
  const source = value as Record<string, unknown>[];
  for (let index = 0; index < source.length; index += 1) {
    const entry = source[index];
    if (type(entry) === "table") {
      list[list.length] = entry;
    }
  }
  return list;
}

function candidateLabel(candidate: Record<string, unknown>): string {
  const provider = typeof candidate.provider === "string" ? candidate.provider : "?";
  const title = typeof candidate.title === "string" ? candidate.title : "Unknown title";
  const artist = typeof candidate.artist === "string" ? candidate.artist : "";
  const album = typeof candidate.album === "string" ? candidate.album : "";
  const isrc = typeof candidate.isrc === "string" ? candidate.isrc : "";
  const detail = artist + (album === "" ? "" : " · " + album);
  return (
    "[" +
    provider +
    "] " +
    title +
    (detail === "" ? "" : " — " + detail) +
    (isrc === "" ? "" : "  ·  " + isrc)
  );
}

function searchEnvironment(): Record<string, string> {
  return { PLAYER_JIOSAAVN_API: options().jiosaavn_api };
}

/** Search the lyric catalogs and show the lyrics of the selected result. */
export function search(query?: string): void {
  const run = (term: string): void => {
    const searchArgs: string[] = ["search", term];
    helperCall(
      searchArgs,
      undefined,
      (value: unknown, error?: string): void => {
        if (value === undefined || value === null) {
          notify("Lyrics search: " + tostring(error), vim.log.levels.ERROR);
          return;
        }
        const candidates = toCandidates(value);
        const choices: Record<string, unknown>[] = [];
        for (let index = 0; index < candidates.length; index += 1) {
          if (candidates[index].hasLyrics !== false) {
            choices[choices.length] = candidates[index];
          }
        }
        if (choices.length === 0) {
          notify("No lyric matches found.", vim.log.levels.WARN);
          return;
        }
        vim.ui.select(
          choices,
          {
            prompt: "Lyrics search · LRCLIB + MusicBrainz + iTunes + JioSaavn",
            format_item: (item: unknown): string => {
              return candidateLabel(item as Record<string, unknown>);
            },
          },
          (item: unknown): void => {
            if (item === undefined || item === null) {
              return;
            }
            const candidate = item as Record<string, unknown>;
            const lyricsArgs: string[] = ["lyrics"];
            helperCall(
              lyricsArgs,
              vim.json.encode(candidate),
              (result: unknown, failure?: string): void => {
                if (result === undefined || result === null) {
                  notify("Lyrics: " + tostring(failure), vim.log.levels.WARN);
                  return;
                }
                const payload = result as Record<string, unknown>;
                const rows = toLyricLines(payload.lines);
                if (rows.length === 0) {
                  notify("No lyrics are available for that result.", vim.log.levels.WARN);
                  return;
                }
                const resolved = (payload.candidate ?? candidate) as Record<string, unknown>;
                open(
                  rows,
                  {
                    title: typeof resolved.title === "string" ? resolved.title : "Lyrics",
                    artist: typeof resolved.artist === "string" ? resolved.artist : "",
                    album: typeof resolved.album === "string" ? resolved.album : "",
                  },
                  typeof payload.source === "string" ? payload.source : "Lyrics",
                );
              },
              searchEnvironment(),
              30000,
            );
          },
        );
      },
      searchEnvironment(),
      30000,
    );
  };
  if (query !== undefined && query !== "") {
    run(query);
    return;
  }
  vim.ui.input({ prompt: "Search lyrics by song, artist, or phrase: " }, (answer?: string): void => {
    if (answer !== undefined && answer !== "") {
      run(answer);
    }
  });
}

/**
 * Look the JioSaavn catalog up.
 *
 * The callback receives the songs of the catalog; it is used by the search of
 * the player and by the `:PlayerJioSaavn` command.
 */
export function jiosaavnCandidates(query: string, callback: CandidatesCallback): void {
  const jioArgs: string[] = ["search", query];
  helperCall(
    jioArgs,
    undefined,
    (value: unknown, error?: string): void => {
      if (value === undefined || value === null) {
        callback([], error === undefined ? "The JioSaavn catalog could not be reached." : error);
        return;
      }
      const candidates = toCandidates(value);
      const songs: Record<string, unknown>[] = [];
      for (let index = 0; index < candidates.length; index += 1) {
        if (candidates[index].provider === "JioSaavn") {
          songs[songs.length] = candidates[index];
        }
      }
      callback(songs);
    },
    searchEnvironment(),
    30000,
  );
}

/** Search the JioSaavn catalog and play the selected song. */
export function searchJioSaavn(query?: string): void {
  const run = (term: string): void => {
    jiosaavnCandidates(
      term,
      (songs: Record<string, unknown>[], error?: string): void => {
        if (error !== undefined) {
          notify("JioSaavn search: " + tostring(error), vim.log.levels.ERROR);
          return;
        }
        if (songs.length === 0) {
          notify("No JioSaavn songs found.", vim.log.levels.WARN);
          return;
        }
        vim.ui.select(
          songs,
          {
            prompt: "JioSaavn · unofficial catalog search",
            format_item: (item: unknown): string => {
              const candidate = item as Record<string, unknown>;
              const title = typeof candidate.title === "string" ? candidate.title : "Unknown title";
              const artist = typeof candidate.artist === "string" ? candidate.artist : "";
              const language = typeof candidate.language === "string" ? candidate.language : "";
              return title + (artist === "" ? "" : " — " + artist) + (language === "" ? "" : " · " + language);
            },
          },
          (item: unknown): void => {
            if (item === undefined || item === null) {
              return;
            }
            const candidate = item as Record<string, unknown>;
            const url = candidate.url;
            if (typeof url === "string" && url !== "") {
              actions().play_url(url);
            } else {
              notify("That result has no playable link.", vim.log.levels.WARN);
            }
          },
        );
      },
    );
  };
  if (query !== undefined && query !== "") {
    run(query);
    return;
  }
  vim.ui.input({ prompt: "Search JioSaavn: " }, (answer?: string): void => {
    if (answer !== undefined && answer !== "") {
      run(answer);
    }
  });
}

/** Translate the lyrics that are currently open. */
export function translate(target?: string): void {
  if (state.rows.length === 0) {
    notify("Open lyrics before translating.", vim.log.levels.WARN);
    return;
  }
  const run = (language: string): void => {
    const translator = options().translator;
    const payload: unknown[] = [];
    for (let index = 0; index < state.rows.length; index += 1) {
      const row = state.rows[index];
      payload[payload.length] = { start: row.start, finish: row.finish, text: row.text };
    }
    const translateArgs: string[] = ["translate", language, translator.source];
    helperCall(
      translateArgs,
      vim.json.encode(payload),
      (value: unknown, error?: string): void => {
        if (value === undefined || value === null) {
          notify("Translation: " + tostring(error), vim.log.levels.ERROR);
          return;
        }
        if (type(value) !== "table") {
          notify("Translation: unexpected helper response.", vim.log.levels.ERROR);
          return;
        }
        const translations = value as string[];
        if (translations.length !== state.rows.length) {
          notify("The translation does not match the lyric lines and was discarded.", vim.log.levels.WARN);
          return;
        }
        for (let index = 0; index < state.rows.length; index += 1) {
          const text = translations[index];
          state.rows[index].translation = typeof text === "string" ? text : "";
        }
        state.previous = -1;
        render();
        update(state.position);
        notify("Lyrics translated to " + language + ".");
      },
      { PLAYER_TRANSLATE_URL: translator.url, PLAYER_TRANSLATE_API_KEY: translator.api_key },
      90000,
    );
  };
  if (target !== undefined && target !== "") {
    run(target);
    return;
  }
  vim.ui.input(
    { prompt: "Target language code (e.g. en, vi, hi, ja): ", default: "en" },
    (answer?: string): void => {
      if (answer !== undefined && answer !== "") {
        run(answer);
      }
    },
  );
}

/** Close the lyric viewer. */
export function close(): void {
  stopTimer();
  stopObservers();
  if (state.window !== 0 && vim.api.nvim_win_is_valid(state.window)) {
    vim.api.nvim_win_close(state.window, true);
  }
  state.window = 0;
  state.buffer = 0;
  state.rows = [];
  state.displayRows = [];
}

/** True when the lyric viewer is open. */
export function isOpen(): boolean {
  return state.window !== 0 && vim.api.nvim_win_is_valid(state.window);
}

/** Parse an LRC document, exposed for the tests. */
export function lyricsFromLrc(lrc: string): LyricLine[] {
  return parseLrc(lrc);
}
