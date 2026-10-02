import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CAPTURE, captureState, useCaptureVersion } from './capture/flag';
import { logoMarkup } from './components/Mark';
import ContractBar from './components/ContractBar';
import ViewFrame from './components/ViewFrame';
import Annunciators from './components/Annunciators';
import { ClimbRoute, DeckIcon, FlightReadouts, type DeckIconName } from './components/InstrumentDeck';
import Flyover from './components/Flyover';
import AdvertDialog from './components/AdvertDialog';
import DocsLink from './components/DocsLink';
import Wordmark from './components/Wordmark';
import WalletPicker from './components/WalletPicker';
import SeatChange from './components/SeatChange';
import SeatTicker, { type TickerItem } from './components/SeatTicker';
import Landing from './components/Landing';
import { SectionDock, SectionPanel, SHEET_QUERY, panelFromHash, type PanelKey } from './components/SectionPanels';
import type { LogEntry } from './components/RadioLog';
import {
  ALL_SEATS,
  CABIN_ZONES,
  CALLOUTS,
  CHATTER,
  type CabinSeat,
  type Facing,
  type SeatPosition,
  type ZoneKey,
} from './content/cabin';
import { INITIAL_TICK } from './lib/flightFeed';
import { createLiveFeed } from './lib/marketFeed';
import {
  bandFor,
  formatCap,
  formatChange,
  formatFeet,
} from './lib/flightModel';
import { useFlightState } from './lib/useFlightState';
import { useAircraftAudio } from './lib/useAircraftAudio';
import { useSky } from './lib/useSky';
import { coverFor } from './lib/manualControls';
import { useFlight } from './lib/useFlight';
import { useWallet } from './lib/useWallet';
import { holdingsSource, type Holding } from './lib/holdings';
import { berthFromManifest } from './lib/seatLadder';
import { useManifest } from './lib/useManifest';
import { MANIFEST_SIZE, shortAddress, type Manifest } from './lib/manifest';
import { headlines, personalMove, type PersonalMove } from './lib/seatMoves';
import { resetClientStateForToken } from './lib/tokenReset';
import {
  houseAdverts,
  fetchPublished,
  fetchOwnerBanners,
  canPublish,
  publishBanner,
  unpublishBanner,
  ServerUnreachable,
  hasPublishedWall,
  localBanners,
  type Banner,
  type BannerSet,
} from './lib/banners';
import { visibilityAwareInterval } from './lib/visibility';

// The renderer and Three.js are the heaviest parts of the experience. Keeping
// them behind the view boundary lets the controls and live flight data become
// interactive immediately, rather than making the whole page wait on WebGL.
const CabinView3D = lazy(() => import('./components/CabinView3D'));
const ExteriorView = lazy(() => import('./components/ExteriorView'));
const loadFlightDeck = () => import('./components/FlightDeck3D');
const loadSeatMap = () => import('./components/SeatMap');
const FlightDeck = lazy(loadFlightDeck);
const CargoHold = lazy(() => import('./components/CargoHold3D'));
const CheckIn = lazy(() => import('./components/CheckIn'));
const BoardingLadder = lazy(() => import('./components/BoardingLadder'));
const SeatMap = lazy(loadSeatMap);
const BoardingPass = lazy(() => import('./components/BoardingPass'));
const NetworkingHub = lazy(() => import('./components/NetworkingHub'));
const RadioLog = lazy(() => import('./components/RadioLog'));
const ScoresDialog = lazy(() => import('./components/ScoresDialog'));
const prefetchFlightDeck = () => { void loadFlightDeck(); };
const prefetchSeatMap = () => { void loadSeatMap(); };

/**
 * The logbook, which nothing on this page links to.
 *
 * Lazy like the rest, and that matters more here than anywhere else: the
 * chunk is requested only when somebody types the fragment, so a visitor who
 * never does downloads nothing that says the route exists. The gate itself is
 * the Worker's, which answers everybody but one wallet the same 404 a
 * misspelt path gets — this is only about not advertising the door.
 */
const Logbook = lazy(() => import('./components/Logbook'));
const LOGBOOK_HASH = /^#\/?logbook$/i;

