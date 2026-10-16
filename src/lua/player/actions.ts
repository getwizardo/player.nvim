/**
 * The registry of actions the floating windows can trigger.
 *
 * The dashboard and the lyric viewer do not know how the player works: they
 * only call the actions that were registered by `player.setup()`. Keeping the
 * registry parameterless avoids the `self` juggling of the Lua API.
 */

/** An action that does not take an argument. */
/** @noSelf */
export interface VoidAction {
  /** @noSelf */
  (): void;
}

/** An action that plays a URL. */
/** @noSelf */
export interface UrlAction {
  /** @noSelf */
  (url: string): void;
}

/** Every action the floating windows may trigger. */
/** @noSelf */
export interface PlayerActions {
  /** Toggle the pause state. */
  toggle_pause: VoidAction;
  /** Play the next track. */
  play_next: VoidAction;
  /** Play the previous track. */
  play_previous: VoidAction;
  /** Open the lyric viewer. */
  show_lyrics: VoidAction;
  /** Search the lyric catalogs. */
  search_lyrics: VoidAction;
  /** Search the JioSaavn catalog. */
  search_jiosaavn: VoidAction;
  /** Toggle the mpv spectrum window. */
  toggle_visualizer: VoidAction;
  /** Configure the audio filter. */
  configure_filter: VoidAction;
  /** Configure the equalizer. */
  configure_eq: VoidAction;
  /** Show the queue. */
  show_queue: VoidAction;
  /** Turn shuffle on or off. */
  toggle_shuffle: VoidAction;
  /** Cycle the repeat mode. */
  cycle_repeat: VoidAction;
  /** Pick a local audio file. */
  pick_local: VoidAction;
  /** Lower the volume. */
  volume_down: VoidAction;
  /** Raise the volume. */
  volume_up: VoidAction;
  /** Close the lyric viewer. */
  close_lyrics: VoidAction;
  /** Translate the open lyrics. */
  translate_lyrics: VoidAction;
  /** Toggle the karaoke follow mode. */
  toggle_follow: VoidAction;
  /** Play a URL that was picked in a search result. */
  play_url: UrlAction;
}

const noop: VoidAction = (): void => {
  return;
};

const noopUrl: UrlAction = (_url: string): void => {
  return;
};

const empty: PlayerActions = {
  toggle_pause: noop,
  play_next: noop,
  play_previous: noop,
  show_lyrics: noop,
  search_lyrics: noop,
  search_jiosaavn: noop,
  toggle_visualizer: noop,
  configure_filter: noop,
  configure_eq: noop,
  show_queue: noop,
  toggle_shuffle: noop,
  cycle_repeat: noop,
  pick_local: noop,
  volume_down: noop,
  volume_up: noop,
  close_lyrics: noop,
  translate_lyrics: noop,
  toggle_follow: noop,
  play_url: noopUrl,
};

let registry: PlayerActions = empty;

/** Register the actions the floating windows may trigger. */
export function setActions(actions: PlayerActions): void {
  registry = actions;
}

/** The registered actions. */
export function actions(): PlayerActions {
  return registry;
}
