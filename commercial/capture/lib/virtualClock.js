/*
 * A virtual clock, installed before any page script runs.
 *
 * This container has no GPU: WebGL runs on SwiftShader at well under one
 * frame a second at 1080p, so real-time recording would be a slideshow.
 * Instead time is frozen and advanced one film frame (1/30 s) at a time:
 * performance.now, Date, timers, requestAnimationFrame and every CSS/Web
 * animation all read this clock, so the page renders exactly what it would
 * at 30 fps on fast hardware — then that frame is screenshotted.
 */
(() => {
  const START_EPOCH = Number(window.__VCLOCK_EPOCH__ || Date.UTC(2026, 5, 21, 20, 0, 0));
  const realPerfNow = performance.now.bind(performance);
  const RealDate = Date;
  const base = realPerfNow();
  let now = 0; // virtual ms since install
  let seq = 0;
  const timers = new Map(); // id -> {at, fn, args, interval}
  let rafs = new Map();
  let rafSeq = 0;

  performance.now = () => base + now;
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(START_EPOCH + now); else super(...a); }
    static now() { return START_EPOCH + now; }
  }
  window.Date = VDate;

  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args, interval: null }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const id = ++seq; const iv = Math.max(1, +ms || 0); timers.set(id, { at: now + iv, fn, args, interval: iv }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = ++rafSeq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  // Idle callbacks just become timers.
  window.requestIdleCallback = (fn) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 10 }), 1);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);

  const anims = new WeakMap();
  const syncAnimations = () => {
    let list = [];
    try { list = document.getAnimations(); } catch { return; }
    for (const a of list) {
      let rec = anims.get(a);
      if (!rec) {
        const ct = typeof a.currentTime === 'number' ? a.currentTime : 0;
        rec = { start: now - ct };
        anims.set(a, rec);
        try { a.pause(); } catch {}
      }
      try { a.currentTime = (now - rec.start) * (a.playbackRate || 1); } catch {}
    }
  };

  const yieldReal = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

  async function runTimersUntil(target) {
    for (let guard = 0; guard < 10000; guard++) {
      let nextId = null, next = null;
      for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && id < nextId))) { next = t; nextId = id; }
      if (!next) break;
      if (next.at > now) now = next.at;
      if (next.interval) next.at += next.interval; else timers.delete(nextId);
      try { typeof next.fn === 'function' ? next.fn(...next.args) : eval(next.fn); } catch (e) { console.error(e); }
      await yieldReal();
    }
    now = target;
  }

  window.__vclock = {
    get now() { return now; },
    /* Advance by ms: timers fire in order, then one animation frame runs,
       and every CSS/Web animation is set to the new time. */
    async step(ms) {
      await runTimersUntil(now + ms);
      const cbs = rafs; rafs = new Map();
      const t = performance.now();
      for (const fn of cbs.values()) { try { fn(t); } catch (e) { console.error(e); } }
      syncAnimations();
      // Let React, promises and message ports settle in real time.
      for (let i = 0; i < 4; i++) await yieldReal();
      syncAnimations();
    },
  };
})();
