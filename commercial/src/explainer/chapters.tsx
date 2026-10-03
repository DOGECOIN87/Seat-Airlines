/**
 * The explainer's chapters: a step on the left, the site acting it out on
 * the right. Every chapter is drawn from its own frame `f`, so the title can
 * be drawn frozen at frame 0 for the loop's seam.
 */
import React from 'react';
import { Easing, Img, interpolate, random, staticFile } from 'remotion';
import { SEAT_ORDER } from '../../../src/lib/seating';
import { Badge, C, FlapTile, H, Layer, MONO, PlaneTop, SANS, W, clamp } from '../intro/kit';
import { FUSELAGE, SEAT_LAYOUT, ZONE_COLOR } from '../intro/scenes';
import { cue, cues, type Chapter } from './timing';

const eo = Easing.out(Easing.cubic);
const eio = Easing.inOut(Easing.cubic);
const k = (f: number, a: number, b: number, easing = eo) => interpolate(f, [a, b], [0, 1], { ...clamp, easing });
const pop = (f: number, at: number) => (f < at ? 0 : interpolate(f - at, [0, 5, 11], [0, 1.08, 1], clamp));

export type ChapterProps = { f: number; ch: Chapter };

/* ── Furniture ─────────────────────────────────────────────────────── */

const CARD = { x: 990, y: 190, w: 810, h: 650 };

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 30, overflow: 'hidden',
    background: 'linear-gradient(160deg, rgba(30,52,96,0.55), rgba(10,18,36,0.75))', border: '1.5px solid rgba(160,215,255,0.18)',
    boxShadow: '0 40px 120px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)', ...style,
  }}>{children}</div>
);

/** The step's words, left of the card. */
export const StepText: React.FC<{ f: number; num: string; kicker: string; title: string; body: string }> = ({ f, num, kicker, title, body }) => (
  <div style={{ position: 'absolute', left: 130, top: 270, width: 780 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, opacity: k(f, 2, 12) }}>
      <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 88, color: C.cyan, lineHeight: 1 }}>{num}</span>
      <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 26, letterSpacing: '0.28em', color: 'rgba(244,248,252,0.7)' }}>{kicker}</span>
    </div>
    <div style={{ marginTop: 26, fontFamily: SANS, fontWeight: 900, fontSize: 76, lineHeight: 1.04, color: C.ink, letterSpacing: '-0.01em', opacity: k(f, 6, 18), transform: `translateY(${(1 - k(f, 6, 20)) * 24}px)` }}>{title}</div>
    <div style={{ marginTop: 26, fontFamily: SANS, fontWeight: 600, fontSize: 34, lineHeight: 1.38, color: 'rgba(244,248,252,0.78)', opacity: k(f, 12, 26), transform: `translateY(${(1 - k(f, 12, 28)) * 18}px)` }}>{body}</div>
  </div>
);

