/**
 * Pure formatting helpers shared by the dashboard, the queue browser and the
 * lyric viewer. They never touch the Neovim API, which keeps them easy to
 * reason about and to test.
 */

const EQ_BLOCKS: string[] = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Format a number of seconds as `m:ss` (or `h:mm:ss` for long tracks). */
export function formatClock(seconds: number): string {
  if (seconds === undefined || seconds < 0) {
    return "--:--";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return string.format("%d:%02d:%02d", hours, minutes, rest);
  }
  return string.format("%d:%02d", minutes, rest);
}

/** Format a duration the same way `formatClock` does, but always padded. */
export function formatDuration(seconds: number): string {
  if (seconds === undefined || seconds < 0) {
    return "0:00";
  }
  return formatClock(seconds);
}

/**
 * Turn a path or URL into a short label.
 *
 * Query strings and fragments are dropped, the file name is kept.
 */
export function sourceLabel(source: string): string {
  let path = source;
  const cut = string.find(path, "[?#]", 1);
  if (cut !== undefined) {
    path = string.sub(path, 1, cut - 1);
  }
  let slash = 0;
  for (let position = 1; position <= path.length; position += 1) {
    if (string.sub(path, position, position) === "/") {
      slash = position;
    }
  }
  if (slash > 0) {
    path = string.sub(path, slash + 1);
  }
  if (path === "") {
    return source;
  }
  return path;
}

/** Render the ten band equalizer as a block bar. */
export function eqCurve(bands: number[], enabled: boolean): string {
  const blocks: string[] = [];
  for (let index = 0; index < bands.length; index += 1) {
    const gain = enabled ? bands[index] : -12;
    const clamped = gain < -12 ? -12 : gain > 12 ? 12 : gain;
    let level = Math.floor((clamped + 12) / 3) + 1;
    if (level < 1) {
      level = 1;
    }
    if (level > 8) {
      level = 8;
    }
    blocks[blocks.length] = EQ_BLOCKS[level - 1];
  }
  return table.concat(blocks, "  ");
}

/** Render the progress bar of the dashboard. */
export function progressBar(position: number, duration: number, width: number): string {
  let ratio = 0;
  if (duration > 0) {
    ratio = position / duration;
    if (ratio < 0) {
      ratio = 0;
    }
    if (ratio > 1) {
      ratio = 1;
    }
  }
  const filled = Math.floor(width * ratio);
  let bar = string.rep("━", filled);
  if (filled < width) {
    bar += "●";
    bar += string.rep("─", width - filled - 1);
  }
  return bar;
}

/** Pad a string on the right so that columns line up. */
export function padRight(text: string, width: number): string {
  if (text.length >= width) {
    return text;
  }
  return text + string.rep(" ", width - text.length);
}

/** Shorten a string to `max` characters, adding an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) {
    return text;
  }
  return string.sub(text, 1, max - 1) + "…";
}

/** Escape the characters that would break a single line in the dashboard. */
export function singleLine(text: string): string {
  return string.gsub(text, "[%c\r\n]+", " ");
}
