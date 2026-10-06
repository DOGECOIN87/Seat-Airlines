import { createRef, lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CAPTURE, captureState } from '../capture/flag';
import DocsLink from './DocsLink';
import SocialLinks from './SocialLinks';
import { DeckIcon } from './InstrumentDeck';
import Wordmark from './Wordmark';
import Flyover from './Flyover';
import SplitFlapBoard from './SplitFlapBoard';
import Wasted from './Wasted';
import SeatOverview from './SeatOverview';
import AircraftCarousel, { type PlayMode } from './AircraftCarousel';
import type { Manifest } from '../lib/manifest';
import type { BannerSet } from '../lib/banners';
import { DEXSCREENER_URL } from '../lib/social';
import { GOLDEN_TICKER, boostStrength } from '../lib/dexBoost';
import { SPLASH_BETWEEN, SPLASH_FIRST, SPLASH_LAST } from '../content/cabin';
import type { FlightFeed } from '../lib/flightFeed';
import { formatCap, type BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import type { ManualControls } from '../lib/manualControls';
import {
  blastAltitude, BOOST, clampUnit, cycleDrive, dealWeather, DRIVES, FEET, fireBoost, newGame, testFlight,
  type Cause, type Drive, type GameWeather, type Phase,
} from '../lib/landingGame';
import { RAMMER } from '../lib/rammer';
import { TWISTER } from '../lib/tornado';
import { LEVELS, type Level } from '../lib/levels';
import { LOGOS } from '../lib/logos';
import { createSfx, type Sfx } from '../lib/sfx';
import {
  canShareFile, cardAssets, cardJpeg, composeCard, hostCard, hostsCards, intentUrl, saveFile, shareFile, shareText, SITE_URL,
  type SharedFlight,
} from '../lib/shareCard';
import { recordVideo, videoType } from '../lib/shareVideo';
import { connectX, disconnectX, onXLinkChange, postToX, xStatus, type XStatus } from '../lib/xPost';
import FlightInstruments, { type EngineState } from './FlightInstruments';
import UfoInstruments from './UfoInstruments';
import { UFO } from '../lib/ufo';
import { fetchBoard, hasBoard, keepBest, postScore, readBest, startRun, type BoardEntry, type Posted } from '../lib/scoresApi';
import type { WalletState } from '../lib/useWallet';
import type { LandingHud, LandingSounds } from './LandingScene';

/** What the share button last said, with a link to follow when there is one. */
interface ShareNote { text: string; href?: string; label?: string; error?: boolean }

/* The scene is the chunk with three.js in it. Everything here — the way in
   above all — is up and working before it arrives. */
const LandingScene = lazy(() => import('./LandingScene'));
/* The same high scores window the site opens from its tab bar, fetched as a
   finger or a pointer reaches the button so it is there by the click. */
const loadScores = () => import('./ScoresDialog');
const ScoresDialog = lazy(loadScores);
const prefetchScores = () => { void loadScores(); };

/**
 * The way in.
 *
 * The aeroplane, full screen and edge to edge, before anything else: the
 * one picture that says what the site is without a caption. One button goes
 * in. The other hands over the controls, to anybody with a Solana wallet
 * connected — the arrow keys, or a drag on a touch screen, put the nose up
 * and down and bank it round, low over the country the cabin windows look
 * out on — with a brief to climb to 10,000 ft, where an engine blows. It is scored (see `scoring.ts`), the best scores go
 * on a board any Solana wallet can sign its way onto — Scores, at the end of
 * the row of buttons, opens it in the same window as the site's Scores tab —
 * and when the aeroplane meets the ground it goes in on its own.
 *
 * Before any of it, for a few seconds, the splash: the departure board in the
 * middle of the screen, boarding the airline's line and a few more, then
 * fading onto the aeroplane on NOW BOARDING — which has had those seconds to
 * get its engines going.
 */

interface LandingProps {
  feed: FlightFeed;
  sky: SkyState;
  band: BandState;
  marketCap: number;
  controls: ManualControls;
  taken: ReadonlySet<string>;
  /** The visitor's wallet, for signing a score onto the board. */
  wallet: WalletState;
  /** Go through to the site. */
  onEnter: () => void;
  /** Fly again: the landing is made afresh, with no splash, and takes off at once if a wallet is connected. */
  onPlayAgain: () => void;
  /** This landing is a replay: skip the splash and, with a wallet, take off at once. */
  replay?: boolean;
  /** Who is in which seat, and the advert on each, for the seat overview. */
  manifest: Manifest;
  banners: BannerSet;
  /** Claim your Seat: connect, then the seats. Called as the landing goes. */
  onClaim: () => void;
  /** Boosts running on DexScreener: while there are any, the plane burns. */
  boosts: number;
  /** Current whole-token balance used for the experimental UFO holder gate. */
  tokenBalance: number | null;
  tokenBalanceLoading: boolean;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

type PostState =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'signing' }
  | { state: 'done'; posted: Posted }
  | { state: 'error'; message: string };

/** Keys to stick: x banks right, y climbs. The arrows, and WASD beside them. */
const KEYS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** Keys that light the afterburners. */
const BOOST_KEYS = new Set(['Space', 'KeyB', 'ShiftLeft', 'ShiftRight']);
/** What goes across the middle of the screen about a UFO — or, in UFO mode, an airliner. */
type UfoCaption = 'warn' | 'hit' | 'dodged' | 'ram-warn' | 'ram-hit' | 'ram-dodged' | 'threaded' | 'arrived';
/** The ride flown last, kept across the remount that Play again does. */
let lastPlayMode: PlayMode = 'airliner';
/** The saucer's drive modes, as the selector shows them. */
const DRIVE_NAME: Record<Drive, { short: string; long: string; icon: string }> = {
  forward: { short: 'FWD', long: 'Forward flight', icon: '➤' },
  vertical: { short: 'VERT', long: 'Straight up and down', icon: '⇅' },
  strafe: { short: 'SIDE', long: 'Strafe sideways', icon: '⇆' },
};
/** The saucer's next goal as the strip has room for it. */
const GOAL_SHORT: Record<string, string> = { 'Above the clouds': 'Clouds', Space: 'Space', 'The moon': 'Moon', Mars: 'Mars' };
/** Where an airliner is coming from, in words, from its bearing off the nose. */
const fromWords = (bearing: number) =>
  Math.abs(bearing) < 30 ? 'dead ahead' : Math.abs(bearing) > 150 ? 'from behind' : bearing > 0 ? 'from the right' : 'from the left';
/** Seconds between two logos for the second to count as a run. */
const LOGO_RUN = 4;

/** Pixels of drag for full stick. */
const STICK_REACH = 64;
/** Less than this much stick is none, so a resting thumb does not wander. */
const DEAD_ZONE = 0.08;
/** How long the verdict stays up before the site takes over — longer when there is a score to post. */
const END_HOLD = hasBoard ? 9000 : 5400;
/**
 * The crash sounds, one picked at random each flight and never the same one
 * twice running, each started so that its big moment lands with the WASTED,
 * a second and a quarter after the aeroplane does (see `.sa-wasted__word`).
 * The GTA one builds up to its hit 2.45 s in, so it starts at once, 1.2 s
 * in; the other two open on theirs, so they wait for it: `from` is where in
 * the sound to start, `wait` how long after the crash.
 */
const LOSSES = [
  { sound: 'wasted', from: 1.2, wait: 0 },
  { sound: 'fahh', from: 0, wait: 1.05 },
  { sound: 'trombone', from: 0, wait: 1.2 },
] as const;
let lastLoss = -1;
const pickLoss = () => {
  let i: number;
  if (lastLoss < 0) i = Math.floor(Math.random() * LOSSES.length);
  else {
    i = Math.floor(Math.random() * (LOSSES.length - 1));
    if (i >= lastLoss) i++;
  }
  lastLoss = i;
  return LOSSES[i];
};

const deadZone = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : v);