/** A mouse pointer gliding between points; `click` frames make a ripple. */
const Cursor: React.FC<{ f: number; path: [number, number, number][]; clicks?: number[] }> = ({ f, path, clicks = [] }) => {
  let x = path[0][1], y = path[0][2];
  for (let i = 1; i < path.length; i++) {
    const p = k(f, path[i - 1][0], path[i][0], eio);
    if (f >= path[i - 1][0]) { x = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * p; y = path[i - 1][2] + (path[i][2] - path[i - 1][2]) * p; }
  }
  const press = clicks.some((c) => f >= c && f < c + 4);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: k(f, path[0][0] - 6, path[0][0]) }}>
      {clicks.map((c) => f >= c && f < c + 18 && (
        <div key={c} style={{ position: 'absolute', left: -40 * k(f, c, c + 16) - 4, top: -40 * k(f, c, c + 16) - 4, width: 80 * k(f, c, c + 16) + 8, height: 80 * k(f, c, c + 16) + 8, borderRadius: '50%', border: '3px solid rgba(0,201,241,0.9)', opacity: 1 - k(f, c, c + 18) }} />
      ))}
      <svg width={44} height={52} viewBox="0 0 22 26" style={{ transform: `scale(${press ? 0.86 : 1})`, transformOrigin: '0 0', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>
        <path d="M1 1 L1 20 L6 15.5 L9.6 24 L13 22.6 L9.5 14.4 L16 14.4 Z" fill="#fff" stroke="#0B1324" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const Button: React.FC<{ label: string; x: number; y: number; w: number; h?: number; primary?: boolean; pressed?: boolean; style?: React.CSSProperties }> = ({ label, x, y, w, h = 64, primary, pressed, style }) => (
  <div style={{
    position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: '0.04em', color: primary ? '#06101F' : C.ink,
    background: primary ? 'linear-gradient(180deg, #2FDBFF, #0087EA)' : 'rgba(255,255,255,0.06)', border: primary ? 'none' : '1.5px solid rgba(255,255,255,0.25)',
    transform: `scale(${pressed ? 0.95 : 1})`, boxShadow: primary ? '0 10px 30px rgba(0,135,234,0.35)' : 'none', ...style,
  }}>{label}</div>
);

/* ── Title (also the loop's seam) ──────────────────────────────────── */

export const Title: React.FC<{ f: number; ch: Chapter }> = ({ f, ch }) => (
  <Layer>
    <div style={{ position: 'absolute', left: 960 - 170, top: 130, width: 340, height: 340 }}>
      <Badge size={340} shine={(f - cue(ch, 'shine')) / 30} glow={0.75} />
    </div>
    <div style={{ position: 'absolute', left: 0, width: W, top: 530, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: '0.42em', color: C.cyan, paddingLeft: '0.42em' }}>PRE-FLIGHT BRIEFING</div>
    <div style={{
      position: 'absolute', left: 0, width: W, top: 590, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 112, letterSpacing: '-0.01em',
      backgroundImage: 'linear-gradient(180deg, #FFFFFF 35%, #BFE6FF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    }}>How Seat Airlines works</div>
    <div style={{ position: 'absolute', left: 0, width: W, top: 750, textAlign: 'center', fontFamily: SANS, fontWeight: 600, fontSize: 36, color: 'rgba(244,248,252,0.72)' }}>
      Eight things to know before you board.
    </div>
  </Layer>
);

/* ── 01 Get the token ──────────────────────────────────────────────── */

const FAKE_CA = Array.from({ length: 34 }, (_, i) => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(random(`ca${i}`) * 58)]).join('');

export const Token: React.FC<ChapterProps> = ({ f, ch }) => {
  const click = cue(ch, 'click');
  const copied = f >= click;
  const strip = k(f, cue(ch, 'strip'), cue(ch, 'strip') + 14);
  const glow = f > 24 && f < click ? 0.5 + 0.5 * Math.sin((f - 24) * 0.25) : 0;
  return (
    <>
      <StepText f={f} num="01" kicker="GET THE TOKEN" title="Find the CA." body="The contract address sits on the strip across the very top of the page. Copy takes it exactly." />
      <Card>
        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 56, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, opacity: 0.8 }} />)}
          <div style={{ marginLeft: 18, flex: 1, height: 32, borderRadius: 10, background: 'rgba(0,0,0,0.3)', fontFamily: MONO, fontSize: 18, color: 'rgba(244,248,252,0.7)', display: 'flex', alignItems: 'center', paddingLeft: 16 }}>seat-airlines.space</div>
        </div>
        {/* The CA strip. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 56, height: 78, background: '#060B16', display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px',
          transform: `translateY(${(1 - strip) * -78}px)`, boxShadow: `0 0 0 3px rgba(0,201,241,${glow * 0.9}), 0 0 40px rgba(0,201,241,${glow * 0.5})`,
        }}>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 20, color: '#06101F', background: C.cyan, borderRadius: 8, padding: '6px 12px' }}>CA</div>
          <div style={{ flex: 1, fontFamily: MONO, fontSize: 21, color: 'rgba(244,248,252,0.85)', filter: 'blur(3.5px)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{FAKE_CA}</div>
          <div style={{ width: 128, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 18, letterSpacing: '0.06em', color: copied ? '#06101F' : C.ink, background: copied ? '#4ADE80' : 'transparent', border: copied ? 'none' : '1.5px solid rgba(255,255,255,0.35)', transform: `scale(${f >= click && f < click + 4 ? 0.92 : 1})` }}>{copied ? 'COPIED ✓' : 'COPY'}</div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: 'rgba(244,248,252,0.6)' }}>pump.fun</div>
        </div>
        {/* The page under it: the aircraft, flying. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 134, bottom: 0, overflow: 'hidden', background: 'linear-gradient(180deg, #3f86c4 0%, #8cc4f0 100%)' }}>
          <div style={{ position: 'absolute', left: 230 + Math.sin(f * 0.04) * 20, top: 150, transform: 'rotate(-6deg)' }}><PlaneTop size={200} trailLength={600} /></div>
          <div style={{ position: 'absolute', left: 40, bottom: 36, fontFamily: SANS, fontWeight: 900, fontSize: 46, color: '#fff', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>HOLD MORE.<br />FLY HIGHER.</div>
        </div>
        <div style={{ position: 'absolute', right: 30, top: 160, fontFamily: MONO, fontSize: 19, color: C.ink, background: 'rgba(6,11,22,0.8)', padding: '8px 14px', borderRadius: 8, opacity: k(f, 22, 30) * (1 - k(f, click, click + 6)) }}>↑ the very top of the page</div>
        {/* The toast. */}
        <div style={{
          position: 'absolute', left: 380, top: 560, width: 400, height: 58, borderRadius: 14, background: '#0B1324', border: '1.5px solid rgba(74,222,128,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: SANS, fontWeight: 700, fontSize: 21, color: C.ink,
          opacity: k(f, cue(ch, 'toast'), cue(ch, 'toast') + 8), transform: `translateY(${(1 - k(f, cue(ch, 'toast'), cue(ch, 'toast') + 10)) * 30}px)`,
        }}><span style={{ color: '#4ADE80' }}>✓</span> Contract address copied</div>
        <Cursor f={f} path={[[cue(ch, 'cursor'), 640, 560], [click - 6, 610, 103]]} clicks={[click]} />
      </Card>
    </>
  );
};

/* ── 02 Check in ───────────────────────────────────────────────────── */

const WALLETS = [['Phantom', '#AB9FF2'], ['Solflare', '#FC9A4B'], ['Backpack', '#E33E3F'], ['Nightly', '#6067F9']] as const;

