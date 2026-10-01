import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annunciators, FlightBand } from './flightModel';
import { carriagesFor } from './consist';

/** The railway's sounds, in public/rail. */
const RAIL = (file: string) => `${import.meta.env.BASE_URL}rail/${file}`;
const HORN_FILES = ['horn-1.mp3', 'horn-2.mp3', 'horn-long-short.mp3'] as const;

const INTERCOM_FILES = [
  '01_captain_speaking_intercom.mp3',
  '02_tray_tables_seats_upright_intercom.mp3',
  '03_fasten_seat_belts_takeoff_intercom.mp3',
  '04_unlikely_water_landing_intercom.mp3',
  '05_flight_crew_serving_food_intercom.mp3',
  '06_altitude_move_about_cabin_intercom.mp3',
  '07_funny_turbulence_warning_intercom.mp3',
  '08_secure_your_dignity_intercom.mp3',
  '09_finish_your_beverage_intercom.mp3',
  '10_tray_tables_again_intercom.mp3',
  '11_roller_coaster_turbulence_intercom.mp3',
  '12_secure_loose_items_intercom.mp3',
  '13_floating_coffee_intercom.mp3',
  '14_overhead_bins_not_escape_hatches_intercom.mp3',
  '15_restroom_reminder_intercom.mp3',
  '16_awkward_elevator_turbulence_intercom.mp3',
  '17_seat_back_reminder_intercom.mp3',
  '18_thank_you_for_pretending_intercom.mp3',
] as const;

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  recording: AudioBufferSourceNode;
  seatbeltBuffer: AudioBuffer;
  occasionalSeatbeltBuffer: AudioBuffer;
  /**
   * Each announcement, once it has been fetched and decoded. They are loaded
   * one at a time, during the pause before each is played — never all at
   * once — and kept, so a second hearing costs nothing.
   */
  intercomBuffers: Map<number, Promise<AudioBuffer | null>>;
  intercomOrder: number[];
  lastIntercomIndex: number | null;
  intercomTimer: number | null;
  occasionalSeatbeltTimer: number | null;
  /** The horns, once decoded: [short, second, long-and-short]. */
  horns: AudioBuffer[];
  /** The level-crossing bell, a short loop. */
  bell: AudioBuffer | null;
  hornTimer: number | null;
  activeSources: Set<AudioBufferSourceNode>;
  stopped: boolean;
}

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum);

const shuffled = (length: number) =>
  Array.from({ length }, (_, index) => index).sort(() => Math.random() - 0.5);

const playBuffer = (
  rig: AudioRig,
  buffer: AudioBuffer,
  volume = 0.6,
  onEnded?: () => void,
) => {
  const source = rig.ctx.createBufferSource();
  const gain = rig.ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(rig.master);
  rig.activeSources.add(source);
  source.onended = () => {
    rig.activeSources.delete(source);
    onEnded?.();
  };
  source.start();
};

/** One announcement, fetched and decoded the first time it is asked for. */
const loadIntercom = (rig: AudioRig, index: number): Promise<AudioBuffer | null> => {
  let loading = rig.intercomBuffers.get(index);
  if (!loading) {
    loading = fetch(`/intercom/${INTERCOM_FILES[index]}`)
      .then(async (r) => (r.ok ? rig.ctx.decodeAudioData(await r.arrayBuffer()) : null))
      .catch(() => null);
    rig.intercomBuffers.set(index, loading);
    /* A failure is not kept: the next time round it is tried again. */
    void loading.then((buffer) => { if (!buffer) rig.intercomBuffers.delete(index); });
  }
  return loading;
};

const nextIntercomIndex = (rig: AudioRig) => {
  if (rig.intercomOrder.length === 0) rig.intercomOrder = shuffled(INTERCOM_FILES.length);

  let index = rig.intercomOrder.pop() as number;
  // Never repeat the same announcement across a shuffle-bag boundary.
  if (index === rig.lastIntercomIndex && rig.intercomOrder.length > 0) {
    const alternative = rig.intercomOrder.pop() as number;
    rig.intercomOrder.unshift(index);
    index = alternative;
  }
  rig.lastIntercomIndex = index;
  return index;
};

const scheduleIntercom = (rig: AudioRig, first = false) => {
  if (rig.stopped) return;
  const delay = first ? randomBetween(12000, 24000) : randomBetween(18000, 42000);
  /* Chosen now and fetched during the pause, so it is ready when its turn
     comes without the other seventeen being downloaded alongside it. */
  const index = nextIntercomIndex(rig);
  const ready = loadIntercom(rig, index);
  rig.intercomTimer = window.setTimeout(() => {
    void ready.then((buffer) => {
      if (rig.stopped) return;
      if (buffer) playBuffer(rig, buffer, 0.58, () => scheduleIntercom(rig));
      else scheduleIntercom(rig);
    });
  }, delay);
};

