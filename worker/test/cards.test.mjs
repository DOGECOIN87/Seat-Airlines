/**
 * The cards flights are shared on: what the Worker will keep, and the page
 * it serves for one. Run with:
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { CARD_HEIGHT, CARD_WIDTH, MAX_CARD_BYTES, cardId, cardPage, cardProblem, isCardId, jpegSize } from '../dist-test/cards.js';

let pass = 0;
let fail = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    fail++;
  }
};

/** A JPEG's bones: SOI, an APP0, a DQT, then a baseline frame header of the given size. */
const jpeg = (width, height, pad = 0) => new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xdb, 0x00, 0x04, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  0xff, 0xd9,
  ...new Array(pad).fill(0),
]);

console.log('cards');

await check('reads a JPEG’s size from its frame header', () => {
  assert.deepEqual(jpegSize(jpeg(1200, 630)), { width: 1200, height: 630 });
  assert.deepEqual(jpegSize(jpeg(64, 48)), { width: 64, height: 48 });
});

await check('a 1200 by 630 JPEG is a card', () => {
  assert.equal(cardProblem(jpeg(CARD_WIDTH, CARD_HEIGHT)), null);
});

await check('anything else is refused, and says why', () => {
  assert.match(cardProblem(jpeg(800, 600)), /1200 by 630/);
  assert.match(cardProblem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0])), /JPEG/);
  assert.match(cardProblem(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), /JPEG/);
  assert.match(cardProblem(jpeg(CARD_WIDTH, CARD_HEIGHT, MAX_CARD_BYTES)), /too large/);
});

await check('a run has one card id, and it is not the run', async () => {
  const run = 'a'.repeat(32);
  const id = await cardId(run);
  assert.equal(isCardId(id), true);
  assert.equal(await cardId(run), id);
  assert.notEqual(await cardId('b'.repeat(32)), id);
  assert.equal(run.includes(id), false);
});

await check('the page names the card for X, and sends a person on to the site', () => {
  const html = cardPage({ image: 'https://w.test/c/abc.jpg', page: 'https://w.test/c/abc', site: 'https://seat-airlines.space/' });
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/w\.test\/c\/abc\.jpg">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /http-equiv="refresh" content="0; url=https:\/\/seat-airlines\.space\/"/);
});

await check('nothing is written into the page unescaped', () => {
  const html = cardPage({ image: '"><script>x</script>', page: 'p', site: 's' });
  assert.equal(html.includes('<script>'), false);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
