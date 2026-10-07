import assert from 'node:assert/strict';
import { SpriteClip } from '../dist-test/audioSprite.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const buffer = {};
function context() {
  const sources = [];
  const node = () => ({ connect() {}, disconnect() {} });
  return {
    currentTime: 0, sources,
    resume: async () => {},
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createBufferSource() {
      const source = {
        ...node(), playbackRate: { value: 1 },
        start(...args) { this.started = args; },
        stop() { this.stopped = true; },
      };
      sources.push(source);
      return source;
    },
  };
}
const make = (ctx, load = async () => buffer, enabled = () => true) =>
  new SpriteClip(ctx, {}, load, { offset: 10, duration: 5 }, enabled);

const ctx = context();
const clip = make(ctx);
assert.equal(clip.paused, true);
await clip.play();
assert.deepEqual(ctx.sources[0].started, [0, 10, 5]);
ctx.currentTime = 2;
assert.equal(clip.currentTime, 2, 'Game time is relative to this clip, not the sprite');
clip.currentTime = 3;
await tick();
assert.ok(ctx.sources[0].stopped, 'Seeking stops the previous source');
assert.deepEqual(ctx.sources[1].started, [0, 13, 2], 'Seeking still ends at the clip boundary');
clip.playbackRate = 2;
ctx.currentTime += 0.5;
assert.equal(clip.currentTime, 4, 'Rate changes preserve the playback clock');
clip.pause();
assert.equal(clip.currentTime, 4);
ctx.currentTime += 10;
assert.equal(clip.currentTime, 4, 'Paused time does not advance');
await clip.play();
assert.deepEqual(ctx.sources[2].started, [0, 14, 1]);
ctx.sources[2].onended();
assert.ok(clip.ended);
assert.ok(clip.paused);
await clip.play();
assert.deepEqual(ctx.sources[3].started, [0, 10, 5], 'An ended effect can be replayed');
clip.dispose();
await clip.play();
assert.equal(ctx.sources.length, 4, 'Disposed audio cannot restart after leaving the game');

const loopCtx = context();
const wind = make(loopCtx);
wind.loop = true;
await wind.play();
assert.equal(loopCtx.sources[0].loopStart, 10);
assert.equal(loopCtx.sources[0].loopEnd, 15);
assert.deepEqual(loopCtx.sources[0].started, [0, 10]);
loopCtx.currentTime = 12;
assert.equal(wind.currentTime, 2, 'Loop clock wraps within the wind, never into the next effect');
wind.pause();

for (const cancel of ['pause', 'dispose']) {
  const slowCtx = context();
  let resolve;
  const slow = make(slowCtx, () => new Promise(done => { resolve = done; }));
  const playing = slow.play();
  assert.equal(slow.play(), playing, 'Repeated frames share the pending play request');
  slow[cancel]();
  resolve(buffer);
  await playing;
  assert.equal(slowCtx.sources.length, 0, `${cancel} prevents a late download from playing`);
}

const failedCtx = context();
let attempts = 0;
const retry = make(failedCtx, async () => {
  if (++attempts === 1) throw new Error('offline');
  return buffer;
});
await assert.rejects(retry.play(), /offline/);
assert.ok(retry.paused);
await retry.play();
assert.equal(failedCtx.sources.length, 1, 'A network error does not permanently disable an effect');
retry.dispose();

const mutedCtx = context();
const muted = make(mutedCtx, () => { throw new Error('Must not download while muted'); }, () => false);
await muted.play();
assert.equal(mutedCtx.sources.length, 0);
assert.ok(muted.paused);
muted.dispose();
console.log('Audio sprite: bounded playback, seeking, rate changes, looping, cancellation, replay, mute, disposal and retry passed.');
