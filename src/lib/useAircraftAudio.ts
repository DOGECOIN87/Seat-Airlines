import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annunciators, FlightBand } from './flightModel';

const INTERCOM_FILES = [
  '01_captain_speaking_intercom.wav',
  '02_tray_tables_seats_upright_intercom.wav',
  '03_fasten_seat_belts_takeoff_intercom.wav',
  '04_unlikely_water_landing_intercom.wav',
  '05_flight_crew_serving_food_intercom.wav',
  '06_altitude_move_about_cabin_intercom.wav',
  '07_funny_turbulence_warning_intercom.wav',
  '08_secure_your_dignity_intercom.wav',
  '09_finish_your_beverage_intercom.wav',
  '10_tray_tables_again_intercom.wav',
  '11_roller_coaster_turbulence_intercom.wav',
  '12_secure_loose_items_intercom.wav',
  '13_floating_coffee_intercom.wav',
  '14_overhead_bins_not_escape_hatches_intercom.wav',
  '15_restroom_reminder_intercom.wav',
  '16_awkward_elevator_turbulence_intercom.wav',
  '17_seat_back_reminder_intercom.wav',
  '18_thank_you_for_pretending_intercom.wav',
] as const;

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  recording: AudioBufferSourceNode;
  seatbeltBuffer: AudioBuffer;
  occasionalSeatbeltBuffer: AudioBuffer;
  intercomBuffers: AudioBuffer[];
  intercomOrder: number[];
  lastIntercomIndex: number | null;
  intercomTimer: number | null;
  occasionalSeatbeltTimer: number | null;
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

const nextIntercomIndex = (rig: AudioRig) => {
  if (rig.intercomOrder.length === 0) rig.intercomOrder = shuffled(rig.intercomBuffers.length);

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
  rig.intercomTimer = window.setTimeout(() => {
    if (rig.stopped) return;
    const index = nextIntercomIndex(rig);
    playBuffer(rig, rig.intercomBuffers[index], 0.58, () => scheduleIntercom(rig));
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

export function useAircraftAudio(lamps: Annunciators, _change5m: number, band: FlightBand) {
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

    const recordingResponse = await fetch('/flight-cabin-ambience-loop.mp3');
    if (!recordingResponse.ok) throw new Error('Flight cabin ambience could not be loaded.');
    const recording = ctx.createBufferSource();
    recording.buffer = await ctx.decodeAudioData(await recordingResponse.arrayBuffer());
    recording.loop = true;
    recording.connect(master);

    const warningResponse = await fetch('/seatbelt-warning.mp3');
    if (!warningResponse.ok) throw new Error('Seat-belt warning sound could not be loaded.');
    const seatbeltBuffer = await ctx.decodeAudioData(await warningResponse.arrayBuffer());

    const occasionalSeatbeltResponse = await fetch('/seatbelt-online-audio-converter.mp3');
    if (!occasionalSeatbeltResponse.ok) throw new Error('Occasional seat-belt sound could not be loaded.');
    const occasionalSeatbeltBuffer = await ctx.decodeAudioData(await occasionalSeatbeltResponse.arrayBuffer());

    const intercomBuffers = await Promise.all(
      INTERCOM_FILES.map(async file => {
        const response = await fetch(`/intercom/${file}`);
        if (!response.ok) throw new Error(`Intercom sound could not be loaded: ${file}`);
        return ctx.decodeAudioData(await response.arrayBuffer());
      }),
    );

    const nextRig: AudioRig = {
      ctx,
      master,
      recording,
      seatbeltBuffer,
      occasionalSeatbeltBuffer,
      intercomBuffers,
      intercomOrder: shuffled(intercomBuffers.length),
      lastIntercomIndex: null,
      intercomTimer: null,
      occasionalSeatbeltTimer: null,
      activeSources: new Set(),
      stopped: false,
    };

    // Switched off while it was loading: nothing to start after all.
    if (!wanted.current) {
      void ctx.close();
      return;
    }
    recording.start();
    rig.current = nextRig;
    scheduleIntercom(nextRig, true);
    scheduleOccasionalSeatbelt(nextRig);
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

  /* The cabin chime, on demand: a change of seat is announced the way the
     seat-belt sign is. Only with the sound on and running — a chime is never
     the thing that starts the cabin's sound. */
  const ding = useCallback(() => {
    const current = rig.current;
    if (wanted.current && current) playBuffer(current, current.seatbeltBuffer, 0.8);
  }, []);

  return { enabled, toggle, ding };
}
