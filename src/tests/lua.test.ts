import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { HARNESS_LUA, parseHarnessOutput } from "./lua-harness.js";

/** The interpreters that are tried, in order. */
const INTERPRETERS = [process.env.LUAJIT, process.env.LUA, "luajit", "lua5.1", "lua"].filter(
  (value): value is string => typeof value === "string" && value !== "",
);

/** Walk up from the compiled test until the repository root is found. */
function findRoot(): string {
  let current = dirname(new URL(import.meta.url).pathname);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, "package.json"))) {
      return current;
    }
    current = dirname(current);
  }
  return process.cwd();
}

/** The root of the repository. */
const ROOT = findRoot();

/** Find a Lua interpreter, or undefined when there is none. */
function findInterpreter(): string | undefined {
  for (const candidate of INTERPRETERS) {
    const probe = spawnSync(candidate, ["-v"], { encoding: "utf8" });
    if (probe.status === 0 || probe.status === 1) {
      return candidate;
    }
  }
  return undefined;
}

/** Every generated Lua file of the plugin. */
function generatedFiles(): string[] {
  const files: string[] = [];
  const luaDirectory = join(ROOT, "lua", "player");
  if (existsSync(luaDirectory)) {
    for (const name of readdirSync(luaDirectory)) {
      if (name.endsWith(".lua")) {
        files.push(join(luaDirectory, name));
      }
    }
  }
  const pluginFile = join(ROOT, "plugin", "player.lua");
  if (existsSync(pluginFile)) {
    files.push(pluginFile);
  }
  return files;
}

test("the generated Lua passes the harness", { skip: findInterpreter() === undefined ? "no Lua interpreter" : false }, () => {
  const interpreter = findInterpreter();
  assert.ok(interpreter, "a Lua interpreter is available");

  const directory = mkdtempSync(join(tmpdir(), "player-lua-"));
  const script = join(directory, "harness.lua");
  writeFileSync(script, HARNESS_LUA, "utf8");

  const result = spawnSync(interpreter, [script], {
    encoding: "utf8",
    env: { ...process.env, PLAYER_ROOT: ROOT },
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const parsed = parseHarnessOutput(output);

  assert.ok(parsed.total > 0, `the harness ran at least one test:\n${output}`);
  const failures = parsed.cases.filter((item) => !item.ok);
  assert.deepEqual(
    failures.map((item) => `${item.name}: ${item.message}`),
    [],
    `every Lua test passed:\n${output}`,
  );
  assert.equal(parsed.passed, parsed.total);
});

test("the generated Lua is committed", () => {
  const files = generatedFiles();
  assert.ok(files.length >= 14, `every module is generated (${files.length} files)`);
  assert.ok(existsSync(join(ROOT, "lua", "player", "init.lua")), "lua/player/init.lua exists");
  assert.ok(existsSync(join(ROOT, "plugin", "player.lua")), "plugin/player.lua exists");
});

test("the generated Lua does not need the TypeScript to Lua runtime", () => {
  for (const file of generatedFiles()) {
    const source = readFileSync(file, "utf8");
    assert.ok(!source.includes("lualib_bundle"), `${file} does not require the lualib bundle`);
    assert.ok(!source.includes("__TS__"), `${file} does not use the lualib helpers`);
  }
});

test("the generated Lua calls the Neovim API the right way", () => {
  const forbidden = [
    "vim:notify(",
    "vim.fn:",
    "vim.api:",
    "vim.uv:",
    "string:sub(",
    "string:gsub(",
    "string:find(",
    "table:insert(",
    "table:remove(",
    "table:concat(",
    "math:floor(",
    "os:getenv(",
  ];
  for (const file of generatedFiles()) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.ok(!source.includes(pattern), `${file} does not use "${pattern}"`);
    }
  }
});

test("the generated Lua passes the libuv handles to their methods", () => {
  // The methods of luv take the handle as their first argument; a call
  // without it silently does nothing, so the handle is checked here.
  const streamMethods = ["write", "read_start", "read_stop", "is_closing", "connect"];
  const timerMethods = ["start", "stop", "close"];
  const last = (path: string): string => {
    const parts = path.split(".");
    return parts[parts.length - 1] ?? path;
  };
  for (const file of generatedFiles()) {
    const source = readFileSync(file, "utf8");
    for (const method of streamMethods) {
      const pattern = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_.]*)\\.${method}\\(\\s*([A-Za-z_][A-Za-z0-9_.]*)`, "g");
      for (const match of source.matchAll(pattern)) {
        assert.equal(
          last(match[1]),
          last(match[2]),
          `${file}: "${match[1]}.${method}(" must pass the handle as its first argument`,
        );
      }
    }
    for (const method of timerMethods) {
      const pattern = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_.]*)\\.${method}\\(\\s*([A-Za-z_][A-Za-z0-9_.]*)`, "g");
      for (const match of source.matchAll(pattern)) {
        if (last(match[1]) !== "timer") {
          continue;
        }
        assert.equal(
          last(match[1]),
          last(match[2]),
          `${file}: "${match[1]}.${method}(" must pass the handle as its first argument`,
        );
      }
    }
  }
});

test("the generated Lua only requires the player modules", () => {
  for (const file of generatedFiles()) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/require\("([^"]+)"\)/g)) {
      const name = match[1];
      assert.ok(
        name.startsWith("player.") || name === "player",
        `${file} requires "${name}", which is not a player module`,
      );
    }
  }
});
