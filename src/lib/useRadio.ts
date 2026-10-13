import { useSyncExternalStore } from 'react';
import {
  AUDIUS_HOSTS,
  CHANNELS,
  fetchTracks,
  streamUrl,
  type Channel,
  type RadioSource,
  type RadioTrack,
} from './audius';

/**
 * The in-flight radio's player.
 *
 * One <audio> element for the whole page, held here rather than in the
 * panel. The panel is a tab in the workspace, and a tab can be closed,
 * dragged into another panel or put behind a sibling — each of which may
 * unmount it — and none of which should stop the song. So the panel only
 * draws this state and calls these actions; closing it leaves the music on,
 * and the chip in the workspace bar is there to pause it.
 *
 * The element is a plain one, never routed through Web Audio. Routing it
 * would make playback depend on Audius's content nodes sending CORS headers
 * (silence if they ever stop), and iOS suspends an AudioContext when the
 * screen locks, where a plain element keeps playing.
 *
 * Nothing is fetched until the radio is opened.
 */

export type RadioStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RadioState {
  /** What the list is showing: a channel, or a search. */
  source: RadioSource;
  status: RadioStatus;
  /** The tracks on the panel. */
  list: readonly RadioTrack[];
  /** What next and previous walk: the list the playing track was picked from. */
  queue: readonly RadioTrack[];
  index: number;
  current: RadioTrack | null;
  playing: boolean;
  buffering: boolean;
  /** Seconds into the current track, and its length. */
  position: number;
  duration: number;
  volume: number;
  /** False on iOS, where the hardware buttons are the only volume there is. */
  volumeControl: boolean;
  message: string;
}

const SETTINGS_KEY = 'sa.radio';

interface Settings {
  volume: number;
  channel: string;
}

function readSettings(): Settings {
  const fallback: Settings = { volume: 0.7, channel: CHANNELS[0].key };
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
    return {
      volume: typeof saved?.volume === 'number' && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : fallback.volume,
      channel: typeof saved?.channel === 'string' ? saved.channel : fallback.channel,
    };
  } catch {
    return fallback;
  }
}

function keepSettings(patch: Partial<Settings>) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch {
    /* Storage blocked: the radio still plays, it just forgets. */
  }
}

/* iOS reads `volume` back as 1 whatever it is set to. */
const canSetVolume = (() => {
  if (typeof Audio === 'undefined') return false;
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    return probe.volume === 0.5;
  } catch {
    return false;
  }
})();

const saved = typeof window === 'undefined' ? { volume: 0.7, channel: CHANNELS[0].key } : readSettings();
const startChannel = CHANNELS.find((c) => c.key === saved.channel) ?? CHANNELS[0];

let state: RadioState = {
  source: { kind: 'channel', channel: startChannel },
  status: 'idle',
  list: [],
  queue: [],
  index: -1,
  current: null,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  volume: saved.volume,
  volumeControl: canSetVolume,
  message: '',
};

const listeners = new Set<() => void>();
const set = (patch: Partial<RadioState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

/** The host the list came from, and the host the queue's streams come from. */
let listHost = AUDIUS_HOSTS[0];
let queueHost = AUDIUS_HOSTS[0];
let loading: AbortController | null = null;
/** Streams that failed in a row: a whole lap of them is a dead station, not a dead song. */
let failures = 0;
let audio: HTMLAudioElement | null = null;

/* `play()` refuses when the browser wants a tap first, and rejects with
   AbortError when the source changes under it — which skipping does on
   purpose, so that one is not worth a word. */
const refused = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  set({ playing: false, buffering: false, message: 'Press play to keep listening.' });
};

