import { createRef, lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CAPTURE, captureState } from '../capture/flag';
import DocsLink from './DocsLink';
import SocialLinks from './SocialLinks';
import { DeckIcon } from './InstrumentDeck';
import Wordmark from './Wordmark';
import Flyover from './Flyover';
import SplitFlapBoard from './SplitFlapBoard';
import Wasted from './Wasted';
import { SPLASH_BETWEEN, SPLASH_FIRST, SPLASH_LAST } from '../content/cabin';
import type { FlightFeed } from '../lib/flightFeed';
import { formatCap, type BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import type { ManualControls } from '../lib/manualControls';
import { blastAltitude, clampUnit, FEET, fireBoost, GAME, newGame, type Cause, type Phase } from '../lib/landingGame';
import {
  canShareFile, cardAssets, cardJpeg, composeCard, hostCard, hostsCards, intentUrl, saveFile, shareFile, shareText, SITE_URL,
  type SharedFlight,
} from '../lib/shareCard';
import { recordVideo, videoType } from '../lib/shareVideo';
import { connectX, disconnectX, onXLinkChange, postToX, xStatus, type XStatus } from '../lib/xPost';
import FlightInstruments, { type EngineState } from './FlightInstruments';
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
/** The fade onto the landing; `.sa-splash` times its transition to it. */
const SPLASH_FADE = 800;

export default function Landing({ feed, sky, band, marketCap, controls, taken, wallet, onEnter, soundEnabled, onSoundToggle }: LandingProps) {
  const [phase, setPhase] = useState<Phase>('idle');
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
  /** `?mayday` puts the engine at 1,500 ft: practice, not a run for the board. */
  const practice = goalFeet !== 10_000;
  /** Which engine went first, what took it and at what height; and whether the other followed, and to what. */
  const [failure, setFailure] = useState<{ side: -1 | 1; cause: Cause; feet: number; both: boolean; second: Cause | null } | null>(null);
  /** The moment lightning hits: the screen goes blue-white. */
  const [struck, setStruck] = useState(false);
  /** The UFO took a wing: which. */
  const [wingHit, setWingHit] = useState<-1 | 1 | null>(null);
  /** What the UFO is doing, said across the middle of the screen while it matters. */
  const [ufoCaption, setUfoCaption] = useState<{ kind: 'warn' | 'hit' | 'dodged'; side?: -1 | 1 } | null>(null);
  const captionTimer = useRef<number | null>(null);
  const sayUfo = useCallback((kind: 'warn' | 'hit' | 'dodged', side?: -1 | 1, ms = 3000) => {
    setUfoCaption({ kind, side });
    if (captionTimer.current !== null) window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setUfoCaption(null), ms);
    timers.current.push(captionTimer.current);
  }, []);
  /** The moment of the blast, for the shake and the flash. */
  const [blasted, setBlasted] = useState(false);
  const game = useRef(newGame());
  const [hud] = useState<LandingHud>(() => ({
    bar: createRef(), alt: createRef(), warn: createRef(), stall: createRef(), score: createRef(), rate: createRef(),
    speedNeedle: createRef(), speedText: createRef(), varioNeedle: createRef(), varioText: createRef(), horizon: createRef(),
    lift: createRef(),
  }));
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
  const [splash, setSplash] = useState<'on' | 'fading' | 'off'>('on');
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

  /* A Solana wallet is the ticket: nobody takes the controls without one
     connected. Asking to fly without one brings up a card that connects it
     — or, with no wallet installed, says where to get one, and on a phone
     opens this page in a wallet's own browser, which is where a phone's
     wallet lives. */
  const [preflight, setPreflight] = useState<'off' | 'ask' | 'connecting'>('off');
  const [preflightNote, setPreflightNote] = useState<string | null>(null);
  const preflightOpen = useRef(false);
  useEffect(() => {
    preflightOpen.current = preflight !== 'off';
  }, [preflight]);
  const [walletLinks] = useState(() => {
    if (typeof window === 'undefined') return { phantom: '', solflare: '', backpack: '' };
    const here = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    /* Each wallet's own "open this page in my browser" link. Nightly has no
       such link to give, so a phone is sent to get it instead. */
    return {
      phantom: `https://phantom.app/ul/browse/${here}?ref=${ref}`,
      solflare: `https://solflare.com/ul/v1/browse/${here}?ref=${ref}`,
      backpack: `https://backpack.app/ul/v1/browse/${here}?ref=${ref}`,
    };
  });

  /* Going in fades the landing out first, so the site arrives from black
     rather than cutting in. Once only, however many ways it is asked. */
  const gone = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  const leave = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    setLeaving(true);
    // The warning and the crowd go with the landing; the crash sound is left to ring out.
    sounds.current?.blast.pause();
    sounds.current?.lightning.pause();
    sounds.current?.ufo.pause();
    sounds.current?.wind.pause();
    sounds.current?.crowd.pause();
    recording.current?.abort();
    timers.current.push(window.setTimeout(onEnter, 450));
  }, [onEnter]);
  /* After the crash the site takes over on its own, whatever happens on the
     way: sharing or posting holds the count while it is going on, and
     starts it again once it is done — sent, cancelled or failed — so the
     screen is never left waiting on a tap that may not come. */
  const [counting, setCounting] = useState(false);
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
    setCounting(true);
  }, [leave]);

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
  };

  /* The boost: the button in the corner, or the space bar. Three a flight —
     lighting the engines still turning for a few seconds of thrust. */
  const [boostUi, setBoostUi] = useState<{ charges: number; hot: boolean }>({ charges: GAME.boostCharges, hot: false });
  const pressBoost = useCallback(() => {
    const g = game.current;
    if (!fireBoost(g)) return;
    setBoostUi({ charges: g.boostCharges, hot: true });
    timers.current.push(window.setTimeout(() => setBoostUi((u) => ({ ...u, hot: false })), GAME.boostSeconds * 1000));
    // The roar, synthesized on the gesture so the browser lets it play.
    try {
      const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const dur = 1.1;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(240, ctx.currentTime);
      bp.frequency.exponentialRampToValueAtTime(2600, ctx.currentTime + dur * 0.7);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      void ctx.resume();
      src.start();
      src.stop(ctx.currentTime + dur);
    } catch {
      /* No audio, no roar. */
    }
  }, []);

  const takeOff = useCallback(() => {
    const g = game.current;
    if (!ready || g.phase !== 'idle' || gone.current) return;
    makeSounds();
    setPreflight('off');
    setBoostUi({ charges: GAME.boostCharges, hot: false });
    g.phase = 'intro';
    g.phaseAt = performance.now();
    setPhase('intro');
  }, [ready]);
  /* An arrow key, or Fly with no wallet installed: the card. */
  const start = useCallback(() => {
    if (!ready || game.current.phase !== 'idle' || gone.current) return;
    if (!wallet.address) {
      // Made now, inside the click or key: the take-off comes after the wallet, outside it.
      makeSounds();
      setPreflightNote(null);
      setPreflight((p) => (p === 'off' ? 'ask' : p));
      return;
    }
    takeOff();
  }, [ready, wallet.address, takeOff]);
  const connectAndFly = useCallback(async () => {
    makeSounds();
    setPreflight('connecting');
    setPreflightNote(null);
    const address = await wallet.connect();
    // Put away while the wallet was up: connected, but not flying.
    if (!preflightOpen.current) return;
    if (address) {
      takeOff();
      return;
    }
    setPreflight('ask');
    setPreflightNote('No wallet connected.');
  }, [wallet, takeOff]);
  /* The Fly button: straight to the wallet when there is one to ask. */
  const onFly = useCallback(() => {
    if (wallet.address || wallet.unavailable) start();
    else void connectAndFly();
  }, [wallet.address, wallet.unavailable, start, connectAndFly]);

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

  const onUfoWarn = useCallback(() => sayUfo('warn', undefined, 4000), [sayUfo]);
  const onStrike = useCallback((side: -1 | 1) => {
    setWingHit(side);
    sayUfo('hit', side, 3200);
    setBlasted(true);
    setStruck(true);
    timers.current.push(window.setTimeout(() => setStruck(false), 700));
    timers.current.push(window.setTimeout(() => setBlasted(false), 900));
  }, [sayUfo]);
  const onDodge = useCallback(() => {
    sayUfo('dodged', undefined, 2800);
    const wow = sounds.current?.wow;
    if (wow) {
      wow.currentTime = 0;
      void wow.play().catch(() => {});
    }
  }, [sayUfo]);
  /** A bonus medallion flown through: what it paid, shown as it lands. */
  const [logoPop, setLogoPop] = useState<number | null>(null);
  const onLogo = useCallback((bonus: number) => {
    setLogoPop(bonus);
    timers.current.push(window.setTimeout(() => setLogoPop(null), 2800));
    const wow = sounds.current?.wow;
    if (wow) {
      wow.currentTime = 0;
      void wow.play().catch(() => {});
    }
  }, []);

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
     a wallet is connected if there is none yet (the preflight will usually
     have seen to that), then asked to sign a short message naming the
     score — never a transaction. */
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
      if (preflightOpen.current) {
        // The card has the focus and its buttons take Enter; Escape puts it away.
        if (e.key === 'Escape') setPreflight('off');
        return;
      }
      // The high scores window closes itself on Escape; everything else is its own.
      if (scoresUp.current) return;
      if (KEYS[e.code]) {
        e.preventDefault();
        held.add(e.code);
        read();
        if (game.current.phase === 'idle') start();
        return;
      }
      // The boost: the space bar, while flying.
      if (e.code === 'Space') {
        e.preventDefault();
        if (game.current.phase === 'flying') pressBoost();
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
  }, [start, leave, clearSplash, pressBoost]);

  /* The stick, for a touch screen (or a mouse): press anywhere and drag.
     Up climbs, down dives, sideways banks, measured from where the press
     began, with the stick drawn there so the thumb can see what it is doing. */
  const grip = useRef<{ id: number; x: number; y: number } | null>(null);
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
    const g = grip.current;
    if (g && g.id === e.pointerId) steer(e.clientX - g.x, e.clientY - g.y);
  };
  const letGo = (e: ReactPointerEvent<HTMLDivElement>) => {
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

  return (
    <div
      className={`sa-landing is-${phase}${leaving ? ' is-leaving' : ''}${ready ? ' is-ready' : ''}${
        failure ? ' is-failing' : ''}${blasted ? ' is-blast' : ''}${splash === 'on' ? ' is-splash' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={letGo}
      onPointerCancel={letGo}
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
              game={game}
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
              onLogo={onLogo}
              onCrash={onCrash}
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

      {!inGame && preflight === 'off' && (
        <main className="sa-landing__hero">
          <h1 className="sa-landing__title">
            Hold more.
            <br />
            Fly higher.
          </h1>
          <p className="sa-landing__lead">
            Market cap is altitude. The biggest holders sit up front.
          </p>
          <div className="sa-landing__actions">
            <button type="button" onClick={leave} className="sa-landing__enter">
              Enter <span aria-hidden>→</span>
            </button>
            {!failed && (
              <button type="button" onClick={onFly} disabled={!ready} className="sa-landing__fly">
                <svg viewBox="0 0 24 24" aria-hidden className="sa-landing__fly-icon">
                  <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
                </svg>
                {wallet.address ? 'Fly' : 'Connect & fly'}
              </button>
            )}
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
                className="sa-pilots"
              >
                <DeckIcon name="trophy" className="sa-pilots__icon" />
                Scores
              </button>
            )}
            <button
              type="button"
              onClick={onSoundToggle}
              aria-pressed={soundEnabled}
              className="sa-pilots"
              title={soundEnabled ? 'Sound on' : 'Sound off'}
            >
              <DeckIcon name={soundEnabled ? 'sound' : 'mute'} className="sa-pilots__icon" />
              {soundEnabled ? 'Sound' : 'Muted'}
            </button>
          </div>
          {!failed && (
            <p className="sa-landing__hint">
              {!ready
                ? 'Warming up…'
                : `${!wallet.address ? 'Solana wallet required' : touch ? 'Drag to fly' : 'Arrow keys to fly'}\u00a0· climb to ${goalFeet.toLocaleString('en-US')}\u00a0ft`}
            </p>
          )}
          <SocialLinks night className="sa-landing__social" />
        </main>
      )}
      {!inGame && preflight !== 'off' && (
        <div className="sa-preflight" role="dialog" aria-modal="true" aria-labelledby="sa-preflight-title">
          <div className="sa-preflight__card">
            <p className="sa-preflight__eyebrow">Wallet required</p>
            {wallet.unavailable && !wallet.address ? (
              <>
                <h2 id="sa-preflight-title" className="sa-preflight__title">Get a Solana wallet</h2>
                <p className="sa-preflight__text">
                  {touch ? 'Open this page in your wallet’s browser.' : 'Install Phantom, Solflare, Backpack or Nightly, then come back.'}
                </p>
                <div className="sa-preflight__actions">
                  {touch ? (
                    <>
                      <a href={walletLinks.phantom} className="sa-preflight__connect">Open in Phantom</a>
                      <a href={walletLinks.solflare} className="sa-preflight__skip">Open in Solflare</a>
                      <a href={walletLinks.backpack} className="sa-preflight__skip">Open in Backpack</a>
                      <a href="https://nightly.app/download" target="_blank" rel="noopener noreferrer" className="sa-preflight__skip">Get Nightly</a>
                    </>
                  ) : (
                    <>
                      <a href="https://phantom.com" target="_blank" rel="noopener noreferrer" className="sa-preflight__connect">
                        Get Phantom
                      </a>
                      <a href="https://solflare.com" target="_blank" rel="noopener noreferrer" className="sa-preflight__skip">
                        Get Solflare
                      </a>
                      <a href="https://backpack.app" target="_blank" rel="noopener noreferrer" className="sa-preflight__skip">
                        Get Backpack
                      </a>
                      <a href="https://nightly.app" target="_blank" rel="noopener noreferrer" className="sa-preflight__skip">
                        Get Nightly
                      </a>
                    </>
                  )}
                  <button type="button" onClick={() => setPreflight('off')} className="sa-preflight__later">
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="sa-preflight-title" className="sa-preflight__title">Connect to fly</h2>
                {preflightNote && <p className="sa-preflight__note" role="alert">{wallet.error ?? preflightNote}</p>}
                <div className="sa-preflight__actions">
                  <button
                    type="button"
                    onClick={() => void connectAndFly()}
                    disabled={preflight === 'connecting'}
                    className="sa-preflight__connect"
                    autoFocus
                  >
                    {preflight === 'connecting' ? 'Check your wallet…' : 'Connect wallet'}
                  </button>
                  <button type="button" onClick={() => setPreflight('off')} className="sa-preflight__later">
                    Not now
                  </button>
                </div>
              </>
            )}
            <p className="sa-preflight__fine">
              Shares your address only. Signing is never a transaction.
            </p>
          </div>
        </div>
      )}
      {/* Its own Suspense, as in the site: nothing shows while the chunk loads. */}
      {scoresOpen && (
        <Suspense fallback={null}>
          <ScoresDialog address={wallet.address} onClose={closeScores} />
        </Suspense>
      )}

      {inGame && (
        <div className="sa-hud">
          <div className="sa-hud__top">
            <div className="sa-hud__stack">
              <div className="sa-hud__panel">
                <span className="sa-hud__label">Altitude</span>
                <span className="sa-hud__value">
                  <span ref={hud.alt}>—</span>
                  <small> ft</small>
                </span>
              </div>
              <div className="sa-hud__panel sa-hud__score">
                <span className="sa-hud__label">
                  Score <span ref={hud.rate} className="sa-hud__rate" />
                </span>
                <span ref={hud.score} className="sa-hud__value">0</span>
              </div>
            </div>
            {failure || wingHit ? (
              /* Once an engine is gone the brief is over: the master warning
                 takes its place, and the flight lasts until the ground ends it. */
              <div
                className={`sa-hud__panel sa-hud__clock sa-hud__master${
                  failure ? (failure.cause === 'lightning' && !failure.both ? ' is-struck' : '') : ' is-ufo'}`}
                role="alert"
              >
                <span className="sa-hud__label">
                  {!failure
                    ? 'UFO strike'
                    : failure.both ? 'Both engines' : failure.cause === 'lightning' ? 'Lightning strike' : 'Master warning'}
                </span>
                <span className="sa-hud__value">
                  {!failure ? 'WING DAMAGE' : failure.both ? 'ENG 1 · 2 FIRE' : `ENG ${engineNo} FIRE`}
                </span>
              </div>
            ) : (
              <div className="sa-hud__panel sa-hud__clock">
                <span className="sa-hud__label">Climb to</span>
                <span className="sa-hud__value">
                  {goalFeet.toLocaleString('en-US')}
                  <small> ft</small>
                </span>
                <span className="sa-hud__track" aria-hidden>
                  <span ref={hud.bar} className="sa-hud__bar" />
                </span>
              </div>
            )}
            <button type="button" onClick={leave} className="sa-hud__skip">
              Enter <span aria-hidden>→</span>
            </button>
          </div>
          <p ref={hud.warn} className="sa-hud__warn" aria-hidden>
            Pull up
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
              {ufoCaption.kind === 'warn' ? 'Dodge!' : ufoCaption.kind === 'hit' ? 'UFO strike' : `Dodged +${UFO.dodgeBonus.toLocaleString('en-US')}`}
              <small>
                {ufoCaption.kind === 'warn'
                  ? 'climb, dive or bank away'
                  : ufoCaption.kind === 'hit'
                    ? `${ufoCaption.side === -1 ? 'left' : 'right'} wing gone`
                    : 'it missed'}
              </small>
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
          {logoPop !== null && !ufoCaption && (
            <p className="sa-hud__bonus" aria-live="polite">
              +{logoPop.toLocaleString('en-US')}
              <small>medallion bonus</small>
            </p>
          )}
          {failure && phase === 'flying' && (
            <p key="mayday" className="sa-hud__help sa-hud__help--mayday">
              Wings level ×1.5 · under 500 ft ×2 · nose down for speed · {touch ? 'boost button' : 'Space to boost'}
            </p>
          )}
          {!failure && (phase === 'intro' || phase === 'flying') && (
            <p className="sa-hud__help">
              {touch ? (
                'Drag up to climb · sideways to turn'
              ) : (
                <>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> climb and dive · <kbd>←</kbd>
                  <kbd>→</kbd> turn · <kbd>Esc</kbd> to board
                </>
              )}
            </p>
          )}
          {/* The boost: the engines still turning, lit for a few seconds. Nothing left to light with both gone. */}
          {phase === 'flying' && (
            <button
              type="button"
              onClick={pressBoost}
              disabled={boostUi.charges <= 0 || boostUi.hot || !!failure?.both}
              className={`sa-boost${boostUi.hot ? ' is-hot' : ''}`}
              aria-label={touch ? 'Boost' : 'Boost (Space bar)'}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="sa-boost__flame">
                <path d="M12 2.2c.7 3.2-.6 5.2-2.1 7C8.4 10.9 7 12.6 7 15a5 5 0 0 0 10 0c0-1.2-.4-2.3-1-3.3-.4 1-1 1.9-2 2.6.6-2.7-.3-6.3-2-12.1z" />
                <path d="M12 22a3.2 3.2 0 0 1-3.2-3.2c0-1.5 1.2-2.6 2-3.6.7-.9 1.2-1.8 1.2-3 1.9 1.9 3.2 3.9 3.2 6.6A3.2 3.2 0 0 1 12 22z" opacity=".55" />
              </svg>
              <span className="sa-boost__label">Boost</span>
              <span className="sa-boost__pips" aria-hidden>
                {Array.from({ length: GAME.boostCharges }, (_, i) => (
                  <i key={i} className={i < boostUi.charges ? 'is-on' : ''} />
                ))}
              </span>
            </button>
          )}
        </div>
      )}

      {inGame && phase !== 'crashed' && <FlightInstruments hud={hud} engines={engines} />}
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
              <button
                type="button"
                onClick={leave}
                className={`sa-landing__enter${counting ? ' is-counting' : ''}`}
                style={{ ['--hold' as string]: `${END_HOLD}ms` }}
              >
                Board now <span aria-hidden>→</span>
              </button>
            </div>
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
