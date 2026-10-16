import { request } from "./http.js";
/**
 * The translation of the lyric lines.
 *
 * LibreTranslate is used; the lines are sent one by one so that the answer
 * always has the same number of entries as the request. A translation that
 * does not match the lines is discarded instead of being attached to the
 * wrong line.
 */
/** The endpoint of the translator. */
export function translatorEndpoint() {
    return (process.env.PLAYER_TRANSLATE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
}
/** Translate the lines of a song. */
export async function translateLines(lines, target, source = "auto") {
    if (!lines.length) {
        return [];
    }
    const body = {
        q: lines,
        source,
        target,
        format: "text",
    };
    if (process.env.PLAYER_TRANSLATE_API_KEY) {
        body.api_key = process.env.PLAYER_TRANSLATE_API_KEY;
    }
    const response = await request(`${translatorEndpoint()}/translate`, {
        timeout: 60_000,
        retries: 1,
    });
    if (!response.ok) {
        throw new Error(`The translator returned HTTP ${response.status}. Check PLAYER_TRANSLATE_URL and its API key.`);
    }
    const payload = (await response.json());
    const translated = payload?.translatedText;
    if (translated === undefined) {
        throw new Error("The translator answer did not contain translatedText.");
    }
    const list = Array.isArray(translated) ? translated : translated.split(/\r?\n/);
    if (list.length !== lines.length) {
        throw new Error("The translator changed the number of lyric lines; the translation was discarded to keep the karaoke timing correct.");
    }
    return list.map((entry) => (typeof entry === "string" ? entry : ""));
}
/** Translate the lines of a song, keeping their metadata. */
export async function translateLyricLines(lines, target, source = "auto") {
    const translations = await translateLines(lines.map((line) => line.text), target, source);
    return lines.map((line, index) => ({ ...line, translation: translations[index] }));
}
