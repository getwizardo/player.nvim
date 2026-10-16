import type { PlayerApi } from "player/api";

/**
 * The `:Player*` commands.
 *
 * The file is compiled to `plugin/player.lua` and sourced by Neovim, which
 * registers every command of the plugin.
 *
 * The player module itself is loaded when a command runs: the commands are
 * registered right away, but the plugin stays lazy until it is used.
 */

/** The name of the player module, kept in a variable so that it is not rewritten. */
const moduleName = "player";

/** Load the player module. */
function playerModule(): PlayerApi {
  return require(moduleName) as PlayerApi;
}

/** Register every command of the plugin. */
function register(): void {
  vim.api.nvim_create_user_command(
    "Player",
    (opts) => {
      playerModule().open(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "?", desc: "Open the player dashboard or play a source" },
  );

  vim.api.nvim_create_user_command(
    "PlayerPlay",
    (opts) => {
      if (opts.args === "") {
        playerModule().pickLocal();
      } else {
        playerModule().play(opts.args);
      }
    },
    { nargs: "?", complete: "file", desc: "Play a local file or a streaming URL" },
  );

  vim.api.nvim_create_user_command(
    "PlayerPause",
    () => {
      playerModule().pause();
    },
    { desc: "Toggle playback" },
  );

  vim.api.nvim_create_user_command(
    "PlayerStop",
    () => {
      playerModule().stop();
    },
    { desc: "Stop playback" },
  );

  vim.api.nvim_create_user_command(
    "PlayerNext",
    () => {
      playerModule().next();
    },
    { desc: "Play the next queued track" },
  );

  vim.api.nvim_create_user_command(
    "PlayerPrev",
    () => {
      playerModule().previous();
    },
    { desc: "Play the previous queued track" },
  );

  vim.api.nvim_create_user_command(
    "PlayerSeek",
    (opts) => {
      if (opts.args === "") {
        playerModule().seek(0);
        return;
      }
      const seconds = tonumber(opts.args);
      if (seconds === undefined) {
        vim.notify("The seek command expects a number of seconds.", vim.log.levels.ERROR, { title: "player.nvim" });
        return;
      }
      playerModule().seek(seconds);
    },
    { nargs: "?", desc: "Seek to a position in seconds" },
  );

  vim.api.nvim_create_user_command(
    "PlayerVolume",
    (opts) => {
      if (opts.args === "") {
        playerModule().status();
        return;
      }
      const delta = tonumber(opts.args);
      if (delta === undefined) {
        vim.notify("The volume command expects a number of steps.", vim.log.levels.ERROR, { title: "player.nvim" });
        return;
      }
      playerModule().volume(delta);
    },
    { nargs: "?", desc: "Change the volume by a number of steps" },
  );

  vim.api.nvim_create_user_command(
    "PlayerQueue",
    () => {
      playerModule().pickLocal(true);
    },
    { desc: "Pick a local file and add it to the queue" },
  );

  vim.api.nvim_create_user_command(
    "PlayerQueueAdd",
    (opts) => {
      if (opts.args === "") {
        playerModule().pickLocal(true);
      } else {
        playerModule().queueAdd(opts.args);
      }
    },
    { nargs: "?", complete: "file", desc: "Add a file or URL to the queue" },
  );

  vim.api.nvim_create_user_command(
    "PlayerQueueList",
    () => {
      playerModule().queueList();
    },
    { desc: "Browse the queue and play a track" },
  );

  vim.api.nvim_create_user_command(
    "PlayerQueueClear",
    () => {
      playerModule().queueClear();
    },
    { desc: "Stop playback and clear the queue" },
  );

  vim.api.nvim_create_user_command(
    "PlayerQueueRemove",
    (opts) => {
      const index = tonumber(opts.args);
      if (index === undefined) {
        vim.notify("The command expects the position of a track in the queue.", vim.log.levels.ERROR, {
          title: "player.nvim",
        });
        return;
      }
      playerModule().queueRemove(index - 1);
    },
    { nargs: "?", desc: "Remove a track from the queue" },
  );

  vim.api.nvim_create_user_command(
    "PlayerShuffle",
    (opts) => {
      if (opts.args === "on") {
        playerModule().toggleShuffle(true);
      } else if (opts.args === "off") {
        playerModule().toggleShuffle(false);
      } else if (opts.args === "") {
        playerModule().toggleShuffle();
      } else {
        vim.notify("Use :PlayerShuffle [on|off]", vim.log.levels.ERROR, { title: "player.nvim" });
      }
    },
    {
      nargs: "?",
      complete: () => {
        return ["on", "off"];
      },
      desc: "Toggle the queue shuffle",
    },
  );

  vim.api.nvim_create_user_command(
    "PlayerRepeat",
    (opts) => {
      playerModule().cycleRepeat(opts.args !== "" ? opts.args : undefined);
    },
    {
      nargs: "?",
      complete: () => {
        return ["off", "queue", "track"];
      },
      desc: "Cycle or set the repeat mode",
    },
  );

  vim.api.nvim_create_user_command(
    "PlayerSearch",
    (opts) => {
      playerModule().search(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "*", desc: "Search the track services with yt-dlp and the JioSaavn catalog" },
  );

  vim.api.nvim_create_user_command(
    "PlayerDownload",
    (opts) => {
      playerModule().download(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "?", desc: "Download audio with yt-dlp" },
  );

  vim.api.nvim_create_user_command(
    "PlayerEQ",
    (opts) => {
      playerModule().eq(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "?", desc: "Configure the player equalizer" },
  );

  vim.api.nvim_create_user_command(
    "PlayerFilter",
    (opts) => {
      playerModule().filter(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "?", desc: "Configure the audio filter" },
  );

  vim.api.nvim_create_user_command(
    "PlayerLyrics",
    (opts) => {
      playerModule().showLyrics(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "?", desc: "Fetch the lyrics from lrc.red by ISRC" },
  );

  vim.api.nvim_create_user_command(
    "PlayerLyricsSearch",
    (opts) => {
      playerModule().searchLyrics(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "*", desc: "Search the lyrics on LRCLIB, MusicBrainz and the JioSaavn catalog" },
  );

  vim.api.nvim_create_user_command(
    "PlayerTranslate",
    (opts) => {
      playerModule().translateLyrics(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "?", desc: "Translate the open karaoke lyrics" },
  );

  vim.api.nvim_create_user_command(
    "PlayerJioSaavn",
    (opts) => {
      playerModule().searchJioSaavn(opts.args !== "" ? opts.args : undefined);
    },
    { nargs: "*", desc: "Search and play JioSaavn results" },
  );

  vim.api.nvim_create_user_command(
    "PlayerVisualize",
    () => {
      playerModule().visualize();
    },
    { desc: "Toggle the live audio spectrum window of mpv" },
  );

  vim.api.nvim_create_user_command(
    "PlayerStatus",
    () => {
      playerModule().status();
    },
    { desc: "Show the player status" },
  );

  vim.api.nvim_create_user_command(
    "PlayerQuit",
    () => {
      playerModule().shutdown();
    },
    { desc: "Stop the mpv process" },
  );

  vim.api.nvim_create_autocmd("VimLeavePre", {
    group: vim.api.nvim_create_augroup("player_nvim_lifecycle", { clear: true }),
    callback: () => {
      playerModule().shutdown();
    },
  });
}

if (vim.g.loaded_player_nvim !== true) {
  vim.g.loaded_player_nvim = true;
  register();
}
