import { memo } from 'react';
import type { Drive } from '../lib/landingGame';
import { ufoLiftAngle, ufoSpeedAngle } from '../lib/instruments';
import type { LandingHud } from './LandingScene';

/**
 * The saucer's instruments, in place of the airliner's.
 *
 * Whoever built it did not read knots: the same three readings — how fast,
 * which way up, and climbing or sinking — on dials of their own. A ringed
 * velocity dial on a log scale, out to a dash; an orb for the attitude, the
 * horizon a plane of light through it; a lift arc that reads a vertical
 * dash. Under them, what the drive is set to and how the field is holding.
 *
 * The same refs as FlightInstruments, so the scene turns these needles the
 * same way (with the saucer's scales: see `ufoSpeedAngle`, `ufoLiftAngle`),
 * every frame, with no React render. The labels are glyphs, not words: the
 * page says what each reading is in its title, for anyone who asks.
 */

interface Props {
  hud: LandingHud;
  drive: Drive;
  /** An airliner has hit it: the field is scrambled. */
  scrambled: boolean;
}

const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)] as const;
};
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

/* Made-up script: a handful of glyphs in a 10-unit box, strokes only. */
const GLYPHS = [
  'M2 2 L8 2 M5 2 L5 8 M2 8 L8 5',
  'M2 8 L5 2 L8 8 M3.5 5.5 H6.5',
  'M5 1.5 A3.5 3.5 0 1 1 4.9 1.5 M5 5 L5 9',
  'M2 2 L8 8 M8 2 L5 5 M2 5 H4',
  'M3 2 V8 H7 M7 2 L5 5',
  'M2 5 H8 M5 2 L8 5 L5 8',
];
function Glyph({ n, x, y, size = 7 }: { n: number; x: number; y: number; size?: number }) {
  const k = size / 10;
  return (
    <path
      d={GLYPHS[n % GLYPHS.length]}
      transform={`translate(${(x - size / 2).toFixed(2)} ${(y - size / 2).toFixed(2)}) scale(${k})`}
      className="sa-xeno__glyph"
    />
  );
}

/** The bezel: a ring of light, broken into segments, round a dark face. */
function Ring({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-face`} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#1B0F33" />
          <stop offset="70%" stopColor="#07040F" />
          <stop offset="100%" stopColor="#020106" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48.5" className="sa-xeno__rim" />
      <circle cx="50" cy="50" r="45.5" fill={`url(#${id}-face)`} />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={arc(47, i * 30 + 4, i * 30 + 26)} className="sa-xeno__segment" />
      ))}
    </>
  );
}

function Needle({ refTo }: { refTo: LandingHud['speedNeedle'] }) {
  return (
    <g ref={refTo} className="sa-xeno__needle">
      <path d="M50 9 L53 46 L50 50 L47 46 Z" />
      <circle cx="50" cy="50" r="5" className="sa-xeno__hub" />
      <circle cx="50" cy="50" r="1.8" className="sa-xeno__core" />
    </g>
  );
}

const Velocity = memo(({ hud }: { hud: LandingHud }) => {
  const marks = [0, 100, 300, 1000, 3000, 6000];
  return (
    <svg viewBox="0 0 100 100" className="sa-gauge sa-xeno" aria-hidden>
      <Ring id="xv" />
      <path d={arc(40, ufoSpeedAngle(0), ufoSpeedAngle(6000))} className="sa-xeno__band" />
      <path d={arc(40, ufoSpeedAngle(1000), ufoSpeedAngle(6000))} className="sa-xeno__band is-hot" />
      <circle cx="50" cy="50" r="33" className="sa-xeno__orbit" />
      {marks.map((kt, i) => (
        <g key={kt}>
          <path d={tick(36, 44, ufoSpeedAngle(kt))} className="sa-xeno__tick is-major" />
          <Glyph n={i} x={at(28, ufoSpeedAngle(kt))[0]} y={at(28, ufoSpeedAngle(kt))[1]} size={6} />
        </g>
      ))}
      {[30, 60, 200, 500, 2000].map((kt) => <path key={kt} d={tick(40, 44, ufoSpeedAngle(kt))} className="sa-xeno__tick" />)}
      <Needle refTo={hud.speedNeedle} />
      <text ref={hud.speedText} x="50" y="78" className="sa-xeno__read">—</text>
    </svg>
  );
});

