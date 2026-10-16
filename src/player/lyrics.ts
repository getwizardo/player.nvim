/**
 * Lyric resolution: search several catalogues, then fetch the actual text.
 *
 * Resolution order for the playing track:
 *   1. lrc.red TTML by ISRC (word-level karaoke)
 *   2. lrc.red `/match.json` by title/artist/duration → TTML
 *   3. LRCLIB signature lookup → synced LRC or plain text
 */

import { get as getOptions } from "./config";
import type { TtmlDocument } from "./format/ttml";
import * as jiosaavn from "./providers/jiosaavn";
import * as lrclib from "./providers/lrclib";
import * as lrcred from "./providers/lrcred";
import type { LyricCandidate, LyricSet, SyncMode, TrackInfo } from "./types";
import { lower, similarity, trim, upper } from "./util";

type Step = (done: (succeeded: boolean, error: string) => void) => void;

function attempt(steps: Step[], index: number, errors: string[], finish: (errors: string[]) => void): void {
  if (index >= steps.length) {
    finish(errors);
    return;
  }
  steps[index]((succeeded, error) => {
    if (succeeded) return;
    if (error !== "") errors.push(error);
    attempt(steps, index + 1, errors, finish);
  });
}

function setFromTtml(document: TtmlDocument, isrc: string, fallback: { title: string; artist: string; album: string }): LyricSet {
  return {
    lines: document.lines,
    source: document.timing === "word" ? "lrc.red · TTML word sync" : "lrc.red · TTML",
    provider: "lrc.red",
    title: fallback.title === "" ? "" : fallback.title,
    artist: fallback.artist,
    album: fallback.album,
    isrc,
    sync: document.timing,
    songwriters: document.songwriters,
  };
}

function setFromRecord(record: lrclib.LrclibRecord): LyricSet {
  const resolved = lrclib.linesFrom(record);
  const sync: SyncMode = resolved.lines.some((line) => line.start > 0) ? "line" : "none";
  return {
    lines: resolved.lines,
    source: resolved.source,
    provider: "LRCLIB",
    title: record.trackName,
    artist: record.artistName,
    album: record.albumName,
    sync,
    songwriters: [],
  };
}

/** Search every enabled lyric catalogue and merge the candidates. */
export function search(query: string, callback: (candidates: LyricCandidate[], errors: string[]) => void): void {
  const term = trim(query);
  if (term === "") {
    callback([], ["Enter a song title, artist, or lyric phrase."]);
    return;
  }
  const sources = getOptions().lyric.sources;
  const candidates: LyricCandidate[] = [];
  const errors: string[] = [];
  let pending = sources.length;
  const finish = (): void => {
    pending -= 1;
    if (pending > 0) return;
    candidates.sort((a, b) => {
      const providerRank = (c: LyricCandidate): number => (c.provider === "lrc.red" ? 0 : c.provider === "LRCLIB" ? 1 : 2);
      const byProvider = providerRank(a) - providerRank(b);
      if (byProvider !== 0) return byProvider;
      const left = similarity(term, `${a.title} ${a.artist}`);
      const right = similarity(term, `${b.title} ${b.artist}`);
      if (left !== right) return right - left;
      return a.title < b.title ? -1 : 1;
    });
    callback(candidates, errors);
  };
  for (const name of sources) {
    const source = lower(trim(name));
    if (source === "lrc.red" || source === "lrcred") {
      lrcred.search(term, (hits, error) => {
        if (error !== undefined) errors.push(`lrc.red: ${error}`);
        for (const candidate of lrcred.toCandidates(hits)) candidates.push(candidate);
        finish();
      });
    } else if (source === "lrclib") {
      lrclib.search(term, (found, error) => {
        if (error !== undefined) errors.push(`LRCLIB: ${error}`);
        for (const candidate of found) candidates.push(candidate);
        finish();
      });
    } else if (source === "jiosaavn") {
      jiosaavn.search(term, (songs, error) => {
        if (error !== undefined) errors.push(`JioSaavn: ${error}`);
        for (const candidate of jiosaavn.toCandidates(songs)) candidates.push(candidate);
        finish();
      });
    } else {
      errors.push(`Unknown lyric source "${name}".`);
      finish();
    }
  }
}

