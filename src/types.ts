export interface LyricWord {
  start: number;
  finish: number;
  text: string;
}

export interface LyricLine {
  start: number;
  finish: number;
  text: string;
  words?: LyricWord[];
  translation?: string;
}

export interface LyricCandidate {
  provider: "LRCLIB" | "JioSaavn";
  id: string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  isrc?: string;
  url?: string;
  hasSyncedLyrics?: boolean;
  hasLyrics?: boolean;
  language?: string;
}
