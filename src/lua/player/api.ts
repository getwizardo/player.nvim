import type { QueueInfo, RepeatMode } from "./types";

/**
 * The public interface of the plugin.
 *
 * `lua/player/init.lua` implements it, and `plugin/player.lua` uses it to
 * register the `:Player*` commands.
 */
/** @noSelf */
export interface PlayerApi {
  /** Configure the plugin. */
  setup(overrides?: unknown): void;
  /** Play a local file or URL. */
  play(source: string): void;
  /** Play a URL that was picked in a search result. */
  playUrl(url: string): void;
  /** Toggle the pause state. */
  pause(): void;
  /** Stop playback. */
  stop(): void;
  /** Play the next track of the queue. */
  next(): void;
  /** Play the previous track. */
  previous(): void;
  /** Seek to a position in seconds. */
  seek(seconds: number): void;
  /** Change the volume. */
  volume(delta?: number): void;
  /** Show the player status. */
  status(): void;
  /** Add a file or URL to the queue. */
  queueAdd(source: string): void;
  /** Browse the queue. */
  queueList(): void;
  /** Clear the queue. */
  queueClear(): void;
  /** Remove a track from the queue. */
  queueRemove(index: number): void;
  /** Turn shuffle on or off. */
  toggleShuffle(enabled?: boolean): boolean;
  /** Set or cycle the repeat mode. */
  cycleRepeat(mode?: string): RepeatMode;
  /** Pick a local audio file. */
  pickLocal(append?: boolean): void;
  /** Search for a track with yt-dlp. */
  search(query?: string): void;
  /** Download audio with yt-dlp. */
  download(url?: string): void;
  /** Configure the equalizer. */
  eq(argument?: string): void;
  /** Configure the audio filter. */
  filter(kind?: string): void;
  /** Show the lyrics of the current track. */
  showLyrics(isrc?: string): void;
  /** Search the lyric catalogs. */
  searchLyrics(query?: string): void;
  /** Search the JioSaavn catalog. */
  searchJioSaavn(query?: string): void;
  /** Translate the open lyrics. */
  translateLyrics(target?: string): void;
  /** Toggle the mpv spectrum window. */
  visualize(enabled?: boolean): void;
  /** Open the dashboard, or play a source. */
  open(source?: string): void;
  /** Stop mpv and release every resource. */
  shutdown(): void;
  /** The current queue state. */
  queueInfo(): QueueInfo;
}
