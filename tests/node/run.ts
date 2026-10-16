/**
 * Test entry point.
 *
 * Starts the mock API server, then runs `tests/lua/run.lua` with LuaJIT so the
 * suite exercises the Lua that `tstl` generated from `src/player/**.ts`.
 *
 * LuaJIT is not an npm dependency, so `LUA_BIN` can point at an interpreter;
 * otherwise `luajit`, `lua5.1` and `lua` are tried in turn.
 */

import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

function available(binary: string): boolean {
  const probe = spawnSync(binary, ["-v"], { stdio: "ignore" });
  return probe.status === 0 || probe.status === null ? probe.error === undefined : false;
}

function luaBinary(): string {
  const configured = process.env.LUA_BIN;
  if (configured !== undefined && configured !== "") return configured;
  for (const candidate of ["luajit", "lua5.1", "lua"]) {
    if (available(candidate)) return candidate;
  }
  throw new Error(
    "No Lua 5.1 interpreter found. Install LuaJIT (`apt install luajit`) or set LUA_BIN=/path/to/luajit.",
  );
}

async function main(): Promise<void> {
  const server = await start();
  const interpreter = luaBinary();
  process.stdout.write(`mock API on ${server.base}\nrunning ${interpreter} tests/lua/run.lua\n\n`);

  const exitCode = await new Promise<number>((done) => {
    const child = spawn(interpreter, [join(root, "tests", "lua", "run.lua")], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, PLAYER_ROOT: root, PLAYER_TEST_BASE: server.base },
    });
    child.on("close", (code) => done(code ?? 1));
    child.on("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      done(1);
    });
  });

  await server.close();
  process.exit(exitCode);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