export const CheckIn: React.FC<ChapterProps> = ({ f, ch }) => {
  const connect = cue(ch, 'connect'), list = cue(ch, 'list'), pick = cue(ch, 'pick'), pass = cue(ch, 'pass');
  const flip = k(f, pass, pass + 16, eio);
  return (
    <>
      <StepText f={f} num="02" kicker="CHECK IN" title="Connect a wallet." body="Phantom, Solflare, Backpack or Nightly. Connecting shares your public address, and nothing else." />
      <Card>
        <div style={{ position: 'absolute', inset: 0, transform: `perspective(1600px) rotateY(${flip * 180}deg)`, transformStyle: 'preserve-3d' }}>
          {/* Front: the check-in panel. */}
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', padding: 56 }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 22, letterSpacing: '0.28em', color: C.cyan }}>CHECK IN</div>
            <div style={{ marginTop: 14, fontFamily: SANS, fontWeight: 800, fontSize: 40, color: C.ink }}>Take your seat</div>
            <Button label="Connect wallet" x={56} y={170} w={698} primary pressed={f >= connect && f < connect + 4} style={{ opacity: 1 - k(f, list, list + 8) }} />
            {WALLETS.map(([name, color], i) => {
              const a = k(f, list + i * 4, list + i * 4 + 10);
              const chosen = i === 0 && f >= pick;
              return (
                <div key={name} style={{
                  position: 'absolute', left: 56, top: 170 + i * 98, width: 698, height: 80, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 22, padding: '0 24px',
                  background: chosen ? 'rgba(0,201,241,0.16)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${chosen ? C.cyan : 'rgba(255,255,255,0.12)'}`,
                  opacity: a, transform: `translateY(${(1 - a) * 20}px) scale(${chosen && f < pick + 4 ? 0.97 : 1})`,
                }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 24, color: '#fff' }}>{name[0]}</div>
                  <div style={{ flex: 1, fontFamily: SANS, fontWeight: 700, fontSize: 30, color: C.ink }}>{name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.14em', color: 'rgba(244,248,252,0.5)' }}>{chosen ? 'CONNECTING…' : 'DETECTED'}</div>
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: 56, bottom: 44, fontFamily: MONO, fontSize: 18, letterSpacing: '0.1em', color: 'rgba(244,248,252,0.55)' }}>SHARES YOUR PUBLIC ADDRESS ONLY</div>
          </div>
          {/* Back: the boarding pass. */}
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'linear-gradient(160deg, #F4F8FC, #DCE8F5)', color: '#0B1324' }}>
            <div style={{ height: 120, background: 'linear-gradient(90deg, #123A8F, #0087EA)', display: 'flex', alignItems: 'center', gap: 22, padding: '0 40px' }}>
              <Img src={staticFile('brand/seat-airlines-badge.png')} style={{ width: 84, height: 84 }} />
              <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 36, color: '#fff', letterSpacing: '0.06em' }}>BOARDING PASS</div>
              <div style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 600, fontSize: 28, color: '#fff' }}>SA350</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '34px 20px', padding: '44px 40px' }}>
              {[['PASSENGER', 'YOU'], ['SEAT', '12A'], ['CLASS', 'ECONOMY'], ['GROUP', '4'], ['GATE', '178'], ['DESTINATION', 'MARS']].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.18em', color: '#58607A' }}>{l}</div>
                  <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: l === 'SEAT' ? 64 : 38, color: l === 'SEAT' ? '#0087EA' : '#0B1324', lineHeight: 1.1 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', left: 40, right: 40, bottom: 40, height: 70, background: 'repeating-linear-gradient(90deg, #0B1324 0 3px, transparent 3px 6px, #0B1324 6px 10px, transparent 10px 13px, #0B1324 13px 14px, transparent 14px 19px)' }} />
          </div>
        </div>
        <Cursor f={f} path={[[connect - 22, 650, 560], [connect - 2, 420, 200], [pick - 14, 420, 200], [pick - 2, 330, 210]]} clicks={[connect, pick]} />
      </Card>
    </>
  );
};

/* ── 03 Take your seat ─────────────────────────────────────────────── */

const RANK = new Map(SEAT_ORDER.map((s, i) => [s.id, i]));
const MY_SEAT = '12A';

const MiniCabin: React.FC<{ f: number; fillFrom: number; perRank: number; you?: number }> = ({ f, fillFrom, perRank, you }) => {
  const s = 0.44, ox = -60, oy = -60;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920 * s, height: 1080 * s }}>
      <svg width={1920 * s} height={1080 * s} viewBox={`${-ox / s} ${-oy / s} 1920 1080`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={FUSELAGE} fill="rgba(160,215,255,0.06)" stroke="rgba(120,220,255,0.6)" strokeWidth={3} transform="translate(0,0)" />
      </svg>
      {SEAT_LAYOUT.map((seat) => {
        const on = f >= fillFrom + seat.rank * perRank;
        const mine = seat.id === MY_SEAT && you !== undefined && f >= you;
        return (
          <div key={seat.id} style={{
            position: 'absolute', left: (seat.x - seat.s / 2) * s + ox, top: (seat.y - seat.s / 2) * s + oy, width: seat.s * s, height: seat.s * s, borderRadius: 3,
            background: mine ? '#fff' : on ? ZONE_COLOR[seat.zone] : 'rgba(255,255,255,0.08)', opacity: mine || you === undefined || f < you ? 1 : 0.55,
            boxShadow: mine ? '0 0 16px 4px rgba(255,255,255,0.9)' : 'none',
          }} />
        );
      })}
    </div>
  );
};