function useLogbookFragment(): [boolean, () => void] {
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && LOGBOOK_HASH.test(window.location.hash),
  );
  useEffect(() => {
    const read = () => setOpen(LOGBOOK_HASH.test(window.location.hash));
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const close = useCallback(() => {
    /* Replaced rather than pushed: closing should not leave a step in the
       history that going back walks into, and should not leave the fragment
       sitting in the URL bar of a browser somebody else might pick up. */
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setOpen(false);
  }, []);
  return [open, close];
}

/* A section's contents load the first time its panel opens: nobody who
   never opens the network downloads it. */
const Loaded = ({ children, minHeight = '6rem' }: { children: ReactNode; minHeight?: string }) => (
  <Suspense fallback={<div className="sa-view-loading" style={{ minHeight }} role="status" aria-label="Loading section" />}>
    {children}
  </Suspense>
);

/**
 * SEAT AIRLINES — the cabin.
 *
 * One number flies the whole page. The 5m change sets the aircraft's attitude
 * and the market cap is its altitude: $1M puts you on top of the cloud deck,
 * $10M turns the sky black, $50M is the moon and $100M is Mars. The sky
 * itself is real — the visitor's own time of day, and the weather where they
 * are.
 *
 * The aircraft is walkable. Every zone has its own view, and within a zone the
 * window, middle and aisle seats see genuinely different things, because that
 * is the ladder the whole premise rests on.
 */

const POSITIONS: { key: SeatPosition; label: string }[] = [
  { key: 'window', label: 'Window' },
  { key: 'middle', label: 'Middle' },
  { key: 'aisle', label: 'Aisle' },
];

/** Which way you are looking from a seat. */
const FACINGS: { key: Facing; label: string; long: string; short: string }[] = [
  { key: 'left', label: 'Look left', long: '← Look left', short: '← Left' },
  { key: 'forward', label: 'Forward', long: 'Forward', short: 'Forward' },
  { key: 'right', label: 'Look right', long: 'Look right →', short: 'Right →' },
];

/**
 * Where the camera is.
 *
 * `exterior` is the default and where the page opens: the whole aeroplane,
 * from outside. `seat` is a step inward — sitting down, looking forward — and
 * is where Step inside, on the view's own bar, takes you.
 */
type Camera = 'exterior' | 'deck' | 'seat' | 'hold';

const clockNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** How the page scrolls itself: smoothly, unless the visitor has asked for less motion. */
const glide = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** The seat you would be shown when walking into a zone at a given position. */
function representativeSeat(zone: ZoneKey, position: SeatPosition): CabinSeat {
  const inZone = ALL_SEATS.filter((s) => s.zone === zone);
  return inZone.find((s) => s.position === position) ?? inZone[0];
}

/**
 * A control chip.
 *
 * Every strip on the page — head turn, walk the aircraft, seat position,
 * flight sim, altitude — is the same control, so it is written once. It used
 * to be the same forty-term class string copied six times, which is how the
 * strips had quietly drifted apart from one another.
 */
const chip = (on: boolean, accent: 'cyan' | 'amber' = 'cyan') =>
  `sa-chip${on ? ` sa-chip--on sa-chip--${accent}` : ''}`;

/** A segment of the deck's selectors: set into a track rather than standing proud. */
const seg = (on: boolean) => `sa-seg__btn${on ? ' is-on' : ''}`;

/** The symbol on each stop of the walk. */
const ZONE_ICON: Record<ZoneKey, DeckIconName> = {
  deck: 'deck',
  first: 'first',
  business: 'business',
  exit: 'exit',
  economy: 'economy',
};

const SceneLoading = ({ exterior = false }: { exterior?: boolean }) => (
  <div
    className={`sa-view-loading sd-frame ${exterior ? 'sd-frame--wide' : ''}`}
    role="status"
    aria-live="polite"
  >
    <div className="sa-view-loading__mark" aria-hidden />
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7FE3F7]">
      Preparing {exterior ? 'exterior' : 'cabin'} view
    </p>
  </div>
);

