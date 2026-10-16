import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { main } from "./cli.js";

export { parseLrc, parseTtml } from "./parsers.js";
export { fetchTtml } from "./lrc-red.js";
export { searchLyrics } from "./search.js";
export { getLyrics } from "./lyrics-service.js";
export { translateLines } from "./translator.js";
export type { LyricCandidate, LyricLine, LyricWord } from "./types.js";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
