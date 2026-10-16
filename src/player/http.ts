/**
 * HTTP over `curl` (with a `wget` fallback) driven by `vim.system`.
 *
 * Neovim has no built-in TLS client, so the plugin shells out instead of
 * requiring Node.js. Every request is async and reports its own error string,
 * which is what makes provider failures diagnosable from the editor.
 */

import { get as getOptions } from "./config";
import { findPattern, notify, replace, splitLines, sub, trim } from "./util";

export const USER_AGENT = "player.nvim/1.0 (https://github.com/getwizardo/player.nvim)";

export interface HttpResponse {
  status: number;
  body: string;
}

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  body?: string;
  /** `GET` by default; `POST` is inferred when `body` is set. */
  method?: string;
}

export type ResponseCallback = (response: HttpResponse | undefined, error?: string) => void;

let cachedClient: string | undefined;

/** The first available HTTP client, or `undefined` when neither exists. */
export function client(): string | undefined {
  if (cachedClient !== undefined) return cachedClient;
  const preferred = getOptions().http;
  if (preferred !== "" && vim.fn.executable(preferred) === 1) {
    cachedClient = preferred;
    return cachedClient;
  }
  for (const candidate of ["curl", "wget"]) {
    if (vim.fn.executable(candidate) === 1) {
      cachedClient = candidate;
      return cachedClient;
    }
  }
  return undefined;
}

function curlArgs(url: string, options: RequestOptions): string[] {
  const args = [
    "curl",
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    tostring(options.timeout ?? 20),
    "--request",
    options.body !== undefined ? "POST" : (options.method ?? "GET"),
    "--header",
    `user-agent: ${USER_AGENT}`,
    "--write-out",
    "\n%{http_code}",
  ];
  if (options.headers !== undefined) {
    for (const key in options.headers) args.push("--header", `${key}: ${options.headers[key]}`);
  }
  if (options.body !== undefined) args.push("--data", options.body);
  args.push(url);
  return args;
}

function wgetArgs(url: string, options: RequestOptions): string[] {
  const args = [
    "wget",
    "--quiet",
    "--tries=1",
    `--timeout=${tostring(options.timeout ?? 20)}`,
    "--header=user-agent: " + USER_AGENT,
    "--output-document=-",
  ];
  if (options.headers !== undefined) {
    for (const key in options.headers) args.push(`--header=${key}: ${options.headers[key]}`);
  }
  if (options.body !== undefined) {
    args.push(`--header=content-type: application/json`, "--post-data=" + options.body);
  }
  args.push(url);
  return args;
}

/** curl appends `\n%{http_code}` after the body: split the status back off. */
function splitStatus(stdout: string): HttpResponse {
  const boundary = findPattern(stdout, "\n[^\n]*$");
  if (boundary === undefined) return { status: 200, body: stdout };
  const body = sub(stdout, 1, boundary - 1);
  const status = tonumber(replace(sub(stdout, boundary + 1), "%s+", "")) ?? 0;
  return { status, body };
}

export function request(url: string, options: RequestOptions | undefined, callback: ResponseCallback): void {
  const opts = options ?? {};
  const tool = client();
  if (tool === undefined) {
    callback(undefined, "No HTTP client found. Install curl (or wget) so player.nvim can reach lyric and search services.");
    return;
  }
  const command = tool === "wget" ? wgetArgs(url, opts) : curlArgs(url, opts);
  command[0] = tool;
  vim.system(command, { text: true, timeout: ((opts.timeout ?? 20) + 5) * 1000 }, (result) => {
    vim.schedule(() => {
      if (result.code !== 0) {
        const stderr = trim(result.stderr ?? "");
        const detail = splitLines(stderr)[0] ?? `exit code ${result.code}`;
        callback(undefined, `${tool} failed for ${url} (${detail})`);
        return;
      }
      const stdout = result.stdout ?? "";
      if (tool === "wget") {
        callback({ status: 200, body: stdout });
        return;
      }
      callback(splitStatus(stdout));
    });
  });
}

function describe(url: string, status: number): string {
  if (status === 404) return `nothing found at ${url} (404)`;
  if (status === 429) return `rate limited by ${url} (429), try again shortly`;
  return `${url} returned HTTP ${status}`;
}

export interface TransferOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

/** GET a URL and decode JSON, reporting either the value or an error message. */
export function getJson<T>(url: string, options: TransferOptions | undefined, callback: (data: T | undefined, error?: string) => void): void {
  request(url, { timeout: options?.timeout, headers: { accept: "application/json", ...(options?.headers ?? {}) } }, (response, error) => {
    if (response === undefined) {
      callback(undefined, error);
      return;
    }
    if (response.status < 200 || response.status >= 300) {
      callback(undefined, describe(url, response.status));
      return;
    }
    const result = pcall(() => vim.json.decode(response.body)) as unknown as [boolean, unknown];
    const ok = result[0];
    const decoded = result[1];
    if (!ok) {
      callback(undefined, `Could not decode JSON from ${url}`);
      return;
    }
    callback(decoded as T);
  });
}

/** GET a URL and hand back the raw text body (TTML, LRC, ...). */
export function getText(url: string, options: TransferOptions | undefined, callback: (text: string | undefined, error?: string) => void): void {
  request(url, { timeout: options?.timeout, headers: options?.headers }, (response, error) => {
    if (response === undefined) {
      callback(undefined, error);
      return;
    }
    if (response.status < 200 || response.status >= 300) {
      callback(undefined, describe(url, response.status));
      return;
    }
    callback(response.body);
  });
}

/** POST a JSON document and decode the JSON reply. */
export function postJson<T>(url: string, body: unknown, options: TransferOptions | undefined, callback: (data: T | undefined, error?: string) => void): void {
  const payload = vim.json.encode(body);
  request(url, { body: payload, timeout: options?.timeout, headers: { accept: "application/json", "content-type": "application/json", ...(options?.headers ?? {}) } }, (response, error) => {
    if (response === undefined) {
      callback(undefined, error);
      return;
    }
    if (response.status < 200 || response.status >= 300) {
      callback(undefined, describe(url, response.status));
      return;
    }
    const result = pcall(() => vim.json.decode(response.body)) as unknown as [boolean, unknown];
    const ok = result[0];
    const decoded = result[1];
    if (!ok) {
      callback(undefined, `Could not decode JSON from ${url}`);
      return;
    }
    callback(decoded as T);
  });
}

/** One-shot health check used by `:PlayerDoctor`. */
export function check(callback: (summary: string[]) => void): void {
  const summary: string[] = [];
  const tool = client();
  if (tool === undefined) {
    summary.push("http: no curl or wget on PATH");
    callback(summary);
    return;
  }
  summary.push(`http: using ${tool}`);
  getText("https://lrc.red/docs", { timeout: 10 }, (text, error) => {
    summary.push(error !== undefined ? `lrc.red: ${error}` : `lrc.red: reachable (${(text ?? "").length} bytes)`);
    request("https://lrclib.net/api/search?q=player", { timeout: 10, headers: { accept: "application/json" } }, (response, err) => {
      summary.push(err !== undefined ? `lrclib: ${err}` : `lrclib: HTTP ${response?.status ?? 0}`);
      notify(summary.join("\n"));
      callback(summary);
    });
  });
}