const Orb = memo(({ hud }: { hud: LandingHud }) => (
  <svg viewBox="0 0 100 100" className="sa-gauge sa-xeno sa-xeno--orb" aria-hidden>
    <defs>
      <clipPath id="xo-clip">
        <circle cx="50" cy="50" r="43" />
      </clipPath>
      <linearGradient id="xo-up" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#05020C" />
        <stop offset="100%" stopColor="#1C3F4A" />
      </linearGradient>
      <linearGradient id="xo-down" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2A0F45" />
        <stop offset="100%" stopColor="#0A0414" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48.5" className="sa-xeno__rim" />
    <g clipPath="url(#xo-clip)">
      <g ref={hud.horizon}>
        <rect x="-60" y="-80" width="220" height="130" fill="url(#xo-up)" />
        <rect x="-60" y="50" width="220" height="130" fill="url(#xo-down)" />
        {/* The ground as a grid of light, running off to the horizon. */}
        {[56, 63, 73, 88].map((y) => <path key={y} d={`M-60 ${y} H160`} className="sa-xeno__grid" />)}
        {[-40, -20, 0, 20, 40].map((x) => <path key={x} d={`M${50 + x * 0.25} 50 L${50 + x * 2.2} 130`} className="sa-xeno__grid" />)}
        <path d="M-60 50 H160" className="sa-xeno__horizon" />
        {[-20, -10, 10, 20].map((deg) => (
          <circle key={deg} cx="50" cy={50 - deg * 1.3} r={Math.abs(deg) === 10 ? 1.2 : 1.8} className="sa-xeno__dot" />
        ))}
      </g>
    </g>
    {[-60, -30, 30, 60].map((deg) => <path key={deg} d={tick(43, 47, deg)} className="sa-xeno__tick is-major" />)}
    <path d="M50 3.5 L47.5 8.5 H52.5 Z" className="sa-xeno__index" />
    {/* The saucer itself, fixed: the orb turns behind it. */}
    <ellipse cx="50" cy="51.5" rx="15" ry="3.6" className="sa-xeno__craft" />
    <path d="M43 50 A7 6 0 0 1 57 50" className="sa-xeno__craft is-dome" />
    <circle cx="50" cy="50" r="43" className="sa-xeno__glass" />
  </svg>
));

const Lift = memo(({ hud }: { hud: LandingHud }) => {
  const marks = [0, 2000, 10000, 60000];
  return (
    <svg viewBox="0 0 100 100" className="sa-gauge sa-xeno" aria-hidden>
      <Ring id="xl" />
      <path d={arc(40, ufoLiftAngle(0), ufoLiftAngle(200000))} className="sa-xeno__band" />
      <path d={arc(40, ufoLiftAngle(-200000), ufoLiftAngle(0))} className="sa-xeno__band is-down" />
      {marks.flatMap((m) => (m ? [m, -m] : [0])).map((m, i) => (
        <path key={m} d={tick(i ? 36 : 33, 44, ufoLiftAngle(m))} className="sa-xeno__tick is-major" />
      ))}
      <Glyph n={1} x={34} y={34} size={7} />
      <Glyph n={4} x={34} y={66} size={7} />
      <Needle refTo={hud.varioNeedle} />
      <text ref={hud.varioText} x="71" y="51" className="sa-xeno__read is-small">0.0</text>
    </svg>
  );
});

const DRIVE_TITLE: Record<Drive, string> = { forward: 'Forward flight', vertical: 'Straight up and down', strafe: 'Strafe sideways' };

export default function UfoInstruments({ hud, drive, scrambled }: Props) {
  return (
    <div className="sa-gauges sa-gauges--xeno" aria-hidden>
      <p ref={hud.lift} className="sa-gauges__lift">
        <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1.5 11 7H8v3.5H4V7H1z" /></svg>
        Updraft
      </p>
      <div className="sa-gauges__row">
        <Velocity hud={hud} />
        <Orb hud={hud} />
        <Lift hud={hud} />
      </div>
      <div className="sa-gauges__engines">
        <span className="sa-xeno__state" title={`Drive: ${DRIVE_TITLE[drive]}`}>
          <span className="sa-xeno__lamp" aria-hidden />
          <Glyphs n={drive === 'forward' ? 0 : drive === 'vertical' ? 2 : 4} />
          {drive === 'forward' ? 'FWD' : drive === 'vertical' ? 'VERT' : 'SIDE'}
        </span>
        <span className={`sa-xeno__state${scrambled ? ' is-scrambled' : ''}`} title={scrambled ? 'Field scrambled' : 'Field stable'}>
          <span className="sa-xeno__lamp" aria-hidden />
          <Glyphs n={scrambled ? 3 : 5} />
          {scrambled ? 'SCRAMBLED' : 'FIELD'}
        </span>
      </div>
    </div>
  );
}

/** Two glyphs, inline: the label in the builders' own script ahead of ours. */
function Glyphs({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 20 10" className="sa-xeno__script" aria-hidden>
      <path d={GLYPHS[n % GLYPHS.length]} />
      <path d={GLYPHS[(n + 2) % GLYPHS.length]} transform="translate(10 0)" />
    </svg>
  );
}
