import { createRef, lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Mark from './Mark';
import Wasted from './Wasted';
import type { FlightFeed } from '../lib/flightFeed';
import { formatCap, type BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import type { ManualControls } from '../lib/manualControls';
import { blastAltitude, clampUnit, FEET, newGame, type Phase } from '../lib/landingGame';
import { fetchBoard, hasBoard, postScore, shortWallet, startRun, type BoardEntry, type Posted } from '../lib/scoresApi';
import type { WalletState } from '../lib/useWallet';
import type { LandingHud, LandingSounds } from './LandingScene';

/* The scene is the chunk with three.js in it. Everything here — the way in
   above all — is up and working before it arrives. */
const LandingScene = lazy(() => import('./LandingScene'));

/**
 * The way in.
 *
 * The aeroplane, full screen and edge to edge, before anything else: the
 * one picture that says what the site is without a caption. One button goes
 * in. The other hands over the controls — the arrow keys, or a drag on a
 * touch screen, put the nose up and down and bank it round, low over the
 * country the cabin windows look out on — with a brief to climb to 10,000 ft,
 * where an engine blows. It is scored (see `scoring.ts`), the best scores go
 * on a board any Solana wallet can sign its way onto, and when the aeroplane
 * meets the ground it goes in on its own.
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

/** This browser's own best, kept whether or not it is ever posted. */
const BEST_KEY = 'sa.game.best';
const readBest = (): number => {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const keepBest = (score: number) => {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* Nowhere to keep it. */
  }
};

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
  const [best, setBest] = useState(() => (typeof window === 'undefined' ? 0 : readBest()));
  /** The leaderboard, or null when there is none to show. */
  const [board, setBoard] = useState<BoardEntry[] | null>(null);
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

  const start = useCallback(() => {
    const g = game.current;
    if (!ready || g.phase !== 'idle' || gone.current) return;
    makeSounds();
    g.phase = 'intro';
    g.phaseAt = performance.now();
    setPhase('intro');
  }, [ready]);

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
    if (beaten) {
      keepBest(score);
      setBest(score);
    }
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
     a wallet is connected if there is none yet, then asked to sign a short
     message naming the score — never a transaction. */
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
      setPost({ state: 'error', message: /reject|denied|cancel/i.test(message) ? 'You did not sign it, so nothing was posted.' : message });
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
    await wallet.connect();
  }, [wallet, signAndPost]);
  // Connected at last: sign and post. A refused connection is reported rather than waited on.
  useEffect(() => {
    if (post.state !== 'connecting') return;
    if (wallet.address) void signAndPost(wallet.address);
    else if (wallet.error && !wallet.connecting) setPost({ state: 'error', message: wallet.error });
  }, [post.state, wallet.address, wallet.error, wallet.connecting, signAndPost]);

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
  }, [start, leave]);

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
        failure ? ' is-failing' : ''}${blasted ? ' is-blast' : ''}`}
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
      </header>

      {!inGame && (
        <main className="sa-landing__hero">
          <h1 className="sa-landing__title">
            Hold more.
            <br />
            Fly higher.
          </h1>
          <p className="sa-landing__lead">
            One aeroplane, flown by the market: market cap is altitude, and the biggest holders get the best seats.
          </p>
          <div className="sa-landing__actions">
            <button type="button" onClick={leave} className="sa-landing__enter">
              Enter <span aria-hidden>→</span>
            </button>
            {!failed && (
              <button type="button" onClick={start} disabled={!ready} className="sa-landing__fly">
                <svg viewBox="0 0 24 24" aria-hidden className="sa-landing__fly-icon">
                  <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
                </svg>
                Fly the plane
              </button>
            )}
          </div>
          {!failed && (
            <p className="sa-landing__hint">
              {!ready
                ? 'Warming up the engines…'
                : touch
                  ? `Drag to fly · climb to ${goalFeet.toLocaleString('en-US')} ft · mind the hills`
                  : `Press an arrow key to fly · climb to ${goalFeet.toLocaleString('en-US')} ft · mind the hills`}
            </p>
          )}
        </main>
      )}
      {!inGame && board && (
        <aside className="sa-board" aria-label="Top pilots">
          <p className="sa-board__title">Top pilots</p>
          {board.length ? (
            <ol className="sa-board__list">
              {board.slice(0, 5).map((row, i) => (
                <li key={row.address} className={row.address === wallet.address ? 'is-you' : undefined}>
                  <span className="sa-board__rank">{i + 1}</span>
                  <span className="sa-board__who">{shortWallet(row.address)}</span>
                  <span className="sa-board__score">{row.score.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="sa-board__empty">Nobody on the board yet. Climb to {goalFeet.toLocaleString('en-US')} ft and be first.</p>
          )}
          {best > 0 && <p className="sa-board__mine">Your best · {best.toLocaleString('en-US')}</p>}
        </aside>
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
              Engine {engineNo} is gone · wings level ×1.5 · under 500 ft ×2 · keep the nose down for speed
            </p>
          )}
          {!failure && (phase === 'intro' || phase === 'flying') && (
            <p className="sa-hud__help">
              {touch ? (
                'Drag anywhere · up to climb · down to dive · sideways to turn'
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
                ? `Engine ${engineNo} blew at ${goalFeet.toLocaleString('en-US')} ft, and you kept it in the air for ${Math.round(result.after)} more seconds.`
                : `You flew ${km} km before the ground got in the way.`}
            </p>
            {post.state === 'done' && (
              <p className="sa-landing__posted" role="status">
                {post.posted.improved ? 'On the board' : 'Posted — your best still stands'}
                {post.posted.rank !== null ? ` · #${post.posted.rank}` : ''} · best {post.posted.best.toLocaleString('en-US')}
              </p>
            )}
            {post.state === 'error' && <p className="sa-landing__posted is-error" role="alert">{post.message}</p>}
            <div className="sa-landing__end-actions">
              {practice && <p className="sa-landing__posted">Practice run (?mayday) · scores are not posted</p>}
              {!practice && hasBoard && board !== null && runId.current && result.score > 0 && post.state !== 'done' && (
                wallet.unavailable && !wallet.address ? (
                  <p className="sa-landing__posted">Install a Solana wallet (Phantom, Solflare or Backpack) to post scores.</p>
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
                          ? 'Sign & post score'
                          : 'Connect wallet to post'}
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
              <p className="sa-landing__fine">Posting signs a short message with your wallet — no transaction, nothing spent.</p>
            )}
          </div>
        </div>
      )}

      <div ref={stickEl} className="sa-stick" aria-hidden>
        <div ref={knobEl} className="sa-stick__knob" />
      </div>
    </div>
  );
}
