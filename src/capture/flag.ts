/**
 * Capture mode: the switch, and the little state it shares with the app.
 *
 * Used only to film the commercial (see `commercial/`). It is on when BOTH
 * hold: the build was made with `VITE_CAPTURE_MODE=1`, and the address has
 * `?capture=1`. A production build never sets the variable, so `CAPTURE` is
 * the constant `false` there, every `CAPTURE && …` branch is dropped by the
 * minifier, and the capture code itself (`./install`) is never even emitted
 * as a chunk.
 *
 * Nothing here talks to a wallet, a chain or a server. The wallet it shows
 * is a fake that cannot sign, and the data it shows is invented.
 */
import { useSyncExternalStore } from 'react';
import type { FlightFeed } from '../lib/flightFeed';
import type { FlightGame } from '../lib/landingGame';

export const CAPTURE: boolean =
  import.meta.env.VITE_CAPTURE_MODE === '1'
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('capture') === '1';

/** What the app hands over so the capture API can drive it without a cursor. */
export interface CaptureAppControls {
  enter?: () => void;
  setCamera?: (camera: 'exterior' | 'deck' | 'seat' | 'hold') => void;
  setFacing?: (facing: 'left' | 'forward' | 'right') => void;
  walkTo?: (zone: 'deck' | 'first' | 'business' | 'exit' | 'economy') => void;
  setViewPosition?: (position: 'window' | 'middle' | 'aisle') => void;
  openPanel?: (panel: 'wall' | 'network' | 'chat' | 'check-in') => void;
  closePanel?: () => void;
  openScores?: () => void;
  closeScores?: () => void;
  /** The landing's Fly button, and its way in. */
  fly?: () => void;
  leave?: () => void;
}

export interface CaptureState {
  /** The flight feed the capture API writes market caps into. */
  feed: FlightFeed | null;
  /** Head turn in the cabin, degrees (negative left). Null leaves the buttons in charge. */
  yaw: number | null;
  /** Seat shown selected on the seat map. Undefined leaves the app's own. */
  seat: string | null | undefined;
  /** Replaces the flight's score the moment it ends, for the high-score shot. */
  highScore: number | null;
  /** Extra adverts by seat id, over everything else. */
  adverts: Record<string, string>;
  /** Called by the landing's scene every frame of the game, before it flies. */
  onGameFrame: ((g: FlightGame, dt: number) => void) | null;
  app: CaptureAppControls;
}

export const captureState: CaptureState = {
  feed: null,
  yaw: null,
  seat: undefined,
  highScore: null,
  adverts: {},
  onGameFrame: null,
  app: {},
};

/* React re-renders on a change to the parts it draws (seat, adverts). */
const listeners = new Set<() => void>();
let version = 0;
export function captureChanged(): void {
  version++;
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** A number that changes whenever capture state React draws does. */
export function useCaptureVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