export default function App() {

  resetClientStateForToken();

  /* One feed, reading the market. There is no simulator behind it and no
     flight-sim input in front of it: an aircraft that can be flown by hand is
     not reporting anything. */
  const feed = useMemo(() => (CAPTURE && captureState.feed) || createLiveFeed(INITIAL_TICK), []);
  /* Capture mode only: re-render when the film's adverts or seat change. */
  const captureVersion = CAPTURE ? useCaptureVersion() : 0;
  const { tick, lamps } = useFlightState(feed);
  /* What the aeroplane is doing.
  
     Read by every page on the site, because the switches are the aircraft's
     and not this tab's: if the flight deck has rolled it, a visitor who has
     never heard of the logbook is looking at an inverted aeroplane. Writing
     is the operator's, and happens in the panel, which is the only place that
     holds the session it needs. */
  const [controls, showControls] = useFlight();
  const sky = useSky(
    controls.weather
      ? { hour: controls.hour, weather: controls.weather, cloudCover: coverFor(controls.weather) }
      : { hour: controls.hour },
  );
  const band = useMemo(() => bandFor(tick.marketCap), [tick.marketCap]);
  const aircraftAudio = useAircraftAudio(lamps, tick.change5m, band.band);

  /* The page opens outside, on the whole aeroplane. It is the one frame that
     explains the premise without a caption — one plane, everyone in it — and
     every other camera is a step inward from it. */
  const [camera, setCamera] = useState<Camera>('exterior');
  const [facing, setFacing] = useState<Facing>('forward');
  /** Where you are sitting. Independent of where you are ticketed. */
  const [viewZone, setViewZone] = useState<ZoneKey>('economy');
  const [viewPosition, setViewPosition] = useState<SeatPosition>('window');
  const [boardedAt, setBoardedAt] = useState<number | null>(null);

  /* Check-in. The seat is not a choice: the wallet's holding decides it. */
  const wallet = useWallet();
  const [logbookOpen, closeLogbook] = useLogbookFragment();
  const [holding, setHolding] = useState<Holding | null>(null);
  const [loadingHolding, setLoadingHolding] = useState(false);
  /* Demo only: a stand-in holding, so the ladder can be seen working with no
     wallet installed. Cleared the moment a real one connects. */
  const [log, setLog] = useState<readonly LogEntry[]>([]);

  const seatKey = wallet.address;

  /* Who is aboard. Seats go to the top holders and then run out, so the empty
     rows aft are the game: they are the seats nobody has out-held anyone for. */
  const manifest = useManifest(seatKey, holding);
  const taken = manifest.seats;
  /* Holders who did not make the cut. */
  const belowCutoff = Math.max(0, tick.holders - manifest.entries.length);

  const berth = useMemo(
    () => berthFromManifest(manifest, seatKey, holding?.balance ?? 0),
    [manifest, seatKey, holding?.balance],
  );

  /* ── The wall ─────────────────────────────────────────────────────────
     Every seat is a square, so every held seat is a billboard. The published
     set wins over anything this browser has put up locally. */
  const [published, setPublished] = useState<BannerSet>({});
  /* The self-serve wall arrives keyed by wallet rather than by seat, because
     the server that stores it has no idea what a seat is. Resolving one to
     the other is this page's job — it is already holding the manifest that
     answers it. */
  const [byOwner, setByOwner] = useState<BannerSet>({});
  const [local, setLocal] = useState<BannerSet>(() => localBanners.read());
  const [advertising, setAdvertising] = useState<string | null>(null);
  const reloadWall = useCallback(() => {
    if (hasPublishedWall) void fetchPublished().then(setPublished);
    if (canPublish) void fetchOwnerBanners().then(setByOwner);
  }, []);
  useEffect(() => {
    // A wall somebody else is also publishing to should not need a refresh.
    return visibilityAwareInterval(reloadWall, 60_000);
  }, [reloadWall]);

  /* Wallet → seat, through the manifest. An advert follows its holder: get
     out-held from 3A to 7C and it moves with you, and drop off the manifest
     altogether and it comes down, with nothing to clean up. */
  const ownerSeats = useMemo(() => {
    const out: Record<string, Banner> = {};
    for (const entry of manifest.entries) {
      const banner = byOwner[entry.address];
      if (banner) out[entry.seat.id] = banner;
    }
    return out;
  }, [byOwner, manifest.entries]);
  /* Two of the house adverts below carry the logo inside their own artwork,
     which needs the logo's markup rather than its address: they draw without
     it for the moment it takes to arrive, then again with it. */
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    logoMarkup().then((markup) => { if (live) setLogo(markup); }, () => {});
    return () => { live = false; };
  }, []);
  /* Held seats with nothing on them yet carry the airline's own campaigns, the
     way unsold inventory does on a real aircraft. A holder's own upload, and
     the published set, both beat them. */
  const house = useMemo(
    () => houseAdverts(manifest.entries.map((e) => e.seat.id), logo),
    [manifest.entries, logo],
  );
  const banners = useMemo(
    () => {
      const all: BannerSet = { ...house, ...local, ...ownerSeats, ...published };
      if (!CAPTURE) return all;
      const film: Record<string, Banner> = {};
      for (const [seat, image] of Object.entries(captureState.adverts)) film[seat] = { image, alt: 'Advert' };
      return { ...all, ...film };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [house, local, ownerSeats, published, captureVersion],
  );
  /* Just the images, keyed by seat, for the screens in the cabin: the 3D view
     has no business knowing what a Banner is. */
  const advertImages = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [seat, banner] of Object.entries(banners)) out[seat] = banner.image;
    return out;
  }, [banners]);
  /* What there is of the holder's own to take down on the seat they are
     advertising on: an advert on the published wall, one kept in this
     browser, or both. With neither, the dialog offers nothing to take down —
     the airline's house advert is not the holder's to remove. */
  const ownAdvert = wallet.address ? byOwner[wallet.address] : undefined;
  const keptAdvert = advertising ? local[advertising] : undefined;
  const takeDownAdvert = advertising && (ownAdvert || keptAdvert)
    ? async (): Promise<string | null> => {
      if (ownAdvert && wallet.address) {
        try {
          await unpublishBanner({ owner: wallet.address, image: ownAdvert.image, sign: wallet.signMessage });
        } catch (e) {
          if (e instanceof ServerUnreachable) {
            return 'Server unreachable. Your advert is still up.';
          }
          const message = e instanceof Error ? e.message : 'That advert could not be taken down.';
          // A refused signature is a decision, not a fault to report.
          return /reject|denied|cancel/i.test(message)
            ? 'Not signed. Your advert is still up.'
            : message;
        }
        setByOwner((prev) => {
          const next = { ...prev };
          delete next[wallet.address as string];
          return next;
        });
      }
      if (keptAdvert) {
        localBanners.clear(advertising);
        setLocal(localBanners.read());
      }
      say(`Advert taken down from seat ${advertising}.`, 'pa');
      return null;
    }
    : undefined;
  const claimed = berth.seat?.id ?? null;
  const claimedSeat = berth.seat;
  const claimedZone = useMemo(
    () => CABIN_ZONES.find((z) => z.key === claimedSeat?.zone) ?? null,
    [claimedSeat],
  );
  const passenger = wallet.address
    ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`
    : 'Standby';

  const viewSeat = useMemo(() => representativeSeat(viewZone, viewPosition), [viewZone, viewPosition]);
  const viewZoneDef = CABIN_ZONES.find((z) => z.key === viewZone) ?? CABIN_ZONES[0];

  const nextId = useRef(0);
  const say = useCallback((text: string, tone: LogEntry['tone']) => {
    setLog((prev) => [{ id: nextId.current++, at: clockNow(), text, tone }, ...prev].slice(0, 12));
  }, []);

  useEffect(() => {
    say(CALLOUTS.boarded, 'pa');
  }, [say]);

  useEffect(() => {
    const id = setInterval(() => {
      const line = CHATTER[Math.floor(Math.random() * CHATTER.length)];
      say(line.text, line.tone);
    }, 7000);
    return () => clearInterval(id);
  }, [say]);

  /* Announcements that follow the aircraft, not the clock. */
  const wasLit = useRef({ oxygen: false, brace: false });
  useEffect(() => {
    if (lamps.oxygen && !wasLit.current.oxygen) say(CALLOUTS.oxygenOn, 'alert');
    if (!lamps.oxygen && wasLit.current.oxygen) say(CALLOUTS.oxygenOff, 'pa');
    if (lamps.brace && !wasLit.current.brace) say(CALLOUTS.brace, 'alert');
    wasLit.current = { oxygen: lamps.oxygen, brace: lamps.brace };
  }, [lamps.oxygen, lamps.brace, say]);

  /* Crossing an altitude band is worth an announcement of its own. */
  const wasBand = useRef(band.band);
  useEffect(() => {
    if (band.band !== wasBand.current) {
      const lines: Record<string, string> = {
        'above-clouds': 'We are on top. Cloud deck below us.',
        space: 'Cabin crew, the sky has run out. Sky is black.',
        moon: 'Ladies and gentlemen, we have reached the moon.',
        mars: 'Ladies and gentlemen, welcome to Mars. Mind the dust.',
        atmosphere: 'Back in the weather. Seat belt sign is on.',
      };
      say(lines[band.band] ?? '', band.band === 'atmosphere' ? 'alert' : 'pa');
      wasBand.current = band.band;
    }
  }, [band.band, say]);

  useEffect(() => {
    if (!wallet.address) {
      setHolding(null);
      return;
    }
    let cancelled = false;
    const read = async () => {
      setLoadingHolding(true);
      const next = await holdingsSource.read(wallet.address as string);
      if (!cancelled && next) setHolding(next);
      if (!cancelled) setLoadingHolding(false);
    };
    // A bag can grow while the page is open; so can somebody else's.
    const stop = visibilityAwareInterval(read, 120_000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [wallet.address]);

  /* Being seated is an event: the PA says so, and the camera walks you there. */
  const lastSeat = useRef<string | null>(null);
  useEffect(() => {
    const boarded = Boolean(wallet.address);
    if (berth.hold && boarded && lastSeat.current !== 'HOLD') {
      lastSeat.current = 'HOLD';
      setCamera('hold');
      say('Passenger assigned to the cargo hold. Mind the step.', 'alert');
      return;
    }
    const id = berth.seat?.id ?? null;
    if (!id || id === lastSeat.current) return;
    const first = lastSeat.current === null;
    lastSeat.current = id;
    if (boardedAt === null) setBoardedAt(tick.marketCap);
    setViewZone(berth.seat!.zone);
    setViewPosition(berth.seat!.position);
    setCamera(berth.seat!.zone === 'deck' ? 'deck' : 'seat');
    setFacing('forward');
    say(
      first
        ? `Passenger seated in ${id}. ${berth.rung}.`
        : `Passenger reseated to ${id}. ${berth.rung}.`,
      'pa',
    );
  }, [berth.seat?.id, berth.hold, berth.rung, wallet.address, boardedAt, tick.marketCap, say]);

  /* ── Seats changing hands ─────────────────────────────────────────────
     Each new reading of the manifest is set against the last. Whoever climbed
     by holding more goes on the ticker and into the cabin radio, for
     everybody; a change to your own seat stops the page, with the chime.

     Your own seat is only compared once there is a reading that already has
     your bag in it — connecting, the first one with your balance merged in
     would otherwise read as boarding, or as a seat change nobody made. */
  const [ticker, setTicker] = useState<readonly TickerItem[]>([]);
  const tickerId = useRef(0);
  const tickerShown = useCallback((id: number) => setTicker((q) => q.filter((t) => t.id !== id)), []);
  const [seatChange, setSeatChange] = useState<PersonalMove | null>(null);
  const lastManifest = useRef<Manifest | null>(null);
  const comparedFor = useRef<string | null>(null);
  const { ding } = aircraftAudio;
  useEffect(() => {
    const before = lastManifest.current;
    lastManifest.current = manifest;
    if (!before || before === manifest) return;

    const news = headlines(before, manifest).filter((h) => h.address !== seatKey && h.took !== seatKey);
    if (news.length) {
      const lines = news.map((h) => `${shortAddress(h.address)} took ${h.to} from ${shortAddress(h.took)}`);
      setTicker((q) => [...q, ...lines.map((text) => ({ id: ++tickerId.current, text }))].slice(-6));
      lines.forEach((line) => say(`${line}.`, 'pa'));
    }

    if (!seatKey || !holding) {
      comparedFor.current = null;
      return;
    }
    if (comparedFor.current !== seatKey) {
      comparedFor.current = seatKey;
      return;
    }
    const mine = personalMove(before, manifest, seatKey, holding.balance);
    if (mine) {
      setSeatChange(mine);
      ding();
    }
  }, [manifest, seatKey, holding, say, ding]);

  const walkTo = (zone: ZoneKey) => {
    setViewZone(zone);
    setCamera(zone === 'deck' ? 'deck' : 'seat');
    if (zone === 'deck') setFacing('forward');
  };
  if (CAPTURE) Object.assign(captureState.app, { setCamera, setFacing, walkTo, setViewPosition });

  /* ── The way in ────────────────────────────────────────────────────
     Every visit opens on the landing: the aeroplane full screen, a button
     to go in, and a minute at the controls for anybody who wants one. A
     link to somewhere in particular — a section, the logbook — goes
     straight there instead. */
  const [entered, setEntered] = useState(
    () => typeof window === 'undefined'
      || LOGBOOK_HASH.test(window.location.hash)
      || panelFromHash(window.location.hash) !== null,
  );
  const enter = useCallback(() => {
    setEntered(true);
    window.scrollTo(0, 0);
  }, []);

  /* ── The sections ──────────────────────────────────────────────────
     The wall, the network, the chat and check-in open beside the view
     rather than under it, so whichever one you are in, the aeroplane is
     still on the screen. Their old anchors still open them. */
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const cockpitRef = useRef<HTMLDivElement>(null);
  /* The panel and the tabs stick under the gate sign, whose height is its
     content's — one row on a desk, two on a phone — so it is measured
     rather than guessed. */
  const topbarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = topbarRef.current;
    if (!bar || !('ResizeObserver' in window)) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--sa-topbar-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  const openPanel = useCallback((key: PanelKey) => {
    setPanel(key);
    /* On a desk the panel opens beside the view, so the view comes up to
       meet it: the pair fill the screen under the gate sign. A phone's
       sheet covers the page wherever it is scrolled to. */
    if (window.matchMedia(SHEET_QUERY).matches) return;
    const el = cockpitRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top > 120 || top < -80) el.scrollIntoView({ behavior: glide(), block: 'start' });
  }, []);
  useEffect(() => {
    const read = () => {
      const key = panelFromHash(window.location.hash);
      if (key) openPanel(key);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [openPanel]);
  const closePanel = useCallback(() => {
    setPanel(null);
    /* A section opened from its anchor leaves the anchor in the address
       bar; closing takes it back out, without a step in the history. */
    if (panelFromHash(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  const togglePanel = useCallback(
    (key: PanelKey) => (panel === key ? closePanel() : openPanel(key)),
    [panel, openPanel, closePanel],
  );
  /* The high scores: a window over the page, opened from the tab bar. */
  const [scoresOpen, setScoresOpen] = useState(false);
  const openScores = useCallback(() => setScoresOpen(true), []);
  const closeScores = useCallback(() => setScoresOpen(false), []);
  if (CAPTURE) Object.assign(captureState.app, { enter, openPanel, closePanel, openScores, closeScores });
  /* The top bar's button does what Check in's does: a visitor who has not
     connected is checked in first — in the Check in panel, where the wallet's
     answer and any problem with it are shown — and then taken to the seat
     map, where their seat is lit and brought into view (see SeatMap). */
  const claimSeat = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!wallet.address && !wallet.unavailable) {
      openPanel('check-in');
      if (!wallet.connecting) void wallet.connect().then((key) => { if (key) openPanel('wall'); });
      return;
    }
    openPanel('wall');
  };


  /* What each section's panel holds. The copy that used to introduce each
     section on the page now opens its panel, under the panel's own title. */
  const section = (key: PanelKey): ReactNode => {
    switch (key) {
      case 'wall':
        /* The seats first: they are what the panel opens for. How the
           seating works is underneath, for anybody who reads on. */
        return (
          <>
            <Loaded minHeight="42rem">
              <SeatMap
                manifest={manifest}
                banners={banners}
                mine={CAPTURE && captureState.seat !== undefined ? captureState.seat : claimed}
                canAdvertise={claimed}
                onAdvertise={setAdvertising}
              />
            </Loaded>
            <h3 className="sa-panel__sub">How seating works</h3>
            <p className="sa-lead mt-2">The top {MANIFEST_SIZE} holders are seated by rank.</p>
            <ol className="sa-steps">
              {[
                { n: '01', h: 'Hold', b: 'Your balance is your bag.' },
                { n: '02', h: 'Get seated', b: 'Out-hold someone to take their seat.' },
                { n: '03', h: 'Advertise', b: 'Put an image on your seat. Row 1 is never for sale.' },
              ].map((step) => (
                <li key={step.n} className="sa-step">
                  <span className="sa-step__no">{step.n}</span>
                  <h4 className="sa-step__h">{step.h}</h4>
                  <p className="sa-step__b">{step.b}</p>
                </li>
              ))}
            </ol>
          </>
        );
      case 'network':
        return (
          <>
            <p className="sa-lead">See and reach the people in your own cabin.</p>
            <div className="mt-6">
              <Loaded minHeight="32rem">
                <NetworkingHub part="directory" manifest={manifest} address={seatKey} viewerZone={claimedSeat?.zone ?? null} sign={wallet.signMessage} />
              </Loaded>
            </div>
          </>
        );
      case 'chat':
        return (
          <>
            <p className="sa-lead">Talk with the people in your cabin.</p>
            <div className="mt-6">
              <Loaded minHeight="20rem">
                <NetworkingHub part="chat" manifest={manifest} address={seatKey} viewerZone={claimedSeat?.zone ?? null} sign={wallet.signMessage} />
              </Loaded>
            </div>
          </>
        );
      case 'check-in':
        return (
          <>
            <div className="grid gap-5">
              <Loaded>
                <CheckIn wallet={wallet} holding={holding} berth={berth} loading={loadingHolding} />
              </Loaded>
              <Loaded>
                <BoardingPass passenger={passenger} seat={claimed} zone={claimedZone} boardedAt={boardedAt} />
              </Loaded>
              <Loaded>
                <BoardingLadder
                  berth={berth}
                  holding={holding}
                  address={seatKey}
                  manifestSize={manifest.entries.length}
                />
              </Loaded>
              <div className="min-h-[14rem]">
                <Loaded minHeight="14rem">
                  <RadioLog entries={log} />
                </Loaded>
              </div>
            </div>
          </>
        );
    }
  };

  if (!entered && !logbookOpen) {
    return (
      <>
        <Landing
          feed={feed}
          sky={sky}
          band={band}
          marketCap={tick.marketCap}
          controls={controls}
          taken={taken}
          wallet={wallet}
          onEnter={enter}
          soundEnabled={aircraftAudio.enabled}
          onSoundToggle={aircraftAudio.toggle}
        />
        <WalletPicker wallet={wallet} />
      </>
    );
  }

  return (
    <Suspense fallback={<SceneLoading />}>
      <div className="sa-app relative min-h-screen text-ui-ink">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="sa-ground absolute inset-0" />
        <div className="sa-ground__pattern absolute inset-0" />
      </div>

      <a href="#wall" onClick={(e) => { e.preventDefault(); openPanel('wall'); }} className="sa-skip">Skip to the seat map</a>

      <ContractBar />

      {/* ── Gate sign ──────────────────────────────────────────────────
          An airline's vernacular is a brand bar over a strip of flight data,
          set in figures you can read across a concourse. It stays at the top
          of the screen rather than scrolling away, because the numbers are the
          thing that is live — you should be able to see the altitude move
          while you are reading the seat map. */}
      <header ref={topbarRef} className="sa-topbar sticky top-0 z-40">
        <div className="mx-auto flex max-w-[94rem] flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2 sm:px-8 lg:gap-x-7 lg:py-2.5">
          <a href="#top" className="sa-brand flex shrink-0 items-center text-ui-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-blue">
            <Wordmark />
            <Flyover />
          </a>

          {/* The one call to action, where it is always on the screen: beside
              the brand on a phone or a tablet, after the figures on a desk.
              Brand, figures and button need about 1,000px to share a row;
              narrower, the figures take a row of their own under the two,
              across the whole width, from the brand's edge to the button's,
              rather than wrapping beside the button and lining up with
              neither. */}
          <a
            href="#wall"
            onClick={claimSeat}
            onMouseEnter={prefetchSeatMap}
            onFocus={prefetchSeatMap}
            className="sa-cta sa-cta--bar sa-shine ml-auto shrink-0 lg:order-last lg:ml-0"
          >
            {wallet.connecting ? 'Checking in…' : claimed ? `My seat · ${claimed}` : 'Claim a seat'}
            {!wallet.connecting && <span aria-hidden>→</span>}
          </a>

          <dl className="sd-chrome flex w-full min-w-0 items-center justify-between gap-x-7 overflow-x-auto lg:ml-auto lg:w-auto lg:max-w-[62%] lg:justify-start">
            {[
              { k: 'Altitude', v: `${formatFeet(tick.marketCap)} ft`, tone: 'text-ui-deep' },
              { k: 'Market cap', v: formatCap(tick.marketCap), tone: 'text-ui-ink' },
              /* Direction is the one thing on the page a single accent cannot
                 carry, so it keeps a sign as well as a colour. */
              { k: '5m', v: formatChange(tick.change5m), tone: tick.change5m >= 0 ? 'text-ui-deep' : 'text-ui-soft' },
              { k: 'Seated', v: `${manifest.entries.length}/${MANIFEST_SIZE}`, tone: 'text-ui-ink' },
            ].map((f) => (
              <div key={f.k} className="sa-topbar__fig shrink-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ui-faint">{f.k}</dt>
                <dd className={`font-mono text-[15px] leading-tight ${f.tone}`}>{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <main id="top" className="sa-shell mx-auto max-w-[94rem] px-5 sm:px-8">
        {/* ══════════════════════════════════════════════════════════════
            01 · The aeroplane
            The page opens on the whole aircraft, from outside, because that
            is the sentence the product is: one plane, everyone in it. Every
            other camera on the page is a step inward from this frame.
            ══════════════════════════════════════════════════════════════ */}
        <section className="sa-hero pt-5 sm:pt-7" aria-labelledby="hero-title">
          {/* The airline's line is said twice on the way in — boarded on the
              splash, then under the aeroplane on the landing — so here it is
              only the page's name, for assistive technology. The page itself
              starts with the view: the way to a seat is up in the gate sign,
              stepping inside is on the view's own bar, and the sections are
              down its edge. */}
          <h1 id="hero-title" className="sr-only">Seat Airlines. Hold more. Fly higher.</h1>

          {/* ── The cockpit ──────────────────────────────────────────────
              The view and its deck, with the page's sections a tab away down
              its right edge. A section opens between the view and the tabs
              and the view narrows to make room, so looking from a seat on the
              wall happens beside the wall rather than a scroll above it. */}
          <div ref={cockpitRef} className={`sa-cockpit${panel ? ' is-open' : ''}`}>
          <div className="sa-cockpit__main">
          {/* ── The view ── */}
          <div className={lamps.shaking ? 'sa-viewport sd-shake' : 'sa-viewport'}>
            <ViewFrame
              label={
                camera === 'exterior'
                  ? `Outside · ${band.label}`
                  : camera === 'hold'
                    ? 'Cargo hold · below the floor'
                    : camera === 'deck'
                      ? 'Flight deck'
                      : `${viewZoneDef.name} · ${viewSeat.id} · ${facing === 'forward' ? 'forward' : `looking ${facing}`}`
              }
              onZoomOutBeyond={camera === 'exterior' ? undefined : () => setCamera('exterior')}
              zoomOutHint="Zoom out of the aircraft"
              actions={
                /* Sound belongs to the view it scores, not to the hero's call
                   to action: in the hero row it wrapped onto a line of its own
                   and pushed the headline down away from its eyebrow. */
                <>
                {camera === 'seat' ? (
                  <div className="sd-controls__look" role="group" aria-label="Turn your head">
                    {FACINGS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFacing(f.key)}
                        aria-pressed={facing === f.key}
                        aria-label={f.label}
                        className={chip(facing === f.key)}
                      >
                        {/* The arrows are said by the words; a narrow rail has room for the short ones. */}
                        <span className="sd-long" aria-hidden>{f.long}</span>
                        <span className="sd-short" aria-hidden>{f.short}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="sd-controls__look">
                    <button type="button" onClick={() => setCamera('seat')} className={chip(false)}>
                      {camera === 'exterior' ? 'Step inside' : 'Back to your seat'}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={aircraftAudio.toggle}
                  aria-pressed={aircraftAudio.enabled}
                  className="ui-pill sd-controls__sound"
                  title="Enable engine, airflow, cabin, and warning sounds"
                >
                  <DeckIcon name={aircraftAudio.enabled ? 'sound' : 'mute'} className="sd-controls__icon" />
                  {/* Out of sight but still the button's name when the rail is too narrow for it. */}
                  <span className="sd-controls__label">{aircraftAudio.enabled ? 'Sound on' : 'Sound off'}</span>
                </button>
                </>
              }
            >
              {camera === 'hold' ? (
                <Suspense fallback={<SceneLoading />}>
                  <CargoHold feed={feed} band={band} belowCutoff={belowCutoff} controls={controls} />
                </Suspense>
              ) : camera === 'exterior' ? (
                <Suspense fallback={<SceneLoading exterior />}>
                  <ExteriorView feed={feed} sky={sky} band={band} taken={taken} claimed={claimedSeat} viewing={viewSeat} controls={controls} />
                </Suspense>
              ) : camera === 'deck' ? (
                <Suspense fallback={<SceneLoading />}>
                  <FlightDeck feed={feed} lamps={lamps} sky={sky} band={band} controls={controls} />
                </Suspense>
              ) : (
                <Suspense fallback={<SceneLoading />}>
                  <CabinView3D
                    feed={feed}
                    sky={sky}
                    band={band}
                    seat={viewSeat}
                    zone={viewZoneDef}
                    facing={facing}
                    taken={taken}
                    adverts={advertImages}
                    controls={controls}
                  />
                </Suspense>
              )}
            </ViewFrame>
          </div>

          {/* ── The instrument deck ──────────────────────────────────────
              Walk, state and lamps are three readings of one aircraft, so they
              are one panel under the window divided by hairlines, rather than
              three cards floating a few pixels apart. */}
          <div className="sa-deck mt-3">
          {/* ── Walk the aircraft ──
              One selector, nose to tail: a track sunk into the panel with
              the stop you are at lit in it. It scrolls sideways rather than
              wrapping wherever the whole aeroplane does not fit on one line. */}
          <div className="sa-deck__strip sa-deck__strip--cyan flex-wrap items-center">
            <div className="sa-walk sd-chrome">
              <span className="sa-strip-label">Walk the aircraft</span>
              <div className="sa-seg" role="group" aria-label="Walk the aircraft">
                <button type="button" onClick={() => setCamera('exterior')} aria-pressed={camera === 'exterior'} className={seg(camera === 'exterior')}>
                  <DeckIcon name="plane" className="sa-seg__icon" />
                  Outside
                </button>
                {CABIN_ZONES.map((z) => (
                  <button
                    key={z.key}
                    type="button"
                    onClick={() => walkTo(z.key)}
                    onMouseEnter={z.key === 'deck' ? prefetchFlightDeck : undefined}
                    onFocus={z.key === 'deck' ? prefetchFlightDeck : undefined}
                    aria-pressed={camera !== 'exterior' && camera !== 'hold' && viewZone === z.key}
                    className={seg(camera !== 'exterior' && camera !== 'hold' && viewZone === z.key)}
                  >
                    <DeckIcon name={ZONE_ICON[z.key]} className="sa-seg__icon" />
                    {z.name}
                  </button>
                ))}
                <button type="button" onClick={() => setCamera('hold')} aria-pressed={camera === 'hold'} className={seg(camera === 'hold')}>
                  <DeckIcon name="hold" className="sa-seg__icon" />
                  Cargo hold
                </button>
              </div>
            </div>

            {camera === 'seat' && (
              <div className="sa-walk sd-chrome xl:ml-auto">
                <span className="sa-strip-label">Seat</span>
                <div className="sa-seg" role="group" aria-label="Seat position">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos.key}
                      type="button"
                      onClick={() => setViewPosition(pos.key)}
                      aria-pressed={viewPosition === pos.key}
                      className={seg(viewPosition === pos.key)}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Where the flight is ──
              Three displays let into the panel, the whole route drawn as a
              moving map, and the overhead lamps as keys on the panel. No
              Band cell: the route names every level, and lights this one. */}
          <section className="sa-flight-state" aria-label="Flight state">
            <FlightReadouts tick={tick} sky={sky} />
            <ClimbRoute band={band} />
            <Annunciators lamps={lamps} />
          </section>
          </div>
          </div>

          <SectionPanel open={panel} onClose={closePanel} render={section} />
          <SectionDock open={panel} onToggle={togglePanel} onScores={openScores} scoresOpen={scoresOpen} />
          </div>
        </section>

      </main>

      {/* ── The footer ─────────────────────────────────────────────────
          A strip, not a finale. The page is one screen now — the sections
          open from the tab bar along the bottom of the screen — so the foot
          of it only has to sign off: the airline, the docs, and the line.
          The tab bar is the navigation at every size, so the footer does not
          repeat it. Full width, like the gate sign it answers at the top. */}
      <footer className="sa-footer">
        <div className="sa-footer__inner">
          <a href="#top" className="sa-footer__brand">
            <Wordmark />
          </a>
          <div className="sa-footer__docs">
            <DocsLink />
          </div>
          <nav className="sa-footer__legal" aria-label="Legal">
            <a href="./terms/">Terms</a>
            <a href="./privacy/">Privacy</a>
          </nav>
          <p className="sa-footer__line">Hold more. Fly higher.</p>
        </div>
      </footer>

      {advertising && (
        <AdvertDialog
          seat={advertising}
          current={banners[advertising] ?? null}
          shared={canPublish && Boolean(wallet.address)}
          onSave={async (banner: Banner) => {
            /* With a server configured and a wallet connected, the advert goes
               up for everybody — signed, so the wall can prove the seat was
               the publisher's. Without either, it stays in this browser and
               the dialog says as much rather than implying otherwise. */
            if (canPublish && wallet.address) {
              try {
                const { image } = await publishBanner({
                  owner: wallet.address,
                  image: banner.image,
                  alt: banner.alt,
                  href: banner.href,
                  sign: wallet.signMessage,
                });
                setByOwner((prev) => ({
                  ...prev,
                  [wallet.address as string]: { ...banner, image, published: true, owner: wallet.address as string },
                }));
                say(`Advert up on seat ${advertising}.`, 'pa');
                return null;
              } catch (e) {
                /* The server never answered — not deployed, not reachable,
                   or not allowing this origin. The advert is not at fault
                   and neither is the holder, who has already signed for it,
                   so it goes up in this browser rather than evaporating, and
                   the PA says plainly how far it got. Falling back on a
                   *refusal* would be the wrong thing entirely: a 415 or a
                   403 is the server having read it and said no, and hiding
                   that behind a local save would look like success. */
                if (e instanceof ServerUnreachable) {
                  if (!localBanners.put(advertising, banner)) {
                    return 'Could not save. Try a smaller image.';
                  }
                  setLocal(localBanners.read());
                  say(
                    `Advert up on seat ${advertising}, in this browser only.`,
                    'alert',
                  );
                  return null;
                }
                const message = e instanceof Error ? e.message : 'That advert could not be published.';
                // A refused signature is a decision, not a fault to report.
                return /reject|denied|cancel/i.test(message)
                  ? 'Not signed. Nothing went up.'
                  : message;
              }
            }
            if (!localBanners.put(advertising, banner)) {
              return 'Try a smaller image.';
            }
            setLocal(localBanners.read());
            say(`Advert up on seat ${advertising}.`, 'pa');
            return null;
          }}
          onClear={takeDownAdvert}
          onClose={() => setAdvertising(null)}
        />
      )}

      {/* Its own Suspense, like the logbook's below: the page's outer one
          would blank the whole site while the chunk loaded. */}
      {scoresOpen && (
        <Suspense fallback={null}>
          <ScoresDialog address={wallet.address} onClose={closeScores} />
        </Suspense>
      )}

      {/* Asked by `wallet.connect()` when this browser has more than one. */}
      <WalletPicker wallet={wallet} />

      {seatChange && (
        <SeatChange
          move={seatChange}
          onSeats={() => { setSeatChange(null); openPanel('wall'); }}
          onClose={() => setSeatChange(null)}
        />
      )}
      <SeatTicker items={ticker} onShown={tickerShown} />

      {/* Its own Suspense, with nothing for a fallback. The page's outer one
          would blank the whole site while this chunk loaded — a flash of the
          loading screen for anybody who typed the fragment, which is both bad
          to look at and the one thing that would tell a stranger they had
          guessed something real. */}
      {logbookOpen && (
        <Suspense fallback={null}>
          <Logbook
            manifest={manifest}
            address={seatKey}
            sign={wallet.signMessage}
            controls={controls}
            onControls={showControls}
            onClose={closeLogbook}
          />
        </Suspense>
      )}
      </div>
    </Suspense>
  );
}
