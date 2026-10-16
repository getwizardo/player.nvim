import { helperScript } from "./helper";
import { options } from "./config";
import { describe } from "./mpv";

/**
 * The `:checkhealth player` implementation.
 *
 * It reports what is installed, what is missing and how the player is
 * configured, so that a broken setup can be diagnosed without reading the
 * documentation.
 */

/** Run the health checks. */
export function check(): void {
  const settings = options();
  vim.health.start("player.nvim");

  if (vim.fn.executable(settings.mpv) === 1) {
    vim.health.ok("mpv is installed: " + settings.mpv);
  } else {
    vim.health.error("mpv was not found. Install mpv or set `mpv` in the plugin options.");
  }

  if (vim.fn.executable(settings.yt_dlp) === 1) {
    vim.health.ok("yt-dlp is installed: " + settings.yt_dlp);
  } else {
    vim.health.warn("yt-dlp was not found. Search and download need yt-dlp.");
  }

  if (vim.fn.executable(settings.node) === 1) {
    vim.health.ok("Node.js is installed: " + settings.node);
  } else {
    vim.health.warn("Node.js was not found. Lyric search and translation need Node.js.");
  }

  if (vim.fn.filereadable(helperScript()) === 1) {
    vim.health.ok("The lyrics helper is compiled: " + helperScript());
  } else {
    vim.health.error("The lyrics helper is missing. Run `npm ci && npm run build` in the plugin directory.");
  }

  if (vim.fn.executable("ffmpeg") === 1) {
    vim.health.ok("ffmpeg is installed, the equalizer and the spectrum should work.");
  } else {
    vim.health.warn("ffmpeg was not found. The equalizer, the filters and the spectrum need it.");
  }

  if (settings.translator.url === "" || string.find(settings.translator.url, "^https?://") === undefined) {
    vim.health.warn("The translator URL is not an http(s) URL: " + settings.translator.url);
  } else {
    vim.health.ok("The translator endpoint is " + settings.translator.url);
  }

  if (vim.fn.executable("fd") === 1) {
    vim.health.ok("fd is installed, the local file picker uses it.");
  } else {
    vim.health.info("fd was not found, the local file picker falls back to `find`.");
  }

  const cache = vim.fn.stdpath("cache") + "/player.nvim";
  if (vim.fn.isdirectory(cache) === 1) {
    vim.health.ok("The mpv socket directory exists: " + cache);
  } else {
    vim.health.warn("The mpv socket directory " + cache + " does not exist yet; it is created when mpv starts.");
  }

  vim.health.info("The lyric services are LRCLIB, MusicBrainz, iTunes and lrc.red for the TTML documents.");
  vim.health.info("The mpv process is " + describe() + ".");
}
