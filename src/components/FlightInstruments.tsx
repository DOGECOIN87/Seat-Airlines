import { memo } from 'react';
import type { Cause } from '../lib/landingGame';
import { SPEED_DIAL, speedAngle, varioAngle } from '../lib/instruments';
import type { LandingHud } from './LandingScene';

/**
 * The landing game's instruments: the three that matter on one engine.
 *
 * Airspeed on the left, because the whole art of it is holding the speed
 * just above the stall, and the stall is marked; the attitude in the
 * middle, because the other half is keeping the wings level; the climb
 * rate on the right, so a pilot can see the updraft they are riding. Under
 * them, the two engines, lit green, red, or blue-white for lightning.
 *
 * Drawn once, as SVG in a 100-unit square each, with no text a screen
 * reader needs; the scene turns the needles and moves the horizon itself,
 * every frame, through the refs (see LandingScene), with no React render.
 */

export interface EngineState {
  /** 'run' — or gone, and to what. */
  state: 'run' | Cause;
}

interface Props {
  hud: LandingHud;
  /** Port (ENG 1) and starboard (ENG 2). */
  engines: readonly [EngineState, EngineState];
  jet?: boolean;
}

/** A point on a dial: `r` from the middle, `deg` clockwise from twelve o'clock. */
const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)] as const;
};
/** An arc along a dial, from one angle to another, clockwise. */
const arc = (r: number, from: number, to: number) => {
  const [x0, y0] = at(r, from);
  const [x1, y1] = at(r, to);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const tick = (r0: number, r1: number, deg: number) => {
  const [x0, y0] = at(r0, deg);
  const [x1, y1] = at(r1, deg);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/** The stall, in knots (95 m/s), and the band just above it the pilot is trying to hold. */
const STALL_KT = 185;
const HOLD_KT = 215;

/** The bezel every dial sits in. */
function Bezel({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-face`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#15213A" />
          <stop offset="100%" stopColor="#060A14" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48.5" className="sa-gauge__rim" />
      <circle cx="50" cy="50" r="46" fill={`url(#${id}-face)`} />
    </>
  );
}

function Needle({ refTo }: { refTo: LandingHud['speedNeedle'] }) {
  return (
    <g ref={refTo} className="sa-gauge__needle">
      <path d="M50 11 L52.2 50 L50 58 L47.8 50 Z" />
      <circle cx="50" cy="50" r="4.2" className="sa-gauge__hub" />
    </g>
  );
}

const Airspeed = memo(({ hud, jet = false }: { hud: LandingHud; jet?: boolean }) => {
  const max = jet ? 800 : SPEED_DIAL.max;
  const a = (kt: number) => speedAngle(kt, max);
  const minor = Array.from({ length: max / 20 + 1 }, (_, i) => i * 20);
  return (
    <svg viewBox="0 0 100 100" className="sa-gauge" aria-hidden>
      <Bezel id="asi" />
      <path d={arc(41, a(0), a(STALL_KT))} className="sa-gauge__band is-red" />
      <path d={arc(41, a(STALL_KT), a(HOLD_KT))} className="sa-gauge__band is-amber" />
      <path d={arc(41, a(HOLD_KT), a(max))} className="sa-gauge__band is-green" />
      {minor.map((kt) => (
        <path key={kt} d={tick(kt % 100 ? 40 : 37, 44, a(kt))} className={kt % 100 ? 'sa-gauge__tick' : 'sa-gauge__tick is-major'} />
      ))}
      {(jet ? [0, 200, 400, 600, 800] : [0, 100, 200, 300, 400]).map((kt) => {
        const [x, y] = at(29.5, a(kt));
        return <text key={kt} x={x} y={y} className="sa-gauge__num">{kt / 100}</text>;
      })}
      <text x="50" y="30" className="sa-gauge__unit">KT</text>
      <Needle refTo={hud.speedNeedle} />
      <text ref={hud.speedText} x="50" y="76" className="sa-gauge__read">—</text>
    </svg>
  );
});

const Vario = memo(({ hud }: { hud: LandingHud }) => {
  const marks = [0, 1000, 2000, 4000, 8000];
  return (
    <svg viewBox="0 0 100 100" className="sa-gauge" aria-hidden>
      <Bezel id="vsi" />
      <path d={arc(41, varioAngle(0), varioAngle(12000))} className="sa-gauge__band is-green is-soft" />
      <path d={arc(41, varioAngle(-12000), varioAngle(-2500))} className="sa-gauge__band is-red is-soft" />
      {marks.flatMap((m) => (m ? [m, -m] : [0])).map((m) => (
        <path key={m} d={tick(m ? 37 : 34, 44, varioAngle(m))} className="sa-gauge__tick is-major" />
      ))}
      {[500, 1500, 3000, 6000].flatMap((m) => [m, -m]).map((m) => (
        <path key={m} d={tick(40, 44, varioAngle(m))} className="sa-gauge__tick" />
      ))}
      {marks.flatMap((m) => (m ? [m, -m] : [0])).map((m) => {
        const [x, y] = at(29.5, varioAngle(m));
        return <text key={m} x={x} y={y} className="sa-gauge__num">{Math.abs(m) / 1000}</text>;
      })}
      <text x="38" y="37" className="sa-gauge__unit">UP</text>
      <text x="38" y="63" className="sa-gauge__unit">DN</text>
      <Needle refTo={hud.varioNeedle} />
      {/* At three o'clock: the one place on this dial the needle never reaches. */}
      <text ref={hud.varioText} x="70" y="50" className="sa-gauge__read is-small">0.0</text>
    </svg>
  );
});

const Attitude = memo(({ hud }: { hud: LandingHud }) => (
  <svg viewBox="0 0 100 100" className="sa-gauge sa-gauge--adi" aria-hidden>
    <defs>
      <clipPath id="adi-clip">
        <circle cx="50" cy="50" r="44" />
      </clipPath>
      <linearGradient id="adi-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0E4C9C" />
        <stop offset="100%" stopColor="#3A9BF0" />
      </linearGradient>
      <linearGradient id="adi-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7A4B22" />
        <stop offset="100%" stopColor="#3B230F" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48.5" className="sa-gauge__rim" />
    <g clipPath="url(#adi-clip)">
      <g ref={hud.horizon}>
        <rect x="-60" y="-80" width="220" height="130" fill="url(#adi-sky)" />
        <rect x="-60" y="50" width="220" height="130" fill="url(#adi-ground)" />
        <path d="M-60 50 H160" className="sa-adi__horizon" />
        {[-20, -10, 10, 20].map((deg) => (
          <g key={deg}>
            <path d={`M${50 - (Math.abs(deg) === 10 ? 11 : 16)} ${50 - deg * 1.3} H${50 + (Math.abs(deg) === 10 ? 11 : 16)}`} className="sa-adi__ladder" />
            <path d={`M44 ${50 - (deg - 5) * 1.3} H56`} className="sa-adi__ladder is-half" />
          </g>
        ))}
      </g>
    </g>
    {/* The bank scale: fixed on the bezel, a mark at 10, 20, 30 and 45 each way. */}
    {[-45, -30, -20, -10, 10, 20, 30, 45].map((deg) => (
      <path key={deg} d={tick(Math.abs(deg) % 30 ? 42 : 40, 46, deg)} className="sa-adi__bank" />
    ))}
    <path d="M50 4 L47 9.5 H53 Z" className="sa-adi__index" />
    {/* The aeroplane, fixed: the horizon moves behind it. */}
    <path d="M24 50 H40 L45 55.5 M76 50 H60 L55 55.5" className="sa-adi__plane" />
    <circle cx="50" cy="50" r="2.2" className="sa-adi__dot" />
    <circle cx="50" cy="50" r="44" className="sa-adi__glass" />
  </svg>
));

function Engine({ n, e }: { n: 1 | 2; e: EngineState }) {
  const label = e.state === 'run' ? 'Running' : e.state === 'lightning' ? 'Struck by lightning' : 'Fire';
  return (
    <span className={`sa-engine is-${e.state}`} title={`ENG ${n}: ${label}`}>
      <span className="sa-engine__lamp" aria-hidden />
      ENG {n}
      {e.state !== 'run' && <span className="sa-engine__state">{e.state === 'lightning' ? 'STRIKE' : 'FIRE'}</span>}
    </span>
  );
}

export default function FlightInstruments({ hud, engines, jet = false }: Props) {
  return (
    <div className="sa-gauges" aria-hidden>
      <p ref={hud.lift} className="sa-gauges__lift">
        <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1.5 11 7H8v3.5H4V7H1z" /></svg>
        Updraft
      </p>
      <div className="sa-gauges__row">
        <Airspeed hud={hud} jet={jet} />
        <Attitude hud={hud} />
        <Vario hud={hud} />
      </div>
      <div className="sa-gauges__engines">
        <Engine n={1} e={engines[0]} />
        {!jet && <Engine n={2} e={engines[1]} />}
      </div>
    </div>
  );
}
