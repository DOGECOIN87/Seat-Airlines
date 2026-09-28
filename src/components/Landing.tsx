import { createRef, lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import DocsLink from './DocsLink';
import { DeckIcon } from './InstrumentDeck';
import Mark from './Mark';
import SplitFlapBoard from './SplitFlapBoard';
import Wasted from './Wasted';
import { SPLASH_BETWEEN, SPLASH_FIRST, SPLASH_LAST } from '../content/cabin';
import type { FlightFeed } from '../lib/flightFeed';
import { formatCap, type BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import type { ManualControls } from '../lib/manualControls';
import { blastAltitude, clampUnit, FEET, newGame, type Phase } from '../lib/landingGame';
import { fetchBoard, hasBoard, keepBest, postScore, readBest, startRun, type BoardEntry, type Posted } from '../lib/scoresApi';
import type { WalletState } from '../lib/useWallet';
import type { LandingHud, LandingSounds } from './LandingScene';

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
 * Where in the crash sound it starts: its big hit lands 2.45 s in, and
 * starting 1.2 s in puts that hit, and the WASTED that lands with it, a
 * second and a quarter after the aeroplane does (see `.sa-wasted__word`).
 */
const WASTED_FROM = 1.2;

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

export default function Landing({ feed, sky, band, marketCap, controls, taken, wallet, onEnter }: LandingProps) {
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
  /** Which engine has gone, once one has. */
  const [failure, setFailure] = useState<-1 | 1 | null>(null);
  /** The moment of the blast, for the shake and the flash. */
  const [blasted, setBlasted] = useState(false);
  const game = useRef(newGame());
  const [hud] = useState<LandingHud>(() => ({
    bar: createRef(), alt: createRef(), warn: createRef(), stall: createRef(), score: createRef(), rate: createRef(),
  }));
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
    if (typeof window === 'undefined') return { phantom: '', solflare: '' };
    const here = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    return {
      phantom: `https://phantom.app/ul/browse/${here}?ref=${ref}`,
      solflare: `https://solflare.com/ul/v1/browse/${here}?ref=${ref}`,
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
    sounds.current?.crowd.pause();
    timers.current.push(window.setTimeout(onEnter, 450));
  }, [onEnter]);

  /* The game's two sounds, made inside the click or key that starts it:
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
    sounds.current = { blast: load('engine-blast.mp3', 0.9), wasted: load('wasted.mp3', 1), crowd: load('crash-crowd.mp3', 0.9) };
  };

  const takeOff = useCallback(() => {
    const g = game.current;
    if (!ready || g.phase !== 'idle' || gone.current) return;
    makeSounds();
    setPreflight('off');
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
  const onFailure = useCallback((side: -1 | 1) => {
    setFailure(side);
    setBlasted(true);
    setBonusPop(Math.round(game.current.bonus));
    timers.current.push(window.setTimeout(() => setBlasted(false), 900));
    timers.current.push(window.setTimeout(() => setBonusPop(null), 2800));
  }, []);
  const onCrash = useCallback((metres: number) => {
    const g = game.current;
    const after = g.failed ? (performance.now() - g.failedAt) / 1000 : null;
    const score = Math.round(g.score);
    const beaten = score > readBest();
    if (beaten) keepBest(score);
    setResult({ metres, after, score, climb: g.failed ? g.climbTime : 0, survived: after ?? 0, best: beaten });
    setPhase('crashed');
    const s = sounds.current;
    if (s) {
      s.blast.pause();
      s.crowd.pause();
      s.wasted.currentTime = WASTED_FROM;
      void s.wasted.play().catch(() => {});
    }
    autoLeave.current = window.setTimeout(leave, END_HOLD);
    timers.current.push(autoLeave.current);
  }, [leave]);

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
    if (!result || !runId.current) return;
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
  }, [result, wallet.signMessage]);
  const onPost = useCallback(async () => {
    if (autoLeave.current !== null) {
      window.clearTimeout(autoLeave.current);
      autoLeave.current = null;
    }
    if (wallet.address) {
      void signAndPost(wallet.address);
      return;
    }
    setPost({ state: 'connecting' });
    const address = await wallet.connect();
    if (address) void signAndPost(address);
    else setPost({ state: 'error', message: 'No wallet. Nothing posted.' });
  }, [wallet, signAndPost]);

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
  }, [start, leave, clearSplash]);

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

  const inGame = phase !== 'idle';
  const km = result ? (result.metres / 1000).toFixed(1) : '0';
  /** Engines are numbered from the left: 1 is the port one, 2 the starboard. */
  const engineNo = failure === -1 ? 1 : 2;

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
              onReady={onReady}
              onFail={onFail}
              onFlying={onFlying}
              onFailure={onFailure}
              onCrash={onCrash}
            />
          </Suspense>
        )}
      </div>
      <div className="sa-landing__scrim" aria-hidden />

      <header className="sa-landing__top">
        <span className="sa-landing__brand">
          <Mark size={34} />
          <span>Seat Airlines</span>
        </span>
        <span className="sa-landing__live">
          <span className="sa-live" aria-hidden />
          Live · SA350 · {band.label} · {formatCap(marketCap)}
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
          </div>
          {!failed && (
            <p className="sa-landing__hint">
              {!ready
                ? 'Warming up…'
                : `${!wallet.address ? 'Solana wallet required' : touch ? 'Drag to fly' : 'Arrow keys to fly'}\u00a0· climb to ${goalFeet.toLocaleString('en-US')}\u00a0ft`}
            </p>
          )}
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
                  {touch ? 'Open this page in your wallet’s browser.' : 'Install Phantom, Solflare or Backpack, then come back.'}
                </p>
                <div className="sa-preflight__actions">
                  {touch ? (
                    <>
                      <a href={walletLinks.phantom} className="sa-preflight__connect">Open in Phantom</a>
                      <a href={walletLinks.solflare} className="sa-preflight__skip">Open in Solflare</a>
                    </>
                  ) : (
                    <>
                      <a href="https://phantom.com" target="_blank" rel="noopener noreferrer" className="sa-preflight__connect">
                        Get Phantom
                      </a>
                      <a href="https://solflare.com" target="_blank" rel="noopener noreferrer" className="sa-preflight__skip">
                        Get Solflare
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
            {failure ? (
              /* Once an engine is gone the brief is over: the master warning
                 takes its place, and the flight lasts until the ground ends it. */
              <div className="sa-hud__panel sa-hud__clock sa-hud__master" role="alert">
                <span className="sa-hud__label">Master warning</span>
                <span className="sa-hud__value">ENG {engineNo} FIRE</span>
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
          {bonusPop !== null && (
            <p className="sa-hud__bonus" aria-live="polite">
              +{bonusPop.toLocaleString('en-US')}
              <small>made it to {goalFeet.toLocaleString('en-US')} ft</small>
            </p>
          )}
          {failure && phase === 'flying' && (
            <p key="mayday" className="sa-hud__help sa-hud__help--mayday">
              Wings level ×1.5 · under 500 ft ×2 · nose down for speed
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
        </div>
      )}

      {blasted && <div className="sa-landing__blast" aria-hidden />}
      {phase === 'crashed' && <div className="sa-landing__flash" aria-hidden />}
      {phase === 'crashed' && <div className="sa-landing__redout" aria-hidden />}

      {result && (
        <div className="sa-landing__end sa-landing__end--crash" role="status">
          <div className="sa-wasted">
            <Wasted className="sa-wasted__word" />
          </div>
          <div className="sa-landing__end-after">
            <p className="sa-landing__score">
              {result.score.toLocaleString('en-US')}
              {result.best && result.score > 0 && <span className="sa-landing__best">New best</span>}
            </p>
            <p className="sa-landing__end-note">
              {result.after !== null
                ? `${Math.round(result.after)} s on one engine`
                : `${km} km flown`}
            </p>
            {post.state === 'done' && (
              <p className="sa-landing__posted" role="status">
                {post.posted.improved ? 'On the board' : 'Best still stands'}
                {post.posted.rank !== null ? ` · #${post.posted.rank}` : ''} · best {post.posted.best.toLocaleString('en-US')}
              </p>
            )}
            {post.state === 'error' && <p className="sa-landing__posted is-error" role="alert">{post.message}</p>}
            <div className="sa-landing__end-actions">
              {practice && <p className="sa-landing__posted">Practice run · not posted</p>}
              {!practice && hasBoard && board !== null && runId.current && result.score > 0 && post.state !== 'done' && (
                wallet.unavailable && !wallet.address ? (
                  <p className="sa-landing__posted">Install a Solana wallet to post.</p>
                ) : (
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
                )
              )}
              <button
                type="button"
                onClick={leave}
                className={`sa-landing__enter${autoLeave.current !== null ? ' is-counting' : ''}`}
                style={{ ['--hold' as string]: `${END_HOLD}ms` }}
              >
                Board now <span aria-hidden>→</span>
              </button>
            </div>
            {!practice && hasBoard && board !== null && post.state === 'idle' && (
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
            <Mark size={22} />
            <span>Seat Airlines · SA350</span>
          </p>
          <div className="sa-splash__docs">
            <DocsLink night />
          </div>
        </div>
      )}
    </div>
  );
}
