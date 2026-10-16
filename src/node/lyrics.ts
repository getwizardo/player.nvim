import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { main } from "./cli.js";

export { parseLrc, parseTtml, plainText, tagBlocks, timing, xmlAttribute, decodeXml } from "./parsers.js";
export { fetchTtml, isValidIsrc } from "./lrc-red.js";
export { searchLyrics, dedupe } from "./search.js";
export { getLyrics, plainLines } from "./lyrics-service.js";
export { translateLines, translateLyricLines, translatorEndpoint } from "./translator.js";
export { searchJioSaavn, artistsOf, jiosaavnBase } from "./providers/jiosaavn.js";
export { searchLrclib, getLrclibRecord, lookupLrclib, toCandidate } from "./providers/lrclib.js";
export { HttpError, USER_AGENT, getJson, request } from "./http.js";
export type { LyricCandidate, LyricLine, LyricWord, LyricsAnswer, LrclibRecord } from "./types.js";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
