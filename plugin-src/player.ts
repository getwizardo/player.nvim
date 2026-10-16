/**
 * Entry point for Neovim's `plugin/` directory.
 *
 * This file is the only Lua file in the repository that is not generated, and
 * even it is generated: `npm run build` compiles `plugin-src/player.ts` into
 * `plugin/player.lua`. Edit the TypeScript, never the Lua.
 *
 * It does one thing: register the `:Player*` commands. Nothing else is loaded
 * until a command actually runs, so the plugin costs almost nothing at startup.
 */

/** The subset of `player.commands` this file needs. */
/** @noSelf */
interface PlayerCommands {
  register: () => void;
}

const commands = require("player.commands") as unknown as PlayerCommands;
commands.register();

/**
 * Make this file an ES module. Without an export TypeScript treats it as a
 * global script, and tstl then emits `commands = require(...)` — leaking a
 * global into every Neovim session that loads the plugin.
 */
export {};
