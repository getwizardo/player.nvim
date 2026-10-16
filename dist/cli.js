import { fetchTtml } from "./lrc-red.js";
import { getLyrics } from "./lyrics-service.js";
import { searchLyrics } from "./search.js";
import { translateLines } from "./translator.js";
export async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === "search") {
        process.stdout.write(`${JSON.stringify(await searchLyrics(args.join(" ")))}\n`);
        return;
    }
    if (command === "lyrics") {
        const [candidateJson] = args;
        if (!candidateJson)
            throw new Error("Usage: player-lyrics lyrics '<candidate-json>'");
        const candidate = JSON.parse(candidateJson);
        process.stdout.write(`${JSON.stringify(await getLyrics(candidate))}\n`);
        return;
    }
    if (command === "translate") {
        const [target, source = "auto"] = args;
        if (!target)
            throw new Error("Usage: player-lyrics translate <target-language> [source-language]");
        let input = "";
        for await (const chunk of process.stdin)
            input += chunk;
        const lines = JSON.parse(input);
        process.stdout.write(`${JSON.stringify(await translateLines(lines, target, source))}\n`);
        return;
    }
    const isrc = command === "ttml" ? args[0] : command;
    if (!isrc)
        throw new Error("Usage: player-lyrics ttml <ISRC> | search <query> | lyrics <candidate-json> | translate <target>");
    process.stdout.write(`${JSON.stringify(await fetchTtml(isrc))}\n`);
}