const scheduleOccasionalSeatbelt = (rig: AudioRig) => {
  if (rig.stopped) return;
  // Keep this deliberately rare so it adds texture without becoming a second announcement stream.
  const delay = randomBetween(90000, 180000);
  rig.occasionalSeatbeltTimer = window.setTimeout(() => {
    if (rig.stopped) return;
    playBuffer(rig, rig.occasionalSeatbeltBuffer, 0.62, () => scheduleOccasionalSeatbelt(rig));
  }, delay);
};

/* Now and then the driver sounds the horn on the move. */
const scheduleHorn = (rig: AudioRig) => {
  if (rig.stopped) return;
  rig.hornTimer = window.setTimeout(() => {
    if (rig.stopped) return;
    const pick = rig.horns.slice(0, 2);
    const horn = pick[Math.floor(Math.random() * pick.length)];
    if (horn) playBuffer(rig, horn, 0.38, () => scheduleHorn(rig));
    else scheduleHorn(rig);
  }, randomBetween(45000, 110000));
};

/* Sound is on unless the visitor has turned it off, and that choice is
   remembered. Storage can be missing or refuse (a private window), in which
   case it is simply on. */
const SOUND_KEY = 'sa.sound';
const soundWanted = (): boolean => {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};
const rememberSound = (on: boolean) => {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* Nowhere to keep it: it will be on again next time. */
  }
};

/** Whether the browser counts the event being handled as the visitor's own doing, so sound may start. */
const activated = (): boolean => {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
};

