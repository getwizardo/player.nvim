/**
 * A local mock of the lyric and music APIs.
 *
 * The sandbox has no route to lrc.red, LRCLIB, Audius or the Internet Archive,
 * so the tests point the plugin at this server instead. Every payload here is
 * shaped from a response those services really returned, recorded by hand from
 * `curl` during development:
 *
 *   lrc.red      /search.json /match.json /s/<ISRC>.json /s/<ISRC>.ttml
 *   LRCLIB       /api/search /api/get
 *   JioSaavn     /api/search/songs            (the saavn.sumit.co wrapper)
 *   Audius       /v1/tracks/search
 *   Archive      /advancedsearch.php /metadata/<identifier>
 *   LibreTranslate  POST /translate
 *
 * `/__requests` reports what was asked for, so the tests can assert on the
 * exact URLs and headers the plugin built.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "fixtures");

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: string;
  userAgent: string;
  accept: string;
  body: string;
}

function read(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

function send(response: ServerResponse, status: number, body: string, contentType = "application/json"): void {
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

/** Requests seen since the server started (or since the last `start()`). */
const requests: RecordedRequest[] = [];

export function start(): Promise<{ base: string; port: number; requests: RecordedRequest[]; close: () => Promise<void> }> {
  requests.length = 0;
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      requests.push({
        method: request.method ?? "GET",
        url: request.url ?? "/",
        path: url.pathname,
        query: url.search,
        userAgent: (request.headers["user-agent"] as string) ?? "",
        accept: (request.headers["accept"] as string) ?? "",
        body,
      });
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      route(request, response, url, base, body);
    });
  });
  server.listen(0, "127.0.0.1");
  return new Promise((resolve) => {
    server.on("listening", () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        base: `http://127.0.0.1:${port}`,
        port,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

function route(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  base: string,
  body: string,
): void {
  const path = url.pathname;

  if (path === "/__requests") {
    send(response, 200, JSON.stringify(requests));
    return;
  }

  // --- lrc.red ---------------------------------------------------------
  if (path === "/lrc.red/search.json") {
    send(response, 200, read("lrc-red-search.json"));
    return;
  }
  if (path === "/lrc.red/match.json") {
    send(response, 200, read("lrc-red-match.json"));
    return;
  }
  const metadata = path.match(/^\/lrc\.red\/s\/([A-Z0-9]+)\.json$/);
  if (metadata) {
    send(response, 200, read("lrc-red-meta.json"));
    return;
  }
  const ttml = path.match(/^\/lrc\.red\/s\/([A-Z0-9]+)\.ttml$/);
  if (ttml) {
    send(response, 200, read("lrcred_blinding_lights.ttml"), "application/ttml+xml");
    return;
  }
  const lrc = path.match(/^\/lrc\.red\/s\/([A-Z0-9]+)\.lrc$/);
  if (lrc) {
    send(response, 200, read("lrc-red-synced.lrc"), "text/plain");
    return;
  }
  if (path === "/lrc.red/missing.json") {
    send(response, 404, '{"error":"not found"}');
    return;
  }

  // --- LRCLIB ----------------------------------------------------------
  if (path === "/lrclib.net/api/search") {
    send(response, 200, read("lrclib-search.json"));
    return;
  }
  if (path === "/lrclib.net/api/get") {
    send(response, 200, read("lrclib-get.json"));
    return;
  }
  if (path.match(/^\/lrclib\.net\/api\/get\/\d+$/)) {
    send(response, 200, read("lrclib-get.json"));
    return;
  }

  // --- JioSaavn wrapper -------------------------------------------------
  if (path === "/saavn/api/search/songs") {
    send(response, 200, read("jiosaavn-search.json"));
    return;
  }

  // --- Audius -----------------------------------------------------------
  if (path === "/audius/discover") {
    send(response, 200, JSON.stringify({ data: [`${base}/audius`], env: "prod" }));
    return;
  }
  if (path === "/audius/v1/tracks/search") {
    send(response, 200, read("audius-search.json"));
    return;
  }
  if (path.match(/^\/audius\/v1\/tracks\/[^/]+\/stream$/)) {
    send(response, 302, "", "text/plain");
    response.setHeader("location", `${base}/audius/audio.mp3`);
    return;
  }

  // --- Internet Archive -------------------------------------------------
  if (path === "/archive/advancedsearch.php") {
    send(response, 200, read("archive-search.json"));
    return;
  }
  if (path.startsWith("/archive/metadata/")) {
    send(response, 200, read("archive-metadata.json"));
    return;
  }

  // --- LibreTranslate ---------------------------------------------------
  if (path === "/translate/translate" && request.method === "POST") {
    const payload = JSON.parse(body === "" ? "{}" : body) as { q?: string; target?: string };
    const source = payload.q ?? "";
    const target = payload.target ?? "vi";
    const translated = source
      .split("\n")
      .map((line) => (line.trim() === "" ? line : `[${target}] ${line}`))
      .join("\n");
    send(response, 200, JSON.stringify({ translatedText: translated }));
    return;
  }

  send(response, 404, JSON.stringify({ error: `no fixture for ${path}` }));
}
