import { parseTtml } from "./parsers.js";
export async function fetchTtml(isrc, timeoutMs = 20_000) {
    const normalized = isrc.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized)) {
        throw new Error("Invalid ISRC. Expected a 12-character recording code.");
    }
    const response = await fetch(`https://lrc.red/s/${encodeURIComponent(normalized)}.ttml`, {
        headers: {
            "user-agent": "player.nvim/0.2 (https://github.com/getwizardo/player.nvim)",
            accept: "application/ttml+xml, application/xml",
        },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
        throw new Error(`lrc.red returned HTTP ${response.status} for ${normalized}.`);
    const rows = parseTtml(await response.text());
    if (!rows.length)
        throw new Error("The TTML document contained no timed lyric lines.");
    return rows;
}
