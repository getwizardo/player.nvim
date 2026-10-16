import { fetchTtml } from "./lrc-red.js";
import { getLyrics } from "./lyrics-service.js";
import { searchLyrics } from "./search.js";
import { translateLines } from "./translator.js";
/**
 * The command line interface of the helper.
 *
 * The plugin calls the helper with one of these verbs:
 *
 *   ttml <ISRC>              the TTML of a recording
 *   search <query>           the candidates of the lyric services
 *   lyrics <candidate-json>  the lyrics of a candidate
 *   translate <target>       the translation of the lines on stdin
 */
/** Read everything that is written on stdin. */
export async function readStdin() {
    let input = "";
    for await (const chunk of process.stdin) {
        input += chunk;
    }
    return input;
}
/** Parse a JSON document and report a readable error. */
export function parseJson(text, what) {
    try {
        return JSON.parse(text);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`The ${what} is not valid JSON: ${reason}`);
    }
}
/** The usage of the helper. */
export const USAGE = "Usage: lyrics.js ttml <ISRC> | search <query> | lyrics <candidate-json> | translate <target> [source]";
/** Run the helper. */
export async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === "search") {
        const query = args.join(" ").trim();
        if (!query) {
            throw new Error(USAGE);
        }
        process.stdout.write(`${JSON.stringify(await searchLyrics(query))}\n`);
        return;
    }
    if (command === "lyrics") {
        // The candidate is read from stdin, the argument is only a fallback.
        const stdin = await readStdin();
        const payload = stdin.trim() || args.join(" ").trim();
        if (!payload) {
            throw new Error(USAGE);
        }
        const candidate = parseJson(payload, "candidate");
        if (!candidate || typeof candidate !== "object") {
            throw new Error("The candidate is not a JSON object.");
        }
        process.stdout.write(`${JSON.stringify(await getLyrics(candidate))}\n`);
        return;
    }
    if (command === "translate") {
        const [target, source = "auto"] = args;
        if (!target) {
            throw new Error("Usage: lyrics.js translate <target-language> [source-language]");
        }
        const input = await readStdin();
        const lines = parseJson(input, "lyric list");
        if (!Array.isArray(lines)) {
            throw new Error("The lyric list is not a JSON array.");
        }
        const translations = await translateLines(lines.map((line) => line.text), target, source);
        process.stdout.write(`${JSON.stringify(translations)}\n`);
        return;
    }
    const isrc = command === "ttml" ? args[0] : command;
    if (!isrc) {
        throw new Error(USAGE);
    }
    process.stdout.write(`${JSON.stringify(await fetchTtml(isrc))}\n`);
}
