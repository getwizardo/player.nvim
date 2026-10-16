import { sourceLabel } from "./format";
import { clear, push, removeAt } from "./lua-util";
import type { QueueItem, RepeatMode } from "./types";

/**
 * The queue model.
 *
 * The queue is a plain data structure so that the playback rules (shuffle,
 * repeat, history) can be reasoned about - and tested - without a running
 * mpv instance.
 */
/** @noSelf */
export interface QueueState {
  /** Queued tracks. */
  items: QueueItem[];
  /** Index of the playing track, -1 when nothing is playing. */
  current: number;
  /** Previously played indexes, newest last. */
  history: number[];
  /** Shuffle is enabled. */
  shuffle: boolean;
  /** Repeat mode. */
  repeat: RepeatMode;
}

/** Create an empty queue. */
export function createQueue(): QueueState {
  return {
    items: [],
    current: -1,
    history: [],
    shuffle: false,
    repeat: "off",
  };
}

/** Append a track to the queue and return its index. */
export function addItem(state: QueueState, source: string, label?: string): number {
  const item: QueueItem = {
    source: source,
    label: label !== undefined && label !== "" ? label : sourceLabel(source),
  };
  state.items[state.items.length] = item;
  return state.items.length - 1;
}

/** Remove a track from the queue. Returns false when the index is invalid. */
export function removeItem(state: QueueState, index: number): boolean {
  if (index < 0 || index >= state.items.length) {
    return false;
  }
  removeAt(state.items, index);
  if (state.current > index) {
    state.current -= 1;
  } else if (state.current === index) {
    state.current = state.items.length > index ? index : state.items.length - 1;
  }
  for (let position = 0; position < state.history.length; position += 1) {
    if (state.history[position] > index) {
      state.history[position] -= 1;
    } else if (state.history[position] === index) {
      removeAt(state.history, position);
      position -= 1;
    }
  }
  return true;
}

/** Remove every track and reset the playback position. */
export function clearQueue(state: QueueState): void {
  clear(state.items);
  state.current = -1;
  clear(state.history);
}

/** A source of random numbers. */
/** @noSelf */
export interface RandomSource {
  /** @noSelf */
  (): number;
}

/**
 * Index of the track that should play next.
 *
 * Returns undefined when the queue is exhausted. `random` is injected so that
 * the shuffle behaviour stays deterministic in tests.
 */
export function nextIndex(state: QueueState, random: RandomSource): number | undefined {
  const total = state.items.length;
  if (total === 0) {
    return undefined;
  }
  if (state.current < 0) {
    return 0;
  }
  if (state.shuffle && total > 1) {
    let candidate = Math.floor(random() * total);
    if (candidate > total - 1) {
      candidate = total - 1;
    }
    if (candidate < 0) {
      candidate = 0;
    }
    if (candidate === state.current) {
      candidate = (candidate + 1) % total;
    }
    return candidate;
  }
  if (state.current + 1 < total) {
    return state.current + 1;
  }
  if (state.repeat === "queue") {
    return 0;
  }
  return undefined;
}

/**
 * Index of the track that should play when the user asks for the previous
 * one. The playback history wins over the queue order.
 */
export function previousIndex(state: QueueState): number | undefined {
  if (state.history.length > 0) {
    const index = state.history[state.history.length - 1];
    removeAt(state.history, state.history.length - 1);
    if (index >= 0 && index < state.items.length) {
      return index;
    }
  }
  if (state.current > 0) {
    return state.current - 1;
  }
  return undefined;
}

/** Remember the track that was playing before switching to another one. */
export function recordHistory(state: QueueState, index: number): void {
  if (index < 0) {
    return;
  }
  push(state.history, index);
}

/** Enable or disable shuffle and return the new state. */
export function setShuffle(state: QueueState, enabled: boolean): boolean {
  state.shuffle = enabled;
  return state.shuffle;
}

/** Set or cycle the repeat mode and return the new mode. */
export function cycleRepeat(state: QueueState, mode?: string): RepeatMode {
  if (mode !== undefined && mode !== "") {
    if (mode === "off" || mode === "queue" || mode === "track") {
      state.repeat = mode;
    }
    return state.repeat;
  }
  if (state.repeat === "off") {
    state.repeat = "queue";
  } else if (state.repeat === "queue") {
    state.repeat = "track";
  } else {
    state.repeat = "off";
  }
  return state.repeat;
}

/** Snapshot of the queue, used by the dashboard and by `:PlayerStatus`. */
export function describe(state: QueueState): { count: number; current: number; shuffle: boolean; repeat: RepeatMode } {
  return {
    count: state.items.length,
    current: state.current + 1,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
}

const shared: QueueState = createQueue();

/** The queue the player is using. */
export function state(): QueueState {
  return shared;
}

/** Snapshot of the queue, used by the dashboard and by `:PlayerStatus`. */
export function queueInfo(): { count: number; current: number; shuffle: boolean; repeat: RepeatMode } {
  return describe(shared);
}

/** Find the index of a queued track by source. */
export function findSource(state: QueueState, source: string): number {
  for (let index = 0; index < state.items.length; index += 1) {
    if (state.items[index].source === source) {
      return index;
    }
  }
  return -1;
}
