import { getJson } from "../http.js";
function artistsOf(song) {
    const primary = song?.artists?.primary;
    if (Array.isArray(primary))
        return primary.map((artist) => artist.name).filter(Boolean).join(", ");
    return song?.primaryArtists ?? song?.singers ?? "";
}
export async function searchJioSaavn(query) {
    const base = (process.env.PLAYER_JIOSAAVN_API || "https://saavn.sumit.co").replace(/\/$/, "");
    const url = new URL(`${base}/api/search/songs`);
    url.searchParams.set("query", query);
    url.searchParams.set("page", "0");
    url.searchParams.set("limit", "10");
    const payload = await getJson(url.toString());
    const results = payload?.data?.results;
    if (!Array.isArray(results))
        return [];
    return results.map((song) => ({
        provider: "JioSaavn",
        id: String(song.id),
        title: song.name || song.title || "Unknown title",
        artist: artistsOf(song) || song.primaryArtists || "Unknown artist",
        album: song.album?.name || song.album || "",
        duration: Number(song.duration) || undefined,
        url: song.url || undefined,
        hasLyrics: Boolean(song.hasLyrics),
        language: song.language || undefined,
    }));
}
