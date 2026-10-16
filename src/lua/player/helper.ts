import { options } from "./config";
import { attempt } from "./lua-util";

/** The callback of {@link helperCall}. */
/** @noSelf */
export interface HelperCallback {
  /** @noSelf */
  (value: unknown, error?: string): void;
}

/**
 * Bridge to the Node.js helper that ships in `dist/`.
 *
 * The helper is a plain CLI: it reads a JSON request on stdin and writes a
 * JSON response on stdout. Keeping the bridge in one place makes it easy to
 * replace the helper or to disable it.
 */

/** Absolute path of the plugin root (the directory that holds `dist/`). */
export function pluginRoot(): string {
  const info = debug.getinfo(1, "S");
  const source = info && info.source ? info.source : "";
  if (string.sub(source, 1, 1) === "@") {
    return vim.fn.fnamemodify(string.sub(source, 2), ":p:h:h:h");
  }
  return vim.fn.fnamemodify(source, ":p:h:h:h");
}

/** Absolute path of the compiled helper entry point. */
export function helperScript(): string {
  return pluginRoot() + "/dist/lyrics.js";
}

/** True when Node.js and the compiled helper are both available. */
export function helperAvailable(): boolean {
  return vim.fn.executable(options().node) === 1 && vim.fn.filereadable(helperScript()) === 1;
}

/**
 * Run the helper.
 *
 * `env` is merged into the *current* environment: replacing it wholesale would
 * drop `PATH` and the child process could not find `node` at all.
 */
export function helperCall(
  args: string[],
  stdin: string | undefined,
  callback: HelperCallback,
  env?: Record<string, string>,
  timeout?: number,
): void {
  if (!helperAvailable()) {
    callback(undefined, "Lyrics search and translation need Node.js and the compiled dist/lyrics.js helper.");
    return;
  }
  const command: string[] = [options().node, helperScript()];
  for (let index = 0; index < args.length; index += 1) {
    command[command.length] = args[index];
  }
  const systemOptions: VimSystemOptions = { text: true };
  if (stdin !== undefined) {
    systemOptions.stdin = stdin;
  }
  if (timeout !== undefined) {
    systemOptions.timeout = timeout;
  }
  if (env !== undefined) {
    const merged = vim.fn.environ();
    for (const key in env) {
      merged[key] = env[key];
    }
    systemOptions.env = merged;
  }
  vim.system(command, systemOptions, (result: VimSystemResult): void => {
    vim.schedule((): void => {
      if (result.code !== 0) {
        const message = result.stderr !== "" ? result.stderr : "The lyrics helper failed.";
        callback(undefined, message);
        return;
      }
      const decoded = attempt((): unknown => {
        return vim.json.decode(result.stdout);
      });
      if (!decoded.ok) {
        callback(undefined, "Could not decode the lyrics helper response.");
        return;
      }
      callback(decoded.value);
    });
  });
}