export function useAircraftAudio(lamps: Annunciators, _change5m: number, band: FlightBand, marketCap?: number) {
  const [enabled, setEnabled] = useState(() => typeof window === 'undefined' || soundWanted());
  /* Read by a start already under way, which can outlast a change of mind:
     switched off while the sounds were still loading, it must not go on to
     play them. */
  const wanted = useRef(enabled);
  wanted.current = enabled;
  const starting = useRef(false);
  const rig = useRef<AudioRig | null>(null);
  const previous = useRef({ seatbelt: lamps.seatbelt, oxygen: lamps.oxygen, brace: lamps.brace, band });

  const stop = useCallback(() => {
    const current = rig.current;
    rig.current = null;
    if (!current) return;
    current.stopped = true;
    if (current.intercomTimer !== null) window.clearTimeout(current.intercomTimer);
    if (current.occasionalSeatbeltTimer !== null) window.clearTimeout(current.occasionalSeatbeltTimer);
    if (current.hornTimer !== null) window.clearTimeout(current.hornTimer);
    current.recording.stop();
    current.activeSources.forEach(source => source.stop());
    current.master.gain.setTargetAtTime(0.0001, current.ctx.currentTime, 0.12);
    window.setTimeout(() => void current.ctx.close(), 450);
  }, []);

  const start = useCallback(async () => {
    if (rig.current || starting.current) return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    starting.current = true;
    try {
      await begin(AudioContextClass);
    } finally {
      starting.current = false;
    }
  }, []);

  const begin = async (AudioContextClass: typeof AudioContext) => {
    const ctx = new AudioContextClass();
    /* Mobile browsers (Android/iOS) keep an AudioContext suspended even after
       resume() resolves unless a real buffer plays inside the user gesture.
       Playing one silent frame inside the same call stack as the tap is the
       standard unlock; without it resume() appears to succeed but ctx.state
       stays 'suspended' and nothing is ever heard. */
    try {
      const unlock = ctx.createBufferSource();
      unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      unlock.connect(ctx.destination);
      unlock.start(0);
    } catch { /* ignore — desktop contexts don't need this */ }
    /* Without the visitor's say-so a context stays suspended and resuming
       it never settles; give up after a moment rather than wait forever,
       and the next click or key tries again. */
    await Promise.race([ctx.resume(), new Promise((r) => window.setTimeout(r, 1500))]);
    if (ctx.state !== 'running' || !wanted.current) {
      void ctx.close();
      return;
    }
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);

    // The train on the rails: the bed everything else plays over.
    const recordingResponse = await fetch(RAIL('track-loop.mp3'));
    if (!recordingResponse.ok) throw new Error('The track sound could not be loaded.');
    const recording = ctx.createBufferSource();
    recording.buffer = await ctx.decodeAudioData(await recordingResponse.arrayBuffer());
    recording.loop = true;
    recording.connect(master);

    if (!wanted.current) { void ctx.close(); return; }

    // Ambient starts now. The seatbelt chimes load in the background, and the
    // intercom announcements one at a time, each just before it is played.
    const silence = ctx.createBuffer(1, 1, ctx.sampleRate);
    const nextRig: AudioRig = {
      ctx,
      master,
      recording,
      seatbeltBuffer: silence,
      occasionalSeatbeltBuffer: silence,
      intercomBuffers: new Map(),
      intercomOrder: [],
      lastIntercomIndex: null,
      intercomTimer: null,
      occasionalSeatbeltTimer: null,
      horns: [],
      bell: null,
      hornTimer: null,
      activeSources: new Set(),
      stopped: false,
    };

    recording.start();
    rig.current = nextRig;

    // Load the rest in parallel without blocking playback.
    void (async () => {
      try {
        const decode = async (url: string) => {
          const r = await fetch(url);
          if (!r.ok) return null;
          return ctx.decodeAudioData(await r.arrayBuffer());
        };
        /* The sign's chime and the occasional one are the same recording —
           they were two byte-identical files, fetched and decoded twice. */
        const chime = await decode('/seatbelt-warning.mp3');
        const target = rig.current;
        if (!target || target.stopped) return;
        if (chime) {
          target.seatbeltBuffer = chime;
          target.occasionalSeatbeltBuffer = chime;
        }
        scheduleIntercom(target, true);
        scheduleOccasionalSeatbelt(target);
        const [horns, bell] = await Promise.all([
          Promise.all(HORN_FILES.map((f) => decode(RAIL(f)).catch(() => null))),
          decode(RAIL('crossing-bell.mp3')).catch(() => null),
        ]);
        if (target.stopped) return;
        target.horns = horns.filter((b): b is AudioBuffer => !!b);
        target.bell = bell;
        scheduleHorn(target);
      } catch {
        // Secondary audio unavailable — ambient keeps playing.
      }
    })();
  };

  const toggle = useCallback(() => {
    setEnabled(value => {
      const next = !value;
      wanted.current = next;
      rememberSound(next);
      if (next) void start().catch(() => setEnabled(false)); else stop();
      return next;
    });
  }, [start, stop]);

  /* On by default — but no browser will make a sound before the visitor has
     touched the page, so it starts on their first click, tap or key: the
     landing's Enter, as often as not. */
  useEffect(() => {
    if (!enabled || rig.current) return;
    const events = ['pointerup', 'click', 'touchend', 'keydown'] as const;
    const detach = () => events.forEach((type) => window.removeEventListener(type, go, true));
    function go() {
      if (!activated() || rig.current) return;
      detach();
      void start().catch(() => {});
    }
    events.forEach((type) => window.addEventListener(type, go, true));
    return detach;
  }, [enabled, start]);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const current = rig.current;
    if (!enabled || !current) return;
    if (previous.current.seatbelt !== lamps.seatbelt && lamps.seatbelt) {
      playBuffer(current, current.seatbeltBuffer, 0.7);
    }
    previous.current = { seatbelt: lamps.seatbelt, oxygen: lamps.oxygen, brace: lamps.brace, band };
  }, [enabled, lamps, band]);

  /* The market, heard. A carriage coupled on (the market has passed a 1-2-5
     milestone) is greeted with the long-and-short horn; one uncoupled (it
     has fallen back under one) rings the crossing bell. The first reading
     only sets the count. */
  const cars = marketCap === undefined ? null : carriagesFor(marketCap);
  const lastCars = useRef<number | null>(null);
  useEffect(() => {
    if (cars === null) return;
    const before = lastCars.current;
    lastCars.current = cars;
    const current = rig.current;
    if (before === null || before === cars || !enabled || !current) return;
    if (cars > before) {
      const horn = current.horns[current.horns.length - 1];
      if (horn) playBuffer(current, horn, 0.5);
    } else if (current.bell) {
      const bell = current.bell;
      let rings = 3;
      const ring = () => { if (--rings >= 0 && !current.stopped) playBuffer(current, bell, 0.45, ring); };
      ring();
    }
  }, [cars, enabled]);

  /* The cabin chime, on demand: a change of seat is announced the way the
     seat-belt sign is. Only with the sound on and running — a chime is never
     the thing that starts the cabin's sound. */
  const ding = useCallback(() => {
    const current = rig.current;
    if (wanted.current && current) playBuffer(current, current.seatbeltBuffer, 0.8);
  }, []);

  return { enabled, toggle, ding };
}