export const Seat: React.FC<ChapterProps> = ({ f, ch }) => {
  const you = cue(ch, 'you'), hold = cue(ch, 'hold');
  const me = SEAT_LAYOUT.find((s) => s.id === MY_SEAT)!;
  const s = 0.44, mx = me.x * s - 60 + 30, my = me.y * s - 60 + 70;
  const drop = k(f, you, you + 10, Easing.out(Easing.back(2)));
  return (
    <>
      <StepText f={f} num="03" kicker="TAKE YOUR SEAT" title="Your bag picks your seat." body="The 178 biggest holders sit in rank order, flight deck first. Everyone else rides in the cargo hold." />
      <Card>
        <div style={{ position: 'absolute', left: 30, top: 70 }}><MiniCabin f={f} fillFrom={cue(ch, 'fill')} perRank={0.4} you={you} /></div>
        <div style={{ position: 'absolute', left: 40, top: 30, fontFamily: MONO, fontSize: 19, letterSpacing: '0.2em', color: 'rgba(244,248,252,0.6)' }}>SEAT MAP · 178 SEATS · BY RANK</div>
        {/* You. */}
        <div style={{ position: 'absolute', left: mx, top: my - 90 * (1 - drop) - 66, opacity: k(f, you, you + 4), transform: 'translateX(-50%)' }}>
          <div style={{ background: '#fff', color: '#0B1324', fontFamily: SANS, fontWeight: 900, fontSize: 22, padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            YOU · {MY_SEAT} · RANK {(RANK.get(MY_SEAT) ?? 0) + 1}
          </div>
          <div style={{ width: 0, height: 0, margin: '0 auto', borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '12px solid #fff' }} />
        </div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 430, display: 'flex', gap: 14, flexWrap: 'wrap', opacity: k(f, 50, 62) }}>
          {[['FLIGHT DECK', 'TOP 2', C.gold], ['FIRST', 'ROWS 1–2', C.cerise], ['BUSINESS', 'ROWS 3–7', C.violet], ['EXIT ROW', '16–17', '#5EF0FF'], ['ECONOMY', '126 SEATS', C.cyan]].map(([n, d, c]) => (
            <div key={n} style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.1em', color: 'rgba(244,248,252,0.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: c }} />{n} <span style={{ opacity: 0.55 }}>{d}</span>
            </div>
          ))}
        </div>
        <div style={{
          position: 'absolute', left: 40, right: 40, top: 520, height: 86, borderRadius: 16, border: '2px dashed rgba(255,200,69,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px',
          opacity: k(f, hold, hold + 10), transform: `translateY(${(1 - k(f, hold, hold + 12)) * 20}px)`,
        }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 30, color: C.gold }}>CARGO HOLD</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: 'rgba(244,248,252,0.75)', letterSpacing: '0.1em' }}>RANK 179 AND BELOW</div>
        </div>
      </Card>
    </>
  );
};

/* ── 04 Move up ────────────────────────────────────────────────────── */

const AHEAD = SEAT_ORDER[(RANK.get(MY_SEAT) ?? 1) - 1].id;