/** How many of the airline's other lines the splash turns through between its first and its last. */
const SPLASH_BETWEEN_COUNT = 2;
/** The splash's phrases: the line, two of the rest picked fresh each visit, and the call to board. */
const splashPhrases = (): (readonly string[])[] => {
  const pool = [...SPLASH_BETWEEN];
  const picked: (readonly string[])[] = [];
  while (picked.length < SPLASH_BETWEEN_COUNT && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return [SPLASH_FIRST, ...picked, SPLASH_LAST];
};
/** Ms each phrase stays up once it has landed: the line a little longer. */
const SPLASH_PHRASE_HOLD = 550;
const SPLASH_FIRST_HOLD = 800;
/** How long the call to board stays up before the fade, ms. */
const SPLASH_HOLD = 900;
/** How long, from the start, the splash will wait for the aeroplane behind it to be ready. */
const SPLASH_WAIT = 6000;
/** Past this it goes whatever the board is doing: a background tab, a board that never started. */
const SPLASH_GIVE_UP = 15000;
/** How long the plane flies alone, after the splash, before the seat overview comes in. */
const OVERVIEW_AFTER = 3000;
/** The fade onto the landing; `.sa-splash` times its transition to it. */
const SPLASH_FADE = 800;

export default function Landing({
  feed, sky, band, marketCap, controls, taken, wallet, onEnter, onPlayAgain, replay = false, manifest, banners, onClaim, boosts, tokenBalance, tokenBalanceLoading, soundEnabled, onSoundToggle,
}: LandingProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  // Play again remounts the landing: start from the ride flown last.
  const [playMode, setPlayModeState] = useState<PlayMode>(() => lastPlayMode);
  const setPlayMode = useCallback((mode: PlayMode) => {
    lastPlayMode = mode;
    setPlayModeState(mode);
  }, []);
  const [flapLevel, setFlapLevel] = useState(0);
  /** The saucer's drive mode, for the selector (the game holds the real one). */
  const [drive, setDrive] = useState<Drive>('forward');
  /** UFO mode: what the saucer is climbing for next, for the strip — a band, or the next world. */
  const [ufoGoal, setUfoGoal] = useState('Above the clouds');
  /** An airliner hit the saucer: its field is scrambled for a while. */
  const [scrambled, setScrambled] = useState(false);
  const scrambleTimer = useRef<number | null>(null);
  const [ridePickerOpen, setRidePickerOpen] = useState(false);
  /* Read by the key handler, which is not rebuilt when the picker opens. */
  const ridePickerUp = useRef(false);
  useEffect(() => {
    ridePickerUp.current = ridePickerOpen;
  }, [ridePickerOpen]);
  // The local Vite preview is a test harness for both rides. Production builds
  // (including the version pushed to main) still require 1,000,000 $SEAT.
  const localTestMode = import.meta.env.DEV;
  const ufoUnlocked = localTestMode || (tokenBalance ?? 0) >= 1_000_000;
  const ufoUnlockedRef = useRef(ufoUnlocked);
  useEffect(() => {
    ufoUnlockedRef.current = ufoUnlocked;
    // A remembered saucer the wallet no longer holds the pass for goes back to the airliner.
    if (!ufoUnlocked && !tokenBalanceLoading && game.current.phase === 'idle') setPlayMode('airliner');
  }, [ufoUnlocked, tokenBalanceLoading, setPlayMode]);
  /** Pick a ride, if it is one this pilot can fly. */
  const chooseRide = useCallback((mode: PlayMode) => {
    if (mode === 'ufo' && !ufoUnlockedRef.current) return;
    setPlayMode(mode);
  }, [setPlayMode]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [result, setResult] = useState<{
    metres: number; after: number | null; score: number; climb: number; survived: number; best: boolean;
  } | null>(null);
  /** The bonus for reaching the blast altitude, shown as it is paid. */
  const [bonusPop, setBonusPop] = useState<number | null>(null);
  /** The leaderboard, or null when there is none to show. */
  const [board, setBoard] = useState<BoardEntry[] | null>(null);
  /* The high scores window. While it is up the keys are its own: an arrow
     does not take the controls behind it, nor Enter go in. */
  const [scoresOpen, setScoresOpen] = useState(false);
  const scoresUp = useRef(false);
  useEffect(() => {
    scoresUp.current = scoresOpen;
  }, [scoresOpen]);
  const openScores = useCallback(() => setScoresOpen(true), []);
  const closeScores = useCallback(() => setScoresOpen(false), []);
  const [post, setPost] = useState<PostState>({ state: 'idle' });
  /** The server's id for this flight: it times the flight, which is what lets it believe the score. */
  const runId = useRef<string | null>(null);
  const autoLeave = useRef<number | null>(null);
  /** The altitude the engine goes at, in feet, as the brief states it. */
  const [goalFeet] = useState(() => Math.round((blastAltitude() * FEET) / 100) * 100);
  /** `?mayday` puts the engine at 1,500 ft, and `?space` and the rest start the saucer high: practice, not runs for the board. */
  const practice = goalFeet !== 10_000 || testFlight();
  /** Which engine went first, what took it and at what height; and whether the other followed, and to what. */
  const [failure, setFailure] = useState<{ side: -1 | 1; cause: Cause; feet: number; both: boolean; second: Cause | null } | null>(null);
  /** The moment lightning hits: the screen goes blue-white. */
  const [struck, setStruck] = useState(false);
  /** The UFO took a wing: which. */
  const [wingHit, setWingHit] = useState<-1 | 1 | null>(null);
  /** What the UFO is doing, said across the middle of the screen while it matters. */
  const [ufoCaption, setUfoCaption] = useState<{ kind: UfoCaption; side?: -1 | 1; from?: string } | null>(null);
  const captionTimer = useRef<number | null>(null);
  const sayUfo = useCallback((kind: UfoCaption, side?: -1 | 1, ms = 3000, from?: string) => {
    setUfoCaption({ kind, side, from });
    if (captionTimer.current !== null) window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setUfoCaption(null), ms);
    timers.current.push(captionTimer.current);
  }, []);
  /** The moment of the blast, for the shake and the flash. */
  const [blasted, setBlasted] = useState(false);
  const game = useRef(newGame());
  /** Exterior camera orbit, driven by right-mouse drag or a gamepad's right stick. */
  const cameraLook = useRef({ orbit: 0 });
  const [hud] = useState<LandingHud>(() => ({
    bar: createRef(), alt: createRef(), warn: createRef(), stall: createRef(), vortex: createRef(), score: createRef(), rate: createRef(),
    speedNeedle: createRef(), speedText: createRef(), varioNeedle: createRef(), varioText: createRef(), horizon: createRef(),
    lift: createRef(), boost: createRef(), logos: createRef(),
  }));
  /** The weather this flight was dealt, for the HUD's tag. */
  const [weather, setWeather] = useState<GameWeather | null>(null);
  /** A logo just flown through: the pop, and how many in a run. */
  const [logoPop, setLogoPop] = useState<{ n: number; run: number } | null>(null);
  const logoRun = useRef({ at: 0, run: 0 });
  /** The synthesised sounds: the burn, the chime and the thunder. */
  const sfx = useRef<Sfx | null>(null);
  const soundOn = useRef(soundEnabled);
  soundOn.current = soundEnabled;
  useEffect(() => sfx.current?.setEnabled(soundEnabled), [soundEnabled]);
  useEffect(() => () => sfx.current?.close(), []);
  /** The scene's picture of the moment the engine went, for the card. */
  const shot = useRef<HTMLCanvasElement | null>(null);
  /* Sharing the flight: the card as a picture as soon as the flight is
     over, and the video after it, which takes as long as it plays. */
  const [share, setShare] = useState<{ still: Blob | null; video: Blob | null; making: boolean }>({ still: null, video: null, making: false });
  const [shareNote, setShareNote] = useState<ShareNote | null>(null);
  /* Posting through the Worker, as the player, once they have connected X
     (see lib/xPost.ts). Null until the Worker has said whether it can. */
  const [xs, setXs] = useState<XStatus | null>(null);
  const [xBusy, setXBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => void xStatus().then((s) => live && setXs(s));
    check();
    const stop = onXLinkChange(check);
    return () => {
      live = false;
      stop();
    };
  }, []);
  const videoReady = useRef<Promise<Blob | null> | null>(null);
  const shared = useRef<SharedFlight | null>(null);
  const hosted = useRef<string | null>(null);
  const recording = useRef<AbortController | null>(null);
  const shareProgress = useRef<HTMLSpanElement>(null);
  useEffect(() => () => recording.current?.abort(), []);
  // Dev only: what would be shared, for the headless checks.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __saShare: { ...share, flight: shared.current } });
  }, [share]);
  const sounds = useRef<LandingSounds | null>(null);
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

  /* The splash. It goes once the line has landed on the board and held —
     and once the aeroplane behind it is ready, within reason — or at the
     first tap or key, which does nothing else. */
  const [splash, setSplash] = useState<'on' | 'fading' | 'off'>(replay ? 'off' : 'on');
  const [phrases] = useState(splashPhrases);
  /** When the call to board — the last phrase — landed. */
  const [landedAt, setLandedAt] = useState<number | null>(null);
  const splashFrom = useRef(0);
  const splashUp = useRef(true);
  useEffect(() => {
    splashFrom.current = performance.now();
  }, []);
  useEffect(() => {
    splashUp.current = splash === 'on';
  }, [splash]);
  const onSplashLanded = useCallback((index: number) => {
    if (index === phrases.length - 1) setLandedAt((at) => at ?? performance.now());
  }, [phrases.length]);
  const clearSplash = useCallback(() => setSplash((s) => (s === 'on' ? 'fading' : s)), []);
  useEffect(() => {
    if (splash !== 'on') return;
    let due = splashFrom.current + SPLASH_GIVE_UP;
    if (landedAt !== null) {
      const held = landedAt + SPLASH_HOLD;
      due = Math.min(due, ready || failed ? held : Math.max(held, splashFrom.current + SPLASH_WAIT));
    }
    const id = window.setTimeout(clearSplash, Math.max(0, due - performance.now()));
    return () => window.clearTimeout(id);
  }, [splash, landedAt, ready, failed, clearSplash]);
  useEffect(() => {
    if (splash !== 'fading') return;
    const id = window.setTimeout(() => setSplash('off'), SPLASH_FADE);
    return () => window.clearTimeout(id);
  }, [splash]);


  /* Going in fades the landing out first, so the site arrives from black
     rather than cutting in. Once only, however many ways it is asked. */
  const gone = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  /* The warning and the crowd go with the landing; the crash sound is left to ring out. */
  const hush = () => {
    sounds.current?.blast.pause();
    sounds.current?.lightning.pause();
    sounds.current?.ufo.pause();
    sounds.current?.wind.pause();
    sounds.current?.crowd.pause();
    recording.current?.abort();
  };
  const leave = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    setLeaving(true);
    hush();
    timers.current.push(window.setTimeout(onEnter, 450));
  }, [onEnter]);
  /* Fly again. The landing is rebuilt from nothing by whoever holds it, which
     is the one way to be sure no run leaks into the next; this only has to
     stop the count, quiet the verdict's sounds, and ask. */
  const again = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    if (autoLeave.current !== null) window.clearTimeout(autoLeave.current);
    autoLeave.current = null;
    hush();
    sounds.current?.wasted.pause();
    sounds.current?.fahh.pause();
    sounds.current?.trombone.pause();
    sounds.current?.wow.pause();
    onPlayAgain();
  }, [onPlayAgain]);
  /* The seat overview: once the splash has gone and the plane has had a
     few seconds of the screen to itself. */
  const [overview, setOverview] = useState(false);
  useEffect(() => {
    if (splash !== 'off' || overview) return;
    const id = window.setTimeout(() => setOverview(true), OVERVIEW_AFTER);
    return () => window.clearTimeout(id);
  }, [splash, overview]);
  const claim = useCallback(() => {
    onClaim();
    leave();
  }, [onClaim, leave]);

  /* After the crash the site takes over on its own, whatever happens on the
     way: sharing or posting holds the count while it is going on, and
     starts it again once it is done — sent, cancelled or failed — so the
     screen is never left waiting on a tap that may not come. */
  const [counting, setCounting] = useState(false);
  /** Whole seconds until the site takes over, while it is counting. */
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(END_HOLD / 1000));
  const deadline = useRef(0);
  const holdLeave = useCallback(() => {
    if (autoLeave.current !== null) window.clearTimeout(autoLeave.current);
    autoLeave.current = null;
    setCounting(false);
  }, []);
  const armLeave = useCallback(() => {
    if (gone.current) return;
    if (autoLeave.current !== null) window.clearTimeout(autoLeave.current);
    autoLeave.current = window.setTimeout(leave, END_HOLD);
    timers.current.push(autoLeave.current);
    deadline.current = performance.now() + END_HOLD;
    setSecondsLeft(Math.ceil(END_HOLD / 1000));
    setCounting(true);
  }, [leave]);
  /* The number on screen, kept to the same deadline the timer runs to. */
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [counting]);

  /* The game's sounds, made inside the click or key that starts it:
     each is played once, muted, there and then, which is what a browser
     wants to see before it lets a page make a noise later on its own. */
  const makeSounds = () => {
    if (sounds.current) return;
    const load = (file: string, volume: number) => {
      const a = new Audio(`${import.meta.env.BASE_URL}${file}`);
      a.preload = 'auto';
      a.volume = volume;
      a.muted = true;
      void a.play().then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      }, () => {
        a.muted = false;
      });
      return a;
    };
    sounds.current = {
      blast: load('engine-blast.mp3', 0.9),
      lightning: load('lightning-strike.mp3', 1),
      ufo: load('ufo-appear.mp3', 0.85),
      wind: (() => {
        const a = load('updraft-wind.mp3', 0);
        a.loop = true;
        return a;
      })(),
      wasted: load('wasted.mp3', 1),
      fahh: load('fail-fahh.mp3', 0.7),
      trombone: load('fail-trombone.mp3', 0.9),
      wow: load('wow.mp3', 0.9),
      crowd: load('crash-crowd.mp3', 0.9),
    };
    sfx.current = createSfx();
    sfx.current?.setEnabled(soundOn.current);
  };

  const takeOff = useCallback(() => {
    const g = game.current;
    if (!ready || g.phase !== 'idle' || gone.current) return;
    /* The same game, not a new one: at rest it has been tracking the
       cruise's heading, attitude and height, which is where the dive starts. */
    const mode = playMode === 'ufo' && ufoUnlockedRef.current ? 'ufo' : 'airliner';
    if (mode !== playMode) setPlayMode(mode);
    g.mode = mode;
    g.flaps = 0;
    g.drive = 'forward';
    g.level = 'earth';
    setFlapLevel(0);
    setDrive('forward');
    setUfoGoal('Above the clouds');
    cameraLook.current.orbit = 0;
    makeSounds();
    g.phase = 'intro';
    g.phaseAt = performance.now();
    dealWeather(g);
    setWeather(g.weather);
    setPhase('intro');
  }, [playMode, setPlayMode, ready]);
  /**
   * The secondary control, on F or its button: the flaps' three detents on
   * the airliner, and on the saucer, its drive mode.
   */
  const cycleFlaps = useCallback(() => {
    const g = game.current;
    if (g.phase !== 'intro' && g.phase !== 'flying') return;
    if (g.mode === 'ufo') {
      setDrive(cycleDrive(g));
      return;
    }
    const next = g.flaps < 0.25 ? 0.5 : g.flaps < 0.75 ? 1 : 0;
    g.flaps = next;
    setFlapLevel(next);
  }, []);
  /* The afterburners: a key, or the button. */
  const boost = useCallback(() => {
    if (fireBoost(game.current)) sfx.current?.boost(BOOST.seconds);
  }, []);
  /* An arrow key, or Fly with no wallet installed: the card. */
  const start = useCallback(() => {
    if (!ready || game.current.phase !== 'idle' || gone.current) return;
    if (!wallet.address) {
      // Keyboard launch follows the same full-screen ride-selection path as Fly.
      makeSounds();
      setRidePickerOpen(true);
      return;
    }
    takeOff();
  }, [ready, wallet.address, takeOff]);
  /* A replay with a wallet already connected goes straight back up. */
  useEffect(() => {
    if (replay && ready && wallet.address && game.current.phase === 'idle' && !gone.current) takeOff();
  }, [replay, ready, wallet.address, takeOff]);
  const connectAndFly = useCallback(async () => {
    makeSounds();
    const address = await wallet.connect();
    if (address) {
      takeOff();
      return;
    }
    // Keep the user in the selector if the wallet was closed or unavailable.
    setRidePickerOpen(true);
  }, [wallet, takeOff]);
  /* The Fly button: straight to the wallet when there is one to ask. */
  const onFly = useCallback(() => {
    if (!ready || game.current.phase !== 'idle' || gone.current) return;
    setRidePickerOpen(true);
  }, [ready]);
  const confirmRide = useCallback(() => {
    if (playMode === 'ufo' && !ufoUnlocked) return;
    setRidePickerOpen(false);
    // The local preview is deliberately playable without a wallet so both
    // rides can be tested. The production path remains wallet-gated.
    if (localTestMode) {
      takeOff();
      return;
    }
    // Always use the shared connector when the visitor is not connected. This
    // lets Helius finish registering and open its own sign-in modal after the
    // pilot has selected a ride.
    if (wallet.address) start();
    else void connectAndFly();
  }, [playMode, ufoUnlocked, localTestMode, takeOff, wallet.address, start, connectAndFly]);
  /* Each wallet's own "open this page in my browser" link, for a phone with
     no wallet in the browser it is in. */
  const [walletLinks] = useState(() => {
    if (typeof window === 'undefined') return { phantom: '', solflare: '', backpack: '' };
    const here = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    return {
      phantom: `https://phantom.app/ul/browse/${here}?ref=${ref}`,
      solflare: `https://solflare.com/ul/v1/browse/${here}?ref=${ref}`,
      backpack: `https://backpack.app/ul/v1/browse/${here}?ref=${ref}`,
    };
  });
  const verifyWallet = useCallback(() => {
    makeSounds();
    void wallet.connect();
  }, [wallet]);

  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);
  const onFlying = useCallback(() => {
    setPhase('flying');
    // The server starts timing now; nothing is asked of anybody to start it.
    void startRun().then((id) => { runId.current = id; });
  }, []);
  const onFailure = useCallback((side: -1 | 1, cause: Cause, second: boolean) => {
    const feet = Math.round((game.current.blastAlt * FEET) / 100) * 100;
    setFailure((f) => (second && f ? { ...f, both: true, second: cause } : { side, cause, feet, both: false, second: null }));
    setBlasted(true);
    timers.current.push(window.setTimeout(() => setBlasted(false), 900));
    if (cause === 'lightning') {
      setStruck(true);
      timers.current.push(window.setTimeout(() => setStruck(false), 700));
    }
    if (!second) {
      setBonusPop(Math.round(game.current.bonus));
      timers.current.push(window.setTimeout(() => setBonusPop(null), 2800));
    }
  }, []);

  const onLogo = useCallback((n: number) => {
    const now = performance.now();
    const r = logoRun.current;
    r.run = now - r.at < LOGO_RUN * 1000 ? r.run + 1 : 1;
    r.at = now;
    sfx.current?.chime(r.run - 1);
    if (hud.logos.current) hud.logos.current.textContent = String(n);
    setLogoPop({ n, run: r.run });
    const id = window.setTimeout(() => setLogoPop((p) => (p && p.n === n ? null : p)), 1100);
    timers.current.push(id);
  }, [hud]);
  const onThunder = useCallback((metres: number) => sfx.current?.thunder(metres), []);

  const onUfoWarn = useCallback(() => sayUfo('warn', undefined, 4000), [sayUfo]);
  const onStrike = useCallback((side: -1 | 1) => {
    setWingHit(side);
    sayUfo('hit', side, 3200);
    setBlasted(true);
    setStruck(true);
    timers.current.push(window.setTimeout(() => setStruck(false), 700));
    timers.current.push(window.setTimeout(() => setBlasted(false), 900));
  }, [sayUfo]);
  /* UFO mode: the airline's own aeroplanes, coming for the saucer. */
  const onRamWarn = useCallback((bearing: number) => {
    sayUfo('ram-warn', undefined, 2600, fromWords(bearing));
    sfx.current?.chime(1);
  }, [sayUfo]);
  const onRamHit = useCallback((side: -1 | 1) => {
    sayUfo('ram-hit', side, 3200);
    sfx.current?.thunder(150);
    setBlasted(true);
    setScrambled(true);
    if (scrambleTimer.current !== null) window.clearTimeout(scrambleTimer.current);
    scrambleTimer.current = window.setTimeout(() => setScrambled(false), RAMMER.scrambleSeconds * 1000);
    timers.current.push(scrambleTimer.current);
    timers.current.push(window.setTimeout(() => setBlasted(false), 900));
  }, [sayUfo]);
  const onRamDodge = useCallback(() => {
    sayUfo('ram-dodged', undefined, 2400);
    const wow = sounds.current?.wow;
    if (wow) {
      wow.currentTime = 0;
      void wow.play().catch(() => {});
    }
  }, [sayUfo]);
  const onLevel = useCallback((level: Level) => {
    sayUfo('arrived', undefined, 3600, LEVELS[level].name);
    sfx.current?.chime(3);
    setStruck(true);
    timers.current.push(window.setTimeout(() => setStruck(false), 700));
  }, [sayUfo]);
  const onMark = useCallback((name: string) => setUfoGoal(name), []);
  const onThreaded = useCallback(() => {
    sayUfo('threaded', undefined, 2400);
    sfx.current?.chime(2);
  }, [sayUfo]);
  const onDodge = useCallback(() => {
    sayUfo('dodged', undefined, 2800);
    const wow = sounds.current?.wow;
    if (wow) {
      wow.currentTime = 0;
      void wow.play().catch(() => {});
    }
  }, [sayUfo]);

  /* The card, then the video: made as soon as the flight is over, so they
     are there by the time anybody asks for them. */
  const makeShare = useCallback(async (flight: SharedFlight) => {
    shared.current = flight;
    hosted.current = null;
    videoReady.current = null;
    const card = await composeCard(shot.current, flight);
    if (!card) return;
    const still = await cardJpeg(card);
    const canRecord = videoType() !== null;
    setShare({ still, video: null, making: canRecord });
    if (!canRecord) return;
    const ctl = new AbortController();
    recording.current = ctl;
    const { logo } = await cardAssets();
    videoReady.current = recordVideo(card, logo, {
      signal: ctl.signal,
      progress: (p) => shareProgress.current?.style.setProperty('--p', p.toFixed(3)),
    });
    const video = await videoReady.current;
    if (!ctl.signal.aborted) setShare((s) => ({ ...s, video, making: false }));
  }, []);

  /* Post it. A phone hands the video (or the card, if the video is not
     ready) to its share sheet, which puts it in a post in the X app. A
     desktop opens X with the post written and the card's page linked —
     X shows a link's picture, and takes nothing else — and saves the
     video beside it, to be dropped in. */
  const onShare = useCallback(() => {
    holdLeave();
    const flight = shared.current;
    if (!flight) {
      armLeave();
      return;
    }
    const text = shareText(flight);
    /* Connected to X: the Worker posts it, the video if X takes it and the
       card if not. Anything it cannot do ends at X's own compose box, one
       tap away, which is what everybody else gets. */
    if (xs?.available && xs.username !== null) {
      setXBusy(true);
      setShareNote({ text: share.making ? 'Finishing the video, then posting…' : 'Posting to X…' });
      void (async () => {
        const video = share.video ?? (share.making && videoReady.current ? await videoReady.current : null);
        const done = await postToX(`${text}\n${SITE_URL}`, video, share.still);
        if (done.posted) {
          setShareNote({ text: done.media === 'video' ? 'Posted the video to X' : 'Posted to X', href: done.url, label: 'View post' });
        } else {
          if (done.reconnect) setXs((s) => (s ? { ...s, username: null } : s));
          const link = hosted.current ?? (share.still ? await hostCard(share.still, runId.current) : null) ?? SITE_URL;
          hosted.current = link;
          setShareNote({ text: `Could not post it directly. ${done.reason}`, href: intentUrl(text, link), label: 'Post it on X yourself', error: true });
        }
        setXBusy(false);
        armLeave();
      })();
      return;
    }
    const file = share.video ?? share.still;
    if (file && canShareFile(file)) {
      void shareFile(file, text).finally(armLeave);
      return;
    }
    // Off to X in another tab: the count starts again for when they come back.
    armLeave();
    if (share.video) {
      saveFile(share.video);
      setShareNote({ text: 'Video saved · add it to your post' });
    }
    // Straight to X with the site's link, where the domain cannot serve the card's own page.
    if (!hostsCards) {
      const to = intentUrl(text, SITE_URL);
      const tab = window.open(to, '_blank');
      if (tab) tab.opener = null;
      else window.location.href = to;
      return;
    }
    const tab = window.open('about:blank', '_blank');
    void (async () => {
      const link = hosted.current ?? (share.still ? await hostCard(share.still, runId.current) : null) ?? SITE_URL;
      hosted.current = link;
      const to = intentUrl(text, link);
      if (tab && !tab.closed) {
        tab.opener = null;
        tab.location.href = to;
      } else {
        window.location.href = to;
      }
    })();
  }, [share, xs, holdLeave, armLeave]);
  const onCrash = useCallback((metres: number) => {
    const g = game.current;
    const after = g.failed ? (performance.now() - g.failedAt) / 1000 : null;
    // Capture mode can name the score, for the high-score shot; never otherwise.
    if (CAPTURE && captureState.highScore !== null) g.score = captureState.highScore;
    const score = Math.round(g.score);
    const beaten = score > readBest();
    if (beaten) keepBest(score);
    setResult({ metres, after, score, climb: g.failed ? g.climbTime : 0, survived: after ?? 0, best: beaten });
    setPhase('crashed');
    void makeShare({
      score,
      best: beaten,
      survived: after,
      km: (metres / 1000).toFixed(1),
      cause: g.failed ? g.causes[0] : null,
      engine: g.failed === -1 ? 1 : g.failed === 1 ? 2 : null,
      both: g.both,
      secondCause: g.both ? g.causes[1] : null,
      feet: g.failed ? Math.round((g.blastAlt * FEET) / 100) * 100 : null,
      ufo: g.wingLost !== 0,
      dodged: g.dodged,
    });
    const s = sounds.current;
    if (s) {
      s.blast.pause();
      s.lightning.pause();
      s.crowd.pause();
      const loss = pickLoss();
      const a = s[loss.sound];
      a.currentTime = loss.from;
      if (loss.wait) timers.current.push(window.setTimeout(() => void a.play().catch(() => {}), loss.wait * 1000));
      else void a.play().catch(() => {});
    }
    armLeave();
  }, [armLeave, makeShare]);

  /* The board: read once for the landing, and again after a post. */
  useEffect(() => {
    const ctl = new AbortController();
    void fetchBoard(ctl.signal).then((rows) => { if (!ctl.signal.aborted) setBoard(rows); });
    return () => ctl.abort();
  }, []);

  /* Posting a score. Wanting to post stops the site taking over on its own;
     a wallet is connected if there is none yet, then asked to sign a short
     message naming the score — never a transaction. */
  const signAndPost = useCallback(async (address: string) => {
    if (!result || !runId.current) {
      armLeave();
      return;
    }
    setPost({ state: 'signing' });
    try {
      const posted = await postScore({
        address, run: runId.current, score: result.score, survived: result.survived, climb: result.climb, sign: wallet.signMessage,
      });
      setPost({ state: 'done', posted });
      void fetchBoard().then(setBoard);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'That score could not be posted.';
      setPost({ state: 'error', message: /reject|denied|cancel/i.test(message) ? 'Not signed. Nothing posted.' : message });
    }
    armLeave();
  }, [result, wallet.signMessage, armLeave]);
  const onPost = useCallback(async () => {
    holdLeave();
    if (wallet.address) {
      void signAndPost(wallet.address);
      return;
    }
    setPost({ state: 'connecting' });
    const address = await wallet.connect().catch(() => null);
    if (address) void signAndPost(address);
    else {
      setPost({ state: 'error', message: 'No wallet. Nothing posted.' });
      armLeave();
    }
  }, [wallet, signAndPost, holdLeave, armLeave]);

  /* The keys. An arrow on the landing takes the controls straight away —
     the hint says to press one — Escape goes in at any point in the game,
     and Enter goes in from the landing when nothing else has the focus. */
  useEffect(() => {
    const held = new Set<string>();
    const read = () => {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const k = KEYS[code];
        if (k) { x += k[0]; y += k[1]; }
      }
      game.current.keys = { x: clampUnit(x), y: clampUnit(y) };
    };
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (splashUp.current) {
        // A key on the splash clears it, and does nothing else.
        if (KEYS[e.code] || e.key === 'Enter' || e.key === ' ') e.preventDefault();
        clearSplash();
        return;
      }
      if (ridePickerUp.current) {
        // The hangar owns the launch flow; Escape closes it without starting a run.
        if (e.key === 'Escape') setRidePickerOpen(false);
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          chooseRide('airliner');
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          chooseRide('ufo');
        }
        return;
      }
      // The high scores window closes itself on Escape; everything else is its own.
      if (scoresUp.current) return;
      if (BOOST_KEYS.has(e.code) && game.current.phase !== 'idle') {
        e.preventDefault();
        if (!e.repeat) boost();
        return;
      }
      if (e.code === 'KeyF' && game.current.phase !== 'idle') {
        e.preventDefault();
        if (!e.repeat) cycleFlaps();
        return;
      }
      if (KEYS[e.code]) {
        e.preventDefault();
        held.add(e.code);
        read();
        if (game.current.phase === 'idle') start();
        return;
      }
      if (e.key === 'Escape' && game.current.phase !== 'idle') leave();
      else if (e.key === 'Enter' && game.current.phase === 'idle' && document.activeElement === document.body) leave();
    };
    const up = (e: KeyboardEvent) => {
      if (held.delete(e.code)) read();
    };
    const drop = () => {
      held.clear();
      read();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', drop);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', drop);
    };
  }, [start, leave, clearSplash, boost, cycleFlaps, chooseRide]);

  /* The stick, for a touch screen (or a mouse): press anywhere and drag.
     Up climbs, down dives, sideways banks, measured from where the press
     began, with the stick drawn there so the thumb can see what it is doing. */
  const grip = useRef<{ id: number; x: number; y: number } | null>(null);
  const cameraGrip = useRef<{ id: number; x: number } | null>(null);
  const stickEl = useRef<HTMLDivElement>(null);
  const knobEl = useRef<HTMLDivElement>(null);
  const steer = (dx: number, dy: number) => {
    game.current.stick = { x: deadZone(clampUnit(dx / STICK_REACH)), y: deadZone(clampUnit(-dy / STICK_REACH)) };
    const len = Math.hypot(dx, dy);
    const k = len > STICK_REACH ? STICK_REACH / len : 1;
    if (knobEl.current) knobEl.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = game.current;
    if (e.button === 2 && (g.phase === 'intro' || g.phase === 'flying')) {
      cameraGrip.current = { id: e.pointerId, x: e.clientX };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if ((g.phase !== 'intro' && g.phase !== 'flying') || grip.current) return;
    if ((e.target as HTMLElement).closest('button, a')) return;
    grip.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = stickEl.current;
    if (el) {
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      el.classList.add('is-on');
    }
    steer(0, 0);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const c = cameraGrip.current;
    if (c && c.id === e.pointerId) {
      cameraLook.current.orbit = Math.max(-75, Math.min(75, cameraLook.current.orbit - (e.clientX - c.x) * 0.35));
      c.x = e.clientX;
      return;
    }
    const g = grip.current;
    if (g && g.id === e.pointerId) steer(e.clientX - g.x, e.clientY - g.y);
  };
  const letGo = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (cameraGrip.current?.id === e.pointerId) {
      cameraGrip.current = null;
      return;
    }
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    game.current.stick = { x: 0, y: 0 };
    stickEl.current?.classList.remove('is-on');
  };

  /* The picture lost in the middle of a flight — iOS reclaiming the GPU,
     most often — leaves a flight that can never end: carry on into the
     site, which builds a picture of its own. After the crash the count
     already does. */
  useEffect(() => {
    if (failed && (phase === 'intro' || phase === 'flying')) leave();
  }, [failed, phase, leave]);

  useEffect(() => {
    if (!CAPTURE) return;
    Object.assign(captureState.app, { fly: onFly, leave });
  }, [onFly, leave]);

  const inGame = phase !== 'idle';
  const km = result ? (result.metres / 1000).toFixed(1) : '0';
  /** After the crash: whether this flight can still go on the board, and whether there is a wallet to do it with. */
  const postable = !!result && !practice && hasBoard && board !== null && !!runId.current && result.score > 0 && post.state !== 'done';
  const noWallet = wallet.unavailable && !wallet.address;
  /** Engines are numbered from the left: 1 is the port one, 2 the starboard. */
  const engineNo = failure?.side === -1 ? 1 : 2;
  const engineState = (side: -1 | 1): EngineState => {
    if (!failure) return { state: 'run' };
    if (failure.side === side) return { state: failure.cause };
    return { state: failure.both ? failure.second ?? 'blast' : 'run' };
  };
  const engines: [EngineState, EngineState] = [engineState(-1), engineState(1)];
  /** The seat overview is up: the words beside or under it make room. */
  const showOverview = overview && !inGame && !ridePickerOpen && !scoresOpen;

  return (
    <div
      className={`sa-landing is-${phase}${leaving ? ' is-leaving' : ''}${ready ? ' is-ready' : ''}${
        failure ? ' is-failing' : ''}${blasted ? ' is-blast' : ''}${splash === 'on' ? ' is-splash' : ''}${showOverview ? ' has-ov' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sa-landing__scene">
        {!failed && (
          <Suspense fallback={null}>
            <LandingScene
              feed={feed}
              sky={sky}
              band={band}
              controls={controls}
              taken={taken}
              playing={inGame}
              boost={boostStrength(boosts)}
              game={game}
              cameraLook={cameraLook}
              hud={hud}
              sounds={sounds}
              shot={shot}
              onReady={onReady}
              onFail={onFail}
              onFlying={onFlying}
              onFailure={onFailure}
              onUfoWarn={onUfoWarn}
              onStrike={onStrike}
              onDodge={onDodge}
              onRamWarn={onRamWarn}
              onRamHit={onRamHit}
              onRamDodge={onRamDodge}
              onThreaded={onThreaded}
              onLevel={onLevel}
              onMark={onMark}
              onCrash={onCrash}
              onLogo={onLogo}
              onThunder={onThunder}
            />
          </Suspense>
        )}
      </div>
      <div className="sa-landing__scrim" aria-hidden />

      <header className="sa-landing__top">
        {/* The airliner crosses the brand here too, over the night, until
            the game starts and the top of the screen is the pilot's. */}
        <span className="sa-landing__brandbox">
          <Wordmark className="sa-landing__brand" />
          {!inGame && <Flyover />}
        </span>
        <span className="sa-landing__live">
          <span className="sa-live" aria-hidden />
          <span className="sa-landing__seg">Live</span>
          <span className="sa-landing__seg">{formatCap(marketCap)}</span>
        </span>
        {!inGame && <DocsLink night />}
      </header>

      {!inGame && !ridePickerOpen && (
        <main className="sa-landing__hero">
          <h1 className="sa-landing__title">
            Hold more.
            <br />
            Fly higher.
          </h1>
          <p className="sa-landing__lead">
            {playMode === 'ufo'
              ? 'Experimental saucer mode is armed. Chase the horizon, dodge the ground, and push for Mars.'
              : 'Market cap is altitude. The biggest holders sit up front.'}
          </p>
          <div className="sa-landing__actions">
            <button type="button" onClick={leave} className="sa-landing__enter">
              See who’s on board <span aria-hidden>→</span>
            </button>
            {!failed && (
              <button type="button" onClick={onFly} disabled={!ready} className="sa-landing__fly">
                <svg viewBox="0 0 24 24" aria-hidden className="sa-landing__fly-icon">
                  <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
                </svg>
                {playMode === 'ufo' ? (wallet.address ? 'Launch UFO' : 'Connect & launch') : (wallet.address ? 'Fly' : 'Connect & fly')}
              </button>
            )}
            {/* Boost the token on DexScreener — its page, where the Boost
                button is. While a boost runs, the plane behind is on
                afterburner, so this says so. */}
            <a
              href={DEXSCREENER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`sa-pilots sa-pilots--boost${boosts > 0 ? ' is-on' : ''}${boosts >= GOLDEN_TICKER ? ' is-golden' : ''}`}
              title={boosts > 0
                ? `${boosts.toLocaleString('en-US')} Boosts running on DexScreener. More burn harder: tap the yellow Boost button there.`
                : 'Boost the token on DexScreener (the yellow Boost button) and the plane goes on afterburner'}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="sa-pilots__icon sa-pilots__flame">
                <path d="M13.5 1.5s1 3.2-1.6 6.1C9.6 10.2 7 12 7 15.6A5 5 0 0 0 12 21a5 5 0 0 0 5-5.3c0-2.4-1.3-4-1.3-4s-.4 2.1-2 2.7c0 0 1.4-4.5-.2-9.4z" />
              </svg>
              {boosts > 0 ? <>Boosted <span className="sa-pilots__count">×{boosts.toLocaleString('en-US')}</span></> : 'Boost'}
            </a>
            {/* The board, on the same row as the way in and the controls but
                apart from them at its far end: the one thing here that is not
                a way forward. */}
            {hasBoard && (
              <button
                type="button"
                onClick={openScores}
                onPointerEnter={prefetchScores}
                onFocus={prefetchScores}
                aria-haspopup="dialog"
                aria-expanded={scoresOpen}
                className="sa-pilots sa-pilots--scores"
              >
                <DeckIcon name="trophy" className="sa-pilots__icon" />
                Scores
              </button>
            )}
            <button
              type="button"
              onClick={onSoundToggle}
              aria-pressed={soundEnabled}
              className="sa-pilots sa-pilots--sound"
              title={soundEnabled ? 'Sound on' : 'Sound off'}
              aria-label={soundEnabled ? 'Sound on' : 'Sound off'}
            >
              <DeckIcon name={soundEnabled ? 'sound' : 'mute'} className="sa-pilots__icon" />
              <span className="sa-pilots__label">{soundEnabled ? 'Sound' : 'Muted'}</span>
            </button>
          </div>
          {!failed && (
            <p className="sa-landing__hint">
              {!ready
                ? 'Warming up…'
                : `${!wallet.address ? 'Solana wallet required' : playMode === 'ufo' ? (touch ? 'Drag to steer · tap Drive' : 'WASD to steer · F drive mode') : touch ? 'Drag to fly · tap flaps' : 'WASD / left stick to fly · F flaps'}\u00a0· ${playMode === 'ufo' ? 'climb to the moon and Mars' : `climb to ${goalFeet.toLocaleString('en-US')} ft`}`}
            </p>
          )}
        </main>
      )}
      {ridePickerOpen && !inGame && (
        <div className="sa-ride-modal" role="dialog" aria-modal="true" aria-label="Choose your ride">
          <div className="sa-ride-modal__ceiling" aria-hidden>
            <i /><i /><i /><i /><i /><i />
          </div>
          <div className="sa-ride-modal__hangar-lines" aria-hidden />
          <div className="sa-ride-modal__content">
            <div className="sa-ride-modal__topline">
              <span><i aria-hidden /> HANGAR 01 · FLIGHT DECK</span>
              <button type="button" className="sa-ride-modal__close" onClick={() => setRidePickerOpen(false)} aria-label="Close ride selector">×</button>
            </div>
            <div className="sa-ride-modal__hero-copy">
              <p>Pre-flight systems online</p>
              <h1>Select your aircraft</h1>
              <span>Configure your ride before entering the climb.</span>
            </div>
            <AircraftCarousel
              fullscreen
              mode={playMode}
              onModeChange={chooseRide}
              ufoUnlocked={ufoUnlocked}
              tokenBalance={tokenBalance}
              balanceLoading={tokenBalanceLoading}
              walletConnected={Boolean(wallet.address)}
              onConnect={verifyWallet}
            />
            <div className="sa-ride-modal__launch-console">
              <div>
                <span className="sa-ride-modal__console-label">Selected loadout</span>
                <strong>{playMode === 'ufo' ? 'UFO INTERCEPTOR' : 'SA350 · FLAGSHIP'}</strong>
                <small>{playMode === 'ufo' ? 'Dash any way · dodge airliners · climb to the moon and Mars' : 'Flaps, boost and engine-out recovery'}</small>
              </div>
              <button type="button" className="sa-ride-modal__launch" onClick={confirmRide} disabled={playMode === 'ufo' && !ufoUnlocked} autoFocus>
                <span>Confirm loadout</span>
                <strong>{playMode === 'ufo' && !ufoUnlocked ? 'Hold 1M $SEAT to unlock' : wallet.address ? 'Launch flight →' : 'Connect & launch →'}</strong>
              </button>
            </div>
            {/* Connecting failed, or there is nothing to connect: say so, and where to get one. */}
            {!wallet.address && !localTestMode && (wallet.unavailable || wallet.error) && (
              <div className="sa-ride-modal__wallet" role="alert">
                {wallet.unavailable ? (
                  <>
                    <p>{touch ? 'No wallet here. Open this page in your wallet’s browser.' : 'No wallet found. Install Phantom, Solflare, Backpack or Nightly, then come back.'}</p>
                    <div className="sa-ride-modal__wallet-links">
                      {touch ? (
                        <>
                          <a href={walletLinks.phantom}>Open in Phantom</a>
                          <a href={walletLinks.solflare}>Open in Solflare</a>
                          <a href={walletLinks.backpack}>Open in Backpack</a>
                        </>
                      ) : (
                        <>
                          <a href="https://phantom.com" target="_blank" rel="noopener noreferrer">Get Phantom</a>
                          <a href="https://solflare.com" target="_blank" rel="noopener noreferrer">Get Solflare</a>
                          <a href="https://backpack.app" target="_blank" rel="noopener noreferrer">Get Backpack</a>
                          <a href="https://nightly.app" target="_blank" rel="noopener noreferrer">Get Nightly</a>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p>{wallet.error}</p>
                )}
              </div>
            )}
            <p className="sa-ride-modal__hint"><kbd>←</kbd><kbd>→</kbd> rotate fleet · choose a bay · confirm to taxi</p>
          </div>
        </div>
      )}
      {showOverview && (
        <SeatOverview manifest={manifest} banners={banners} onClaim={claim} onBrowse={leave} boosted={boosts > 0} />
      )}
      {/* The airline elsewhere: one even row along the foot of the screen. */}
      {!inGame && !ridePickerOpen && <SocialLinks night className="sa-landing__social" />}
      {/* Its own Suspense, as in the site: nothing shows while the chunk loads. */}
      {scoresOpen && (
        <Suspense fallback={null}>
          <ScoresDialog address={wallet.address} onClose={closeScores} />
        </Suspense>
      )}

      {inGame && (
        <div className="sa-hud">
          <div className="sa-hud__top">
            {/* One slim strip: the height, the brief (or what has gone wrong), and the points. */}
            <div
              className={`sa-strip${failure || wingHit || scrambled ? ` is-alert${
                failure ? (failure.cause === 'lightning' && !failure.both ? ' is-struck' : '') : ' is-ufo'}` : ''}`}
            >
              <div className="sa-strip__cell">
                <span className="sa-strip__key">Alt</span>
                <span className="sa-strip__val">
                  <span ref={hud.alt}>—</span>
                  <small>ft</small>
                </span>
              </div>
              <div className="sa-strip__mid">
                {failure || wingHit || scrambled ? (
                  <span className="sa-strip__alert" role="alert">
                    <span className="sa-strip__key">
                      {!failure
                        ? (wingHit ? 'UFO strike' : 'Airliner impact')
                        : failure.both ? 'Both engines' : failure.cause === 'lightning' ? 'Lightning strike' : 'Master warning'}
                    </span>
                    <span className="sa-strip__alarm">
                      {!failure ? (wingHit ? 'Wing damage' : 'Field scrambled') : failure.both ? 'ENG 1 · 2 fire' : `ENG ${engineNo} fire`}
                    </span>
                  </span>
                ) : (
                  <>
                    <span className="sa-strip__track" aria-hidden>
                      <span ref={hud.bar} className="sa-strip__bar" />
                    </span>
                    {playMode === 'ufo' ? (
                      <span className="sa-strip__goal sa-strip__goal--world" title={`Next: ${ufoGoal}`}>{GOAL_SHORT[ufoGoal] ?? ufoGoal}</span>
                    ) : (
                      <span className="sa-strip__goal">
                        {goalFeet.toLocaleString('en-US')}
                        <small>ft</small>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="sa-strip__cell sa-strip__cell--score">
                <span className="sa-strip__key">
                  Score <span ref={hud.rate} className="sa-hud__rate" />
                </span>
                <span ref={hud.score} className="sa-strip__val sa-strip__val--score">0</span>
              </div>
            </div>
            <div className="sa-hud__chips">
              <span className="sa-hud__chip sa-hud__chip--logos" title="Logos flown through">
                <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="sa-hud__chip-logo" />
                <span ref={hud.logos}>0</span>
              </span>
              {playMode === 'ufo' && <span className="sa-hud__chip sa-hud__chip--ufo" title="The pulse field bends your flight path">Pulse field</span>}
              {weather && weather !== 'clear' && (
                <span className={`sa-hud__chip sa-hud__chip--${weather}`}>
                  {weather === 'tornado' ? 'Tornado warning' : weather === 'storm' ? 'Thunderstorm' : 'Rain'}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={leave} className="sa-hud__skip">
            Enter <span aria-hidden>→</span>
          </button>
          <p ref={hud.warn} className="sa-hud__warn" aria-hidden>
            Pull up
          </p>
          <p ref={hud.vortex} className="sa-hud__warn sa-hud__warn--vortex" aria-hidden>
            Vortex
          </p>
          <p ref={hud.stall} className="sa-hud__warn sa-hud__warn--stall" aria-hidden>
            Stall
          </p>
          {phase === 'intro' && <p className="sa-hud__note">Dropping to the deck…</p>}
          {ufoCaption && (
            <p
              key={ufoCaption.kind}
              className={`sa-hud__bonus sa-hud__bonus--ufo is-${ufoCaption.kind}`}
              aria-live="assertive"
            >
              {{
                warn: 'Dodge!',
                hit: 'UFO strike',
                dodged: `Dodged +${UFO.dodgeBonus.toLocaleString('en-US')}`,
                'ram-warn': 'Airliner inbound',
                'ram-hit': 'Rammed',
                'ram-dodged': `Near miss +${RAMMER.bonus.toLocaleString('en-US')}`,
                threaded: `Threaded +${TWISTER.bonus.toLocaleString('en-US')}`,
                arrived: ufoCaption.from ?? '',
              }[ufoCaption.kind]}
              <small>
                {{
                  warn: 'climb, dive or bank away',
                  hit: `${ufoCaption.side === -1 ? 'left' : 'right'} wing gone`,
                  dodged: 'it missed',
                  'ram-warn': `${ufoCaption.from ?? ''} · boost to dash clear`,
                  'ram-hit': 'field scrambled · controls unstable',
                  'ram-dodged': 'it missed',
                  threaded: 'past the vortex',
                  arrived: ufoCaption.from === 'Mars' ? 'the last world · keep climbing' : 'new world · keep climbing',
                }[ufoCaption.kind]}
              </small>
            </p>
          )}
          {logoPop && !ufoCaption && (
            <p key={`logo-${logoPop.n}`} className="sa-hud__logo-pop" aria-live="polite">
              +{LOGOS.points.toLocaleString('en-US')}
              <small>{logoPop.run > 1 ? `${logoPop.run} in a row · boost +` : 'logo · boost +'}</small>
            </p>
          )}
          {bonusPop !== null && !ufoCaption && (
            <p className="sa-hud__bonus" aria-live="polite">
              +{bonusPop.toLocaleString('en-US')}
              <small>
                {failure && failure.feet < goalFeet
                  ? `engine out at ${failure.feet.toLocaleString('en-US')} ft`
                  : `made it to ${goalFeet.toLocaleString('en-US')} ft`}
              </small>
            </p>
          )}
          {failure && phase === 'flying' && (
            <p key="mayday" className="sa-hud__help sa-hud__help--mayday">
              {playMode === 'ufo' ? (touch ? 'Tap boost to dash' : 'Space to dash') : (touch ? 'Tap boost to climb out' : 'Space to boost')} · ride updrafts ×1.5 · wings level ×1.5 · under 500 ft ×2
            </p>
          )}
          {!failure && (phase === 'intro' || phase === 'flying') && (
            <p className="sa-hud__help">
              {touch ? (
                playMode === 'ufo' ? 'Drag to steer · Drive changes how · boost dashes the way you drag' : 'Drag up to climb · sideways to turn · tap flaps · fly through logos'
              ) : (
                <>
                  {playMode === 'ufo'
                    ? <><kbd>WASD</kbd> steer · <kbd>F</kbd> drive mode · <kbd>Space</kbd> dash the way you steer · <kbd>right mouse</kbd> look</>
                    : <><kbd>WASD</kbd> / <kbd>left stick</kbd> fly · <kbd>F</kbd> flaps · <kbd>right mouse</kbd> / <kbd>right stick</kbd> look · <kbd>Space</kbd> boost · fly through logos</>}
                </>
              )}
            </p>
          )}
        </div>
      )}

      {inGame && phase !== 'crashed' && (playMode === 'ufo'
        ? <UfoInstruments hud={hud} drive={drive} scrambled={scrambled} />
        : <FlightInstruments hud={hud} engines={engines} />)}
      {inGame && phase !== 'crashed' && (
        <button
          ref={hud.boost}
          type="button"
          className="sa-boost"
          aria-label="Boost"
          title="Boost (Space)"
          disabled={phase !== 'flying'}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            boost();
          }}
          onClick={(e) => {
            // A key on the focused button: a pointer has already fired it on the way down.
            if (e.detail === 0) boost();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="sa-boost__icon">
            <path d="M13.5 1.5s1 3.2-1.6 6.1C9.6 10.2 7 12 7 15.6A5 5 0 0 0 12 21a5 5 0 0 0 5-5.3c0-2.4-1.3-4-1.3-4s-.4 2.1-2 2.7c0 0 1.4-4.5-.2-9.4zM12 19.2a2.6 2.6 0 0 1-2.6-2.7c0-1.8 1.6-2.7 2.3-4.4.9 1.4 2.9 2.5 2.9 4.4a2.6 2.6 0 0 1-2.6 2.7z" />
          </svg>
          <span className="sa-boost__label">Boost</span>
          <span className="sa-boost__tank" aria-hidden>
            {Array.from({ length: BOOST.charges }, (_, i) => <span key={i} className="sa-boost__pip" style={{ ['--i' as string]: i }} />)}
          </span>
        </button>
      )}
      {inGame && phase !== 'crashed' && playMode === 'ufo' && (
        /* The saucer has no flaps: the same button picks what its stick does. */
        <button
          type="button"
          className={`sa-flaps sa-flaps--drive is-${drive}`}
          aria-label={`Drive mode: ${DRIVE_NAME[drive].long}. Change`}
          title="Drive mode (F)"
          disabled={phase !== 'flying' && phase !== 'intro'}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            cycleFlaps();
          }}
          onClick={(e) => {
            if (e.detail === 0) cycleFlaps();
          }}
        >
          <span className="sa-flaps__wing" aria-hidden>{DRIVE_NAME[drive].icon}</span>
          <span className="sa-flaps__label">Drive</span>
          <strong>{DRIVE_NAME[drive].short}</strong>
          <span className="sa-flaps__detents" aria-hidden>
            {DRIVES.map((d) => <i key={d} className={d === drive ? 'is-on' : undefined} />)}
          </span>
        </button>
      )}
      {inGame && phase !== 'crashed' && playMode !== 'ufo' && (
        <button
          type="button"
          className={`sa-flaps${flapLevel > 0 ? ' is-deployed' : ''}${flapLevel === 1 ? ' is-full' : ''}`}
          aria-label={`Flaps ${flapLevel === 0 ? 'up' : flapLevel === 0.5 ? 'half' : 'full'}`}
          aria-pressed={flapLevel > 0}
          title="Flaps (F)"
          disabled={phase !== 'flying' && phase !== 'intro'}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            cycleFlaps();
          }}
          onClick={(e) => {
            if (e.detail === 0) cycleFlaps();
          }}
        >
          <span className="sa-flaps__wing" aria-hidden>⌁</span>
          <span className="sa-flaps__label">Flaps</span>
          <strong>{flapLevel === 0 ? 'UP' : flapLevel === 0.5 ? '½' : 'FULL'}</strong>
          <span className="sa-flaps__track" aria-hidden><span style={{ transform: `scaleX(${flapLevel})` }} /></span>
        </button>
      )}
      {blasted && !struck && <div className="sa-landing__blast" aria-hidden />}
      {struck && <div className="sa-landing__strike" aria-hidden />}
      {phase === 'crashed' && <div className="sa-landing__flash" aria-hidden />}
      {phase === 'crashed' && <div className="sa-landing__redout" aria-hidden />}

      {result && (
        <div className="sa-landing__end sa-landing__end--crash" role="status">
          <div className="sa-wasted">
            <Wasted className="sa-wasted__word" />
          </div>
          <div className="sa-landing__end-after">
            {/* What the flight came to: the points, and what they were made of. */}
            <div className="sa-landing__tally">
              <p className="sa-landing__score">
                {result.score.toLocaleString('en-US')}
                {result.best && result.score > 0 && <span className="sa-landing__best">New best</span>}
              </p>
              <p className="sa-landing__end-note">
                {result.after !== null
                  ? `${Math.round(result.after)} s ${failure?.both ? '· both engines lost' : 'on one engine'}`
                  : `${km} km flown`}
              </p>
            </div>
            {/* Where it stands, one line of it at most: the board's answer, or why there is none. */}
            {post.state === 'done' && (
              <p className="sa-landing__posted" role="status">
                {post.posted.improved ? 'On the board' : 'Best still stands'}
                {post.posted.rank !== null ? ` · #${post.posted.rank}` : ''} · best {post.posted.best.toLocaleString('en-US')}
              </p>
            )}
            {post.state === 'error' && <p className="sa-landing__posted is-error" role="alert">{post.message}</p>}
            {practice && <p className="sa-landing__posted">Practice run · not posted</p>}
            {postable && noWallet && <p className="sa-landing__posted">Install a Solana wallet to post</p>}
            {/* Buttons only: the way onto the board, the way to X, and the way in, last and widest. */}
            <div className="sa-landing__end-actions">
              {postable && !noWallet && (
                <button
                  type="button"
                  onClick={() => void onPost()}
                  disabled={post.state === 'connecting' || post.state === 'signing'}
                  className="sa-landing__post"
                >
                  {post.state === 'connecting'
                    ? 'Connecting…'
                    : post.state === 'signing'
                      ? 'Check your wallet…'
                      : wallet.address
                        ? 'Sign & post'
                        : 'Connect & post'}
                </button>
              )}
              {share.still && (
                <button
                  type="button"
                  onClick={onShare}
                  disabled={xBusy}
                  aria-label="Post on X"
                  className={`sa-landing__share${share.making ? ' is-making' : ''}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="sa-landing__x">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Post
                  <span ref={shareProgress} className="sa-landing__share-progress" aria-hidden />
                </button>
              )}
              <button type="button" onClick={again} className="sa-landing__again">
                Play again
              </button>
              <button
                type="button"
                onClick={leave}
                className={`sa-landing__enter${counting ? ' is-counting' : ''}`}
                style={{ ['--hold' as string]: `${END_HOLD}ms` }}
              >
                Board now{counting ? ` · ${secondsLeft}s` : ''} <span aria-hidden>→</span>
              </button>
            </div>
            {counting && (
              <p className="sa-landing__fine sa-landing__countdown" role="timer" aria-live="off">
                Heading into the site in {secondsLeft}s · or play again
              </p>
            )}
            {shareNote && (
              <p className={`sa-landing__posted${shareNote.error ? ' is-error' : ''}`} role="status">
                {shareNote.text}
                {shareNote.href && (
                  <>
                    {' · '}
                    <a href={shareNote.href} target="_blank" rel="noopener noreferrer">{shareNote.label}</a>
                  </>
                )}
              </p>
            )}
            {share.still && xs?.available && (
              <p className="sa-landing__fine sa-landing__xlink">
                {xs.username !== null ? (
                  <>
                    Posting as {xs.username ? `@${xs.username}` : 'your X account'}{' · '}
                    <button type="button" onClick={() => void disconnectX().then(() => setXs((s) => (s ? { ...s, username: null } : s)))}>
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { holdLeave(); connectX(); }}>Connect X</button>
                    {xs.media === 'video' ? ' to post the video straight from here.' : ' to post straight from here.'}
                  </>
                )}
              </p>
            )}
            {postable && !noWallet && post.state === 'idle' && (
              <p className="sa-landing__fine">Signs a message. No transaction.</p>
            )}
          </div>
        </div>
      )}

      <div ref={stickEl} className="sa-stick" aria-hidden>
        <div ref={knobEl} className="sa-stick__knob" />
      </div>

      {splash !== 'off' && (
        <div
          className={`sa-splash${splash === 'fading' ? ' is-fading' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            // The docs link is a way out, not a way past: let it be clicked.
            if (!(e.target as HTMLElement).closest('a')) clearSplash();
          }}
        >
          <div className="sa-splash__board" aria-hidden>
            <SplitFlapBoard
              phrases={phrases}
              hold={SPLASH_PHRASE_HOLD}
              firstHold={SPLASH_FIRST_HOLD}
              loop={false}
              onLanded={onSplashLanded}
            />
          </div>
          <p className="sa-splash__brand" aria-hidden>
            <Wordmark />
          </p>
          <div className="sa-splash__docs">
            <DocsLink night />
          </div>
        </div>
      )}
    </div>
  );
}
