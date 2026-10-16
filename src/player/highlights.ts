/**
 * Shared highlight groups: a dark, Apple-Music-flavoured palette that keeps
 * `default = true` so a user's colourscheme can still override it.
 */

export function define(): void {
  const set = (name: string, definition: NvimHighlightDefinition): void =>
    vim.api.nvim_set_hl(0, name, { ...definition, default: true });
  set("PlayerSurface", { bg: "#17151d", fg: "#eeeaf2" });
  set("PlayerBorder", { fg: "#d85c86", bg: "#17151d" });
  set("PlayerEyebrow", { fg: "#e58ca5", bold: true });
  set("PlayerTitle", { fg: "#fff7fb", bold: true });
  set("PlayerMuted", { fg: "#aaa1b2" });
  set("PlayerAccent", { fg: "#ff739b", bold: true });
  set("PlayerBar", { fg: "#b85e85" });
  set("PlayerLyricActive", { fg: "#fff7fb", bold: true });
  set("PlayerLyricInactive", { fg: "#8d8496" });
  set("PlayerTimestamp", { fg: "#7c7385" });
  set("PlayerKaraokeWord", { fg: "#ff7ba4", bold: true, underline: true });
  set("PlayerKaraokeSung", { fg: "#c9a7b6" });
  set("PlayerTranslation", { fg: "#9d94a6", italic: true });
  set("PlayerSection", { fg: "#e58ca5", bold: true });
}

/** Window-local highlight remap used by every float. */
export function floatHighlights(): string {
  return "Normal:PlayerSurface,NormalFloat:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow";
}