export const MoveUp: React.FC<ChapterProps> = ({ f, ch }) => {
  const grow = cue(ch, 'grow'), pass = cue(ch, 'pass'), card = cue(ch, 'card');
  const mine = 41.0 + 11.6 * k(f, grow, pass + 6, eio);
  const swap = k(f, pass, pass + 14, Easing.inOut(Easing.back(1.4)));
  const theirs = 48.2;
  const row = (y: number, seat: string, who: string, bal: number, me: boolean) => (
    <div style={{
      position: 'absolute', left: 40, top: y, width: 730, height: 118, borderRadius: 18, padding: '18px 26px', boxSizing: 'border-box',
      background: me ? 'rgba(0,201,241,0.12)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${me ? C.cyan : 'rgba(255,255,255,0.14)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 40, color: me ? C.cyan : C.ink }}>{seat}</span>
        <span style={{ fontFamily: MONO, fontSize: 24, color: 'rgba(244,248,252,0.8)' }}>{who}</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 600, fontSize: 26, color: C.ink }}>{bal.toFixed(1)}K</span>
      </div>
      <div style={{ marginTop: 14, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${(bal / 60) * 100}%`, height: '100%', borderRadius: 6, background: me ? 'linear-gradient(90deg, #0087EA, #2FDBFF)' : 'rgba(244,248,252,0.45)' }} />
      </div>
    </div>
  );
  const ahead = f >= pass + 7;
  return (
    <>
      <StepText f={f} num="04" kicker="MOVE UP" title="Out-hold the seat ahead." body="Pass the holder in front of you and their seat is yours, and the PA tells the whole cabin." />
      <Card>
        <div style={{ position: 'absolute', left: 40, top: 34, fontFamily: MONO, fontSize: 19, letterSpacing: '0.2em', color: 'rgba(244,248,252,0.6)' }}>BOARDING LADDER · NEXT UP</div>
        {row(96 + swap * 140, ahead ? MY_SEAT : AHEAD, '7xK2…9fQ', theirs, false)}
        {row(236 - swap * 140, ahead ? AHEAD : MY_SEAT, 'YOU', mine, true)}
        <div style={{
          position: 'absolute', left: 40, top: 410, width: 730, borderRadius: 20, padding: '24px 28px', boxSizing: 'border-box', background: '#F4F8FC', color: '#0B1324',
          transform: `scale(${pop(f, card)})`, transformOrigin: '50% 0%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontWeight: 600, fontSize: 20, letterSpacing: '0.24em', color: '#0087EA' }}>
            <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 18, color: '#fff', background: '#0087EA', borderRadius: 6, padding: '2px 8px', letterSpacing: '0.08em' }}>PA</span> UPGRADE
          </div>
          <div style={{ marginTop: 10, fontFamily: SANS, fontWeight: 900, fontSize: 36 }}>{MY_SEAT} → {AHEAD}</div>
          <div style={{ marginTop: 6, fontFamily: SANS, fontWeight: 600, fontSize: 24, color: '#3B4458' }}>You passed 7xK2…9fQ. Welcome to {AHEAD}.</div>
        </div>
      </Card>
    </>
  );
};

/* ── 05 Altitude ───────────────────────────────────────────────────── */

const BANDS = [
  { name: 'WEATHER', cap: 'UNDER $1M', color: '#7EC8E3', bg: 'linear-gradient(180deg, #78b4e6, #b9dcf7)' },
  { name: 'CLOUDS', cap: '$1M', color: '#E0ECF8', bg: 'linear-gradient(180deg, #3f7fd0, #e8f3ff)' },
  { name: 'SPACE', cap: '$10M', color: '#8EA9FF', bg: 'linear-gradient(180deg, #050b20, #1b3a7a)' },
  { name: 'MOON', cap: '$50M', color: '#D8D8D8', bg: 'linear-gradient(180deg, #05070f, #44464d)' },
  { name: 'MARS', cap: '$100M', color: '#FF7A45', bg: 'linear-gradient(180deg, #2a0d08, #b8502a)' },
];

export const Altitude: React.FC<ChapterProps> = ({ f, ch }) => {
  const at = cues(ch, 'bands');
  const up = cue(ch, 'pitchUp'), down = cue(ch, 'pitchDown');
  let level = 0;
  at.forEach((a, i) => { if (f >= a) level = i; });
  const seg = 108;
  const prog = at.reduce((p, a, i) => p + k(f, a - 18, a, eio) * (i === 0 ? 0 : 1), 0);
  const pitch = 12 * k(f, up, up + 12, eio) - 24 * k(f, down, down + 12, eio);
  const caps = ['$163K', '$1.0M', '$10M', '$50M', '$100M'];
  return (
    <>
      <StepText f={f} num="05" kicker="ALTITUDE" title="Market cap is altitude." body="$1M clears the clouds. $10M is space, $50M the Moon, $100M Mars. The five-minute move tips the nose." />
      <Card>
        {/* The ladder of levels. */}
        <div style={{ position: 'absolute', left: 40, top: 40, width: 330, height: seg * 5 + 4 * 8 }}>
          {BANDS.map((b, i) => (
            <div key={b.name} style={{
              position: 'absolute', left: 0, top: (4 - i) * (seg + 8), width: 330, height: seg, borderRadius: 14, background: b.bg, overflow: 'hidden',
              outline: level === i && f >= at[0] ? `3px solid ${b.color}` : 'none', opacity: f >= at[i] - 4 ? 1 : 0.35,
            }}>
              <div style={{ position: 'absolute', left: 18, top: 16, fontFamily: SANS, fontWeight: 900, fontSize: 26, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{b.name}</div>
              <div style={{ position: 'absolute', left: 18, bottom: 14, fontFamily: MONO, fontWeight: 600, fontSize: 20, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>{b.cap}</div>
            </div>
          ))}
          <div style={{ position: 'absolute', left: 230, top: 4 * (seg + 8) + seg / 2 - prog * (seg + 8) - 40, transform: 'rotate(-90deg)', width: 80, height: 80 }}>
            <PlaneTop size={72} trails={0} shadow={0.4} />
          </div>
        </div>
        {/* The readout. */}
        <div style={{ position: 'absolute', left: 410, top: 40, width: 360 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.22em', color: 'rgba(244,248,252,0.6)' }}>MARKET CAP</div>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 60, color: C.ink }}>{caps[level]}</div>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.22em', color: 'rgba(244,248,252,0.6)', marginTop: 8 }}>LEVEL</div>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 44, color: BANDS[level].color }}>{BANDS[level].name}</div>
        </div>
        {/* The attitude indicator: a rising market lifts the nose. */}
        <div style={{ position: 'absolute', left: 430, top: 330, width: 260, height: 260, borderRadius: '50%', overflow: 'hidden', border: '6px solid #1B2638', boxShadow: '0 0 0 2px rgba(160,215,255,0.3)', opacity: k(f, up - 24, up - 12) }}>
          <div style={{ position: 'absolute', left: -130, top: -130 + pitch * 4, width: 520, height: 520 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 520, height: 260, background: 'linear-gradient(180deg, #1f6fd1, #5aa8f0)' }} />
            <div style={{ position: 'absolute', left: 0, top: 260, width: 520, height: 260, background: 'linear-gradient(180deg, #a5642c, #6b3b17)' }} />
            <div style={{ position: 'absolute', left: 0, top: 258, width: 520, height: 4, background: '#fff' }} />
          </div>
          <div style={{ position: 'absolute', left: 60, top: 124, width: 140, height: 8, borderRadius: 4, background: C.gold, boxShadow: '0 0 0 2px #0B1324' }} />
          <div style={{ position: 'absolute', left: 122, top: 120, width: 16, height: 16, borderRadius: 8, background: C.gold, boxShadow: '0 0 0 2px #0B1324' }} />
        </div>
        <div style={{ position: 'absolute', left: 430, top: 600, width: 300, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 20, letterSpacing: '0.12em', color: pitch > 1 ? '#4ADE80' : pitch < -1 ? '#FF6B6B' : 'rgba(244,248,252,0.7)', opacity: k(f, up - 24, up - 12) }}>
          5-MIN {pitch > 1 ? '▲ NOSE UP' : pitch < -1 ? '▼ NOSE DOWN' : 'MOVE = PITCH'}
        </div>
      </Card>
    </>
  );
};

/* ── 06 Billboard ──────────────────────────────────────────────────── */

const TILE_IDS = ['3A', '3F', '4A', '4F', '5A', '5F', '6A', '6F', '7A', '7F', '8A', '8F', '9A', '9F', '10A', '10F', '11A', '11F'];
const HOUSE = ['#123A8F', '#5B2A86', '#0F5E6B', '#7A2E4C', '#2C4A7A', '#3D3F8F'];

export const Billboard: React.FC<ChapterProps> = ({ f, ch }) => {
  const upload = cue(ch, 'upload'), drop = cue(ch, 'drop'), move = cue(ch, 'move'), land = cue(ch, 'land');
  const cols = 6, size = 112, gap = 12, gx = 40, gy = 92;
  const from = 15, to = 4; // the advert's tile, before and after its holder moves up
  const pos = (i: number) => ({ x: gx + (i % cols) * (size + gap), y: gy + Math.floor(i / cols) * (size + gap) });
  const m = k(f, move, land, eio);
  const a = pos(from), b = pos(to);
  const ad = { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m - Math.sin(m * Math.PI) * 60 };
  const fly = k(f, drop - 10, drop, eio);
  const up = k(f, upload, drop - 12, Easing.linear);
  return (
    <>
      <StepText f={f} num="06" kicker="THE WALL" title="Every seat is a billboard." body="Put a square image on your seat. It belongs to your wallet, so it moves with you." />
      <Card>
        <div style={{ position: 'absolute', left: 40, top: 34, fontFamily: MONO, fontSize: 19, letterSpacing: '0.2em', color: 'rgba(244,248,252,0.6)' }}>THE WALL · ONE SQUARE PER SEAT</div>
        {TILE_IDS.map((id, i) => {
          const p = pos(i);
          const shift = i >= to && i < from ? k(f, move + 4, land + 4, eio) : 0;
          const q = i >= to && i < from ? pos(i + 1) : p;
          return (
            <div key={id} style={{
              position: 'absolute', left: p.x + (q.x - p.x) * shift, top: p.y + (q.y - p.y) * shift, width: size, height: size, borderRadius: 12, opacity: k(f, cue(ch, 'grid') + i, cue(ch, 'grid') + i + 8),
              ...(i === from ? { opacity: k(f, cue(ch, 'grid') + i, cue(ch, 'grid') + i + 8) * (1 - m) } : {}),
              background: i === from ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg, ${HOUSE[i % HOUSE.length]}, #0B1324)`, border: i === from ? '2px dashed rgba(0,201,241,0.7)' : '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ position: 'absolute', left: 8, top: 6, fontFamily: MONO, fontSize: 15, color: 'rgba(244,248,252,0.7)' }}>{i === from ? 'YOU' : id}</div>
            </div>
          );
        })}
        {/* The upload, then the advert on the seat, then the seat moving up with it. */}
        <div style={{ position: 'absolute', left: 40, top: 480, width: 730, height: 120, borderRadius: 18, background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', gap: 22, padding: '0 22px', boxSizing: 'border-box', opacity: k(f, upload - 8, upload) }}>
          <Img src={staticFile('brand/advert-nimbus.png')} style={{ width: 84, height: 84, borderRadius: 10, opacity: 1 - fly }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 21, color: C.ink }}>nimbus-cold-brew.png · 1:1</div>
            <div style={{ marginTop: 12, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.1)' }}>
              <div style={{ width: `${up * 100}%`, height: '100%', borderRadius: 5, background: f >= drop ? '#4ADE80' : 'linear-gradient(90deg, #0087EA, #2FDBFF)' }} />
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 20, color: f >= drop ? '#4ADE80' : 'rgba(244,248,252,0.6)', width: 120, textAlign: 'right' }}>{f >= drop ? 'ON SEAT ✓' : `${Math.round(up * 100)}%`}</div>
        </div>
        {f >= drop - 10 && (
          <div style={{
            position: 'absolute', left: f < drop ? 62 + (a.x - 62) * fly : ad.x, top: f < drop ? 498 + (a.y - 498) * fly : ad.y, width: f < drop ? 84 + (size - 84) * fly : size, height: f < drop ? 84 + (size - 84) * fly : size,
            borderRadius: 12, overflow: 'hidden', boxShadow: `0 0 0 3px ${C.cyan}, 0 12px 30px rgba(0,0,0,0.5)`, transform: `scale(${f >= drop ? Math.max(1, pop(f, drop)) : 1})`,
          }}>
            <Img src={staticFile('brand/advert-nimbus.png')} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
        <div style={{ position: 'absolute', right: 40, top: 30, fontFamily: MONO, fontWeight: 600, fontSize: 19, color: C.cyan, opacity: k(f, move, move + 8) }}>MOVED UP: {TILE_IDS[from]} → {TILE_IDS[to]}</div>
      </Card>
    </>
  );
};