function element(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'auto';
  a.volume = state.volume;
  a.addEventListener('play', () => set({ playing: true, message: '' }));
  a.addEventListener('pause', () => set({ playing: false, buffering: false }));
  a.addEventListener('waiting', () => set({ buffering: true }));
  a.addEventListener('playing', () => {
    failures = 0;
    set({ playing: true, buffering: false });
  });
  a.addEventListener('timeupdate', () => set({ position: a.currentTime }));
  a.addEventListener('durationchange', () => {
    if (Number.isFinite(a.duration) && a.duration > 0) set({ duration: a.duration });
  });
  a.addEventListener('ended', () => {
    if (state.queue.length > 1) next();
    else set({ playing: false, position: 0 });
  });
  a.addEventListener('error', () => {
    failures += 1;
    if (state.queue.length > 1 && failures < state.queue.length) {
      start((state.index + 1) % state.queue.length);
      return;
    }
    failures = 0;
    set({ playing: false, buffering: false, message: 'This station is off the air. Try another channel.' });
  });
  if ('mediaSession' in navigator) {
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => { if (a.paused) toggle(); }],
      ['pause', () => a.pause()],
      ['nexttrack', () => next()],
      ['previoustrack', () => previous()],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* An action this browser does not offer. */
      }
    }
  }
  audio = a;
  return a;
}

/** The lock screen and the headphones' buttons: what is playing, and from where. */
function announce(track: RadioTrack) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Seat Airlines in-flight radio',
      artwork: track.artwork ? [{ src: track.artwork, sizes: '480x480' }] : [],
    });
  } catch {
    /* Metadata is a nicety. */
  }
}

function start(index: number) {
  const track = state.queue[index];
  if (!track) return;
  const a = element();
  a.src = streamUrl(queueHost, track.id);
  set({ index, current: track, position: 0, duration: track.duration, buffering: true, message: '' });
  announce(track);
  void a.play().catch(refused);
}

function load(source: RadioSource) {
  loading?.abort();
  const controller = new AbortController();
  loading = controller;
  set({ source, status: 'loading', list: [], message: '' });
  fetchTracks(source, controller.signal).then(
    ({ host, tracks }) => {
      if (controller.signal.aborted) return;
      listHost = host;
      const empty = source.kind === 'search'
        ? `Nothing playable on Audius for “${source.query}”.`
        : 'Nothing playable on this channel right now.';
      set({ status: 'ready', list: tracks, message: tracks.length ? '' : empty });
    },
    () => {
      if (controller.signal.aborted) return;
      set({ status: 'error', message: 'Audius is not answering. Try again in a moment.' });
    },
  );
}

/** Fetch the first list, the first time the radio is opened. */
function ensureLoaded() {
  if (state.status === 'idle') load(state.source);
}

function tune(channel: Channel) {
  keepSettings({ channel: channel.key });
  load({ kind: 'channel', channel });
}

function search(query: string) {
  const q = query.trim();
  if (!q) {
    const channel = CHANNELS.find((c) => c.key === readSettings().channel) ?? CHANNELS[0];
    load({ kind: 'channel', channel });
    return;
  }
  load({ kind: 'search', query: q.slice(0, 100) });
}

/** Ask again for whatever the list was showing. */
function retry() {
  load(state.source);
}

/** Play a track from the list on the panel, which becomes what next and previous walk. */
function playAt(index: number) {
  if (!state.list[index]) return;
  failures = 0;
  queueHost = listHost;
  set({ queue: state.list });
  start(index);
}

function toggle() {
  if (!state.current) {
    if (state.list.length) playAt(0);
    else ensureLoaded();
    return;
  }
  const a = element();
  if (!a.paused) {
    a.pause();
    return;
  }
  /* A source that failed stays failed: `play()` alone only rejects again,
     so it is loaded afresh first. */
  if (a.error) a.load();
  void a.play().catch(refused);
}

function next() {
  if (!state.queue.length) return;
  start((state.index + 1) % state.queue.length);
}

/** Back to the start of the song, or — near its start already — the one before. */
function previous() {
  if (!state.queue.length) return;
  if (state.position > 3) {
    seek(0);
    return;
  }
  start((state.index - 1 + state.queue.length) % state.queue.length);
}

function seek(seconds: number) {
  if (!audio || !state.current) return;
  audio.currentTime = Math.max(0, seconds);
  set({ position: audio.currentTime });
}

function setVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  if (audio) audio.volume = v;
  keepSettings({ volume: v });
  set({ volume: v });
}

export const radio = { ensureLoaded, tune, search, retry, playAt, toggle, next, previous, seek, setVolume };

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;

export const useRadio = (): RadioState => useSyncExternalStore(subscribe, snapshot, snapshot);