/** Fetch the lyric text for one candidate. */
export function fetch(candidate: LyricCandidate, callback: (set: LyricSet | undefined, error?: string) => void): void {
  const steps: Step[] = [];
  if (candidate.provider === "lrc.red" || candidate.isrc !== undefined) {
    const isrc = candidate.isrc ?? candidate.id;
    steps.push((done) => {
      lrcred.fetchTtml(isrc, (document, error) => {
        if (document === undefined) {
          done(false, error ?? "lrc.red had no TTML for that ISRC.");
          return;
        }
        callback(setFromTtml(document, upper(trim(isrc)), { title: candidate.title, artist: candidate.artist, album: candidate.album }));
        done(true, "");
      });
    });
  }
  if (candidate.provider === "LRCLIB") {
    steps.push((done) => {
      const id = tonumber(candidate.id);
      if (id === undefined) {
        done(false, "That LRCLIB candidate has no numeric id.");
        return;
      }
      lrclib.getById(id, (record, error) => {
        if (record === undefined) {
          done(false, error ?? "LRCLIB had no record for that id.");
          return;
        }
        callback(setFromRecord(record));
        done(true, "");
      });
    });
  }
  // JioSaavn results are catalogue metadata only; resolve their text on LRCLIB.
  steps.push((done) => {
    lrclib.getBySignature(candidate.title, candidate.artist, candidate.album, candidate.duration, (record, error) => {
      if (record === undefined) {
        done(false, error ?? "No LRCLIB match for that title/artist.");
        return;
      }
      callback(setFromRecord(record));
      done(true, "");
    });
  });
  steps.push((done) => {
    lrcred.search(`${candidate.title} ${candidate.artist}`, (hits, error) => {
      const best = hits[0];
      if (best === undefined) {
        done(false, error ?? "No lrc.red match for that title/artist.");
        return;
      }
      lrcred.fetchTtml(best.isrc, (document, ttmlError) => {
        if (document === undefined) {
          done(false, ttmlError ?? "lrc.red had no TTML for the closest match.");
          return;
        }
        callback(setFromTtml(document, best.isrc, { title: best.title, artist: best.artist, album: best.album }));
        done(true, "");
      });
    });
  });
  attempt(steps, 0, [], (errors) => callback(undefined, errors.length > 0 ? errors[0] : "No lyrics could be resolved."));
}

/** Fetch word-synced TTML straight from an ISRC. */
export function fetchIsrc(isrc: string, callback: (set: LyricSet | undefined, error?: string) => void): void {
  const code = upper(trim(isrc));
  lrcred.metadata(code, (meta) => {
    lrcred.fetchTtml(code, (document, error) => {
      if (document === undefined) {
        callback(undefined, error);
        return;
      }
      const set = setFromTtml(document, code, {
        title: meta?.title ?? "",
        artist: meta?.artist ?? "",
        album: meta?.album ?? "",
      });
      if (set.title === "") set.title = `ISRC ${code}`;
      if (meta?.songwriters !== undefined) set.songwriters = meta.songwriters;
      callback(set);
    });
  });
}

/** Find lyrics for whatever mpv is playing right now. */
export function resolveTrack(info: TrackInfo, callback: (set: LyricSet | undefined, error?: string) => void): void {
  const steps: Step[] = [];
  const isrc = upper(trim(info.isrc));
  if (isrc !== "") {
    steps.push((done) => {
      lrcred.fetchTtml(isrc, (document, error) => {
        if (document === undefined) {
          done(false, error ?? `lrc.red has no TTML for ${isrc}.`);
          return;
        }
        callback(setFromTtml(document, isrc, { title: info.title, artist: info.artist, album: info.album }));
        done(true, "");
      });
    });
  }
  if (trim(info.title) !== "" || trim(info.artist) !== "") {
    steps.push((done) => {
      lrcred.match(info.title, info.artist, info.album, info.duration, (hits, error) => {
        if (error !== undefined && hits.length === 0) {
          done(false, error);
          return;
        }
        const wanted = info.duration > 0 ? info.duration : undefined;
        const ranked = hits
          .filter((hit) => wanted === undefined || hit.duration === undefined || math.abs(hit.duration - wanted) <= 6)
          .slice(0, 3);
        if (ranked.length === 0) {
          done(false, "lrc.red matched nothing close to this recording.");
          return;
        }
        const best = ranked[0];
        lrcred.fetchTtml(best.isrc, (document, ttmlError) => {
          if (document === undefined) {
            done(false, ttmlError ?? "lrc.red had no TTML for the closest match.");
            return;
          }
          callback(setFromTtml(document, best.isrc, { title: best.title, artist: best.artist, album: best.album }));
          done(true, "");
        });
      });
    });
  }
  if (trim(info.title) !== "" && trim(info.artist) !== "") {
    steps.push((done) => {
      lrclib.getBySignature(info.title, info.artist, info.album, info.duration, (record, error) => {
        if (record === undefined) {
          done(false, error ?? "LRCLIB has no record for this track.");
          return;
        }
        callback(setFromRecord(record));
        done(true, "");
      });
    });
  }
  attempt(steps, 0, [], (errors) => callback(undefined, errors.length > 0 ? errors[0] : "Not enough metadata to look up lyrics."));
}

/** Plain-text LRC export, handy for saving next to the audio file. */
export function toLrc(set: LyricSet): string {
  const header: string[] = [];
  if (set.title !== "") header.push(`[ti:${set.title}]`);
  if (set.artist !== "") header.push(`[ar:${set.artist}]`);
  if (set.album !== "") header.push(`[al:${set.album}]`);
  header.push(`[by:player.nvim via ${set.provider}]`);
  const lines: string[] = [...header, ""];
  for (const line of set.lines) {
    const minutes = math.floor(line.start / 60);
    const seconds = line.start - minutes * 60;
    lines.push(`[${string.format("%02d:%05.2f", minutes, seconds)}]${line.text}`);
  }
  return lines.join("\n");
}

export function describeSet(set: LyricSet): string {
  const words = set.lines.filter((line) => line.words !== undefined).length;
  const detail = set.sync === "word" ? `${words} word-timed line(s)` : `${set.lines.length} line(s)`;
  return `${set.source} · ${detail}`;
}