/* ── 07 Fly ────────────────────────────────────────────────────────── */

const KEYS = ['↑', '←', '→', '↑'];

export const Fly: React.FC<ChapterProps> = ({ f, ch }) => {
  const keys = cues(ch, 'keys'), tenK = cue(ch, 'tenK'), fire = cue(ch, 'fire'), score = cue(ch, 'score');
  const pressed = (i: number) => f >= keys[i] && f < keys[i] + 14;
  const bank = (pressed(1) ? -18 : 0) + (pressed(2) ? 18 : 0);
  const alt = Math.min(10000, Math.round(10000 * k(f, keys[0], tenK, Easing.inOut(Easing.quad)) / 10) * 10);
  const burning = f >= fire;
  const shake = burning ? (random(`fs${f}`) - 0.5) * 6 : 0;
  return (
    <>
      <StepText f={f} num="07" kicker="FLY" title="Take the controls." body="Arrow keys or drag. Climb to 10,000 ft, then survive whatever happens next." />
      <Card style={{ background: 'linear-gradient(180deg, #3d7c4a, #2f6340)' }}>
        {/* Ground rushing under the aircraft. */}
        {Array.from({ length: 16 }, (_, i) => {
          const x = random(`gx${i}`) * 900 - 60, y = ((random(`gy${i}`) * 900 + f * 7) % 900) - 160, r = 60 + random(`gr${i}`) * 120;
          return <div key={i} style={{ position: 'absolute', left: x, top: y, width: r * 2, height: r * 1.3, borderRadius: '50%', background: random(`gc${i}`) > 0.5 ? 'rgba(120,170,90,0.6)' : 'rgba(40,90,50,0.55)' }} />;
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const y = ((random(`cy${i}`) * 1000 + f * 12) % 1000) - 240;
          return <div key={`c${i}`} style={{ position: 'absolute', left: random(`cx${i}`) * 700 - 100, top: y, width: 300, height: 170, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.85), rgba(255,255,255,0) 70%)', opacity: k(f, keys[0], tenK) }} />;
        })}
        <div style={{ position: 'absolute', left: 405 + bank * 2 + shake, top: 300 + shake, transform: `rotate(${-90 + bank * 0.6}deg) scale(${1 - 0.25 * k(f, keys[0], tenK)})` }}>
          {burning && [0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ position: 'absolute', left: -100 - i * 34 - (f % 6) * 5, top: -66 + (random(`sm${i}`) - 0.5) * 16, width: 40 + i * 10, height: 40 + i * 10, borderRadius: '50%', background: i < 1 ? 'radial-gradient(circle, #FFD166, #FF6B35 60%, rgba(255,107,53,0) 72%)' : `rgba(70,70,70,${0.55 - i * 0.07})` }} />
          ))}
          <PlaneTop size={170} trails={0} shadow={0.45} style={{ left: -94, top: -85 }} />
        </div>
        {/* Instruments. */}
        <div style={{ position: 'absolute', right: 30, top: 30, background: 'rgba(5,9,20,0.75)', borderRadius: 14, padding: '14px 20px', fontFamily: MONO, color: C.ink, textAlign: 'right' }}>
          <div style={{ fontSize: 16, letterSpacing: '0.2em', color: 'rgba(244,248,252,0.6)' }}>ALTITUDE</div>
          <div style={{ fontSize: 46, fontWeight: 600, color: alt >= 10000 ? '#4ADE80' : C.ink }}>{alt.toLocaleString('en-US')} FT</div>
        </div>
        <div style={{
          position: 'absolute', left: 30, top: 30, padding: '12px 18px', borderRadius: 10, fontFamily: MONO, fontWeight: 600, fontSize: 24, letterSpacing: '0.14em',
          background: '#B3261E', color: '#fff', opacity: burning ? (Math.floor((f - fire) / 6) % 2 ? 0.45 : 1) : 0, boxShadow: '0 0 30px rgba(255,60,40,0.6)',
        }}>ENGINE FIRE · L</div>
        {/* The keys. */}
        <div style={{ position: 'absolute', left: 30, bottom: 30, display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gridTemplateRows: 'repeat(2, 64px)', gap: 8 }}>
          {[['', ''], ['↑', 0], ['', ''], ['←', 1], ['↓', -1], ['→', 2]].map(([g, idx], i) => (
            <div key={i} style={{
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 30,
              visibility: g ? 'visible' : 'hidden', color: '#0B1324',
              background: (idx === 0 && (pressed(0) || pressed(3))) || (typeof idx === 'number' && idx > 0 && pressed(idx)) ? C.cyan : 'rgba(244,248,252,0.85)',
              boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
            }}>{g}</div>
          ))}
        </div>
        <div style={{
          position: 'absolute', right: 30, bottom: 30, background: '#F4F8FC', color: '#0B1324', borderRadius: 16, padding: '16px 24px', textAlign: 'right',
          transform: `scale(${pop(f, score)})`, transformOrigin: '100% 100%',
        }}>
          <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.2em', color: '#58607A' }}>SCORE</div>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 48 }}>12,480</div>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 18, color: '#0087EA', letterSpacing: '0.14em' }}>NEW BEST</div>
        </div>
      </Card>
    </>
  );
};

/* ── 08 Safety ─────────────────────────────────────────────────────── */

export const Safety: React.FC<ChapterProps> = ({ f, ch }) => {
  const cross = cue(ch, 'cross'), check = cue(ch, 'check');
  const rows: [string, boolean, number][] = [['Approve a transaction', false, cross], ['Spend or move your tokens', false, cross + 8], ['Sign a plain-text message', true, check]];
  return (
    <>
      <StepText f={f} num="08" kicker="SAFETY" title="Plain-text signatures only." body="Seat Airlines never asks your wallet to approve a transaction. Checking in, adverts and networking cost nothing." />
      <Card>
        <div style={{ position: 'absolute', left: 40, top: 40, width: 730, borderRadius: 20, background: '#121A2B', border: '1.5px solid rgba(255,255,255,0.14)', padding: 28, boxSizing: 'border-box', opacity: k(f, cue(ch, 'card'), cue(ch, 'card') + 10) }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.ink }}>Signature request</div>
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 19, color: 'rgba(244,248,252,0.6)' }}>seat-airlines.space</div>
          <div style={{ marginTop: 18, borderRadius: 12, background: '#0A101C', padding: '16px 20px', fontFamily: MONO, fontSize: 20, lineHeight: 1.5, color: 'rgba(244,248,252,0.85)' }}>
            MESSAGE (PLAIN TEXT)<br /><span style={{ color: 'rgba(244,248,252,0.55)' }}>Readable words you can check, word for word. No transaction, no approval.</span>
          </div>
        </div>
        {rows.map(([label, ok, at], i) => (
          <div key={label} style={{
            position: 'absolute', left: 40, top: 340 + i * 92, width: 730, height: 76, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', boxSizing: 'border-box',
            background: f >= at ? (ok ? 'rgba(74,222,128,0.12)' : 'rgba(255,107,107,0.1)') : 'rgba(255,255,255,0.05)', border: `1.5px solid ${f >= at ? (ok ? '#4ADE80' : '#FF6B6B') : 'rgba(255,255,255,0.12)'}`,
            opacity: k(f, 20 + i * 6, 30 + i * 6),
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 24, color: '#0B1324', background: f >= at ? (ok ? '#4ADE80' : '#FF6B6B') : 'rgba(255,255,255,0.2)', transform: `scale(${f >= at ? pop(f, at) : 1})` }}>{f >= at ? (ok ? '✓' : '✕') : ''}</div>
            <div style={{ position: 'relative', fontFamily: SANS, fontWeight: 700, fontSize: 28, color: f >= at && !ok ? 'rgba(244,248,252,0.5)' : C.ink }}>
              {label}
              {!ok && <div style={{ position: 'absolute', left: 0, top: '52%', height: 3, width: `${k(f, at, at + 8) * 100}%`, background: '#FF6B6B' }} />}
            </div>
            <div style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 600, fontSize: 18, letterSpacing: '0.16em', color: ok ? '#4ADE80' : '#FF6B6B', opacity: f >= at ? 1 : 0 }}>{ok ? 'ONLY THIS' : 'NEVER'}</div>
          </div>
        ))}
      </Card>
    </>
  );
};

/* ── Outro ─────────────────────────────────────────────────────────── */

export const Outro: React.FC<ChapterProps> = ({ f, ch }) => {
  const b = k(f, cue(ch, 'badge'), cue(ch, 'badge') + 16, Easing.out(Easing.back(1.6)));
  return (
    <Layer>
      <div style={{ position: 'absolute', left: 960 - 160, top: 130, width: 320, height: 320, transform: `scale(${0.6 + 0.4 * b})`, opacity: Math.min(1, b * 1.4) }}>
        <Badge size={320} shine={(f - 14) / 26} glow={0.8} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 500, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 104, color: C.ink, opacity: k(f, 10, 22), transform: `translateY(${(1 - k(f, 10, 24)) * 20}px)` }}>Hold more. Fly higher.</div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 680, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {'SEAT-AIRLINES.SPACE'.split('').map((c, i) => <FlapTile key={i} ch={c} land={cue(ch, 'url') + i * 0.8} size={50} seed={`xo${i}`} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 810, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 28, letterSpacing: '0.28em', color: C.cyan, opacity: k(f, 46, 56) }}>NOW BOARDING</div>
    </Layer>
  );
};

export const CHAPTER_VIEWS = { token: Token, checkin: CheckIn, seat: Seat, moveup: MoveUp, altitude: Altitude, billboard: Billboard, fly: Fly, safety: Safety, outro: Outro } as const;
export { H };
