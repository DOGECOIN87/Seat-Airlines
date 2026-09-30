/**
 * The directory's two halves, checked against each other.
 *
 * The first case here is the one that matters most and is the easiest to
 * break: the page and the Worker each write out the text the wallet signs,
 * and if those two strings differ by a character then every sign-in fails
 * with "that signature does not match the wallet" — a message that points at
 * the wallet rather than at the typo that caused it.
 *
 * The rest is what the server will accept into the database.
 *
 *   npm test
 */
import { webcrypto as crypto } from 'node:crypto';
import { signInChallenge as clientChallenge, SOCIALS } from '../dist-test/networkingApi.js';
import {
  bearerToken, isAddress, mintToken, parseStoredLinks, readMessageBody, readProfileInput, readSocial,
  signInChallenge as workerChallenge, tokenHash, MAX_BODY_CHARS, SOCIAL_NETWORKS,
} from '../dist-test/workerNetworking.js';

let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const toBase58 = (bytes) => {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => B58[d]).join('');
};

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const wallet = toBase58(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));

console.log('\ncabin directory');

await check('the page and the Worker sign the same text', () => {
  const issued = '2026-09-20T12:00:00.000Z';
  assert(
    clientChallenge(wallet, issued) === workerChallenge(wallet, issued),
    'the sign-in challenge differs between the page and the Worker',
  );
});

await check('the challenge names the wallet and the time', () => {
  const issued = '2026-09-20T12:00:00.000Z';
  const text = workerChallenge(wallet, issued);
  assert(text.includes(`wallet: ${wallet}`), 'the challenge does not name the wallet');
  assert(text.includes(`issued: ${issued}`), 'the challenge is not stamped with the time');
});

await check('a real public key is an address', () => {
  assert(isAddress(wallet), 'a genuine ed25519 key was refused');
});

await check('junk is not an address', () => {
  for (const value of ['', 'hello', '0OIl', wallet + wallet, 42, null, undefined]) {
    assert(!isAddress(value), `"${String(value)}" was accepted as an address`);
  }
});

await check('a card is trimmed and capped', () => {
  const out = readProfileInput({ displayName: '  Aisle Hopper  ', role: 'x'.repeat(500) });
  assert(!('error' in out), 'a valid card was refused');
  assert(out.profile.displayName === 'Aisle Hopper', 'the name was not trimmed');
  assert(out.profile.role.length === 120, `the role was not capped: ${out.profile.role.length}`);
  assert(out.profile.email === '', 'a missing field did not default to empty');
});

await check('a javascript: contact link is refused', () => {
  const out = readProfileInput({ website: 'javascript:alert(1)' });
  assert('error' in out, 'a javascript: URL was stored as a contact link');
});

await check('an email that is not one is refused', () => {
  assert('error' in readProfileInput({ email: 'not-an-email' }), 'a malformed email was accepted');
  assert(!('error' in readProfileInput({ email: 'pilot@seat-airlines.space' })), 'a real email was refused');
});

await check('every network the Worker keeps is one the page can show', () => {
  const page = SOCIALS.map((s) => s.key).sort().join(',');
  const worker = [...SOCIAL_NETWORKS].sort().join(',');
  assert(page === worker, `page shows ${page}, Worker keeps ${worker}`);
});

await check('a handle, an @handle and the profile link come out the same', () => {
  const same = (network, inputs, want) => {
    for (const input of inputs) {
      const got = readSocial(network, input);
      assert(got === want, `${network} "${input}" kept as ${JSON.stringify(got)}, not "${want}"`);
    }
  };
  same('x', ['seatairlines', '@seatairlines', 'https://x.com/seatairlines', 'twitter.com/seatairlines?s=21'], 'seatairlines');
  same('telegram', ['@seat_airlines', 't.me/seat_airlines', 'https://telegram.me/seat_airlines/'], 'seat_airlines');
  same('linktree', ['seat', 'linktr.ee/seat', 'https://linktr.ee/seat'], 'seat');
  same('instagram', ['@seat.airlines', 'https://www.instagram.com/seat.airlines/'], 'seat.airlines');
  same('tiktok', ['@seat.air', 'https://www.tiktok.com/@seat.air'], 'seat.air');
  same('youtube', ['@SeatAir', 'youtube.com/@SeatAir', 'https://m.youtube.com/@SeatAir/videos'], 'SeatAir');
  same('github', ['seat-airlines', 'https://github.com/seat-airlines'], 'seat-airlines');
  same('discord', ['Pilot.One', '@pilot.one'], 'pilot.one');
  same('discord', ['discord.gg/abc123', 'https://discord.com/invite/abc123'], 'https://discord.gg/abc123');
});

await check('a link to somewhere else is not taken for an account', () => {
  for (const [network, input] of [
    ['x', 'https://evil.example/seatairlines'],
    ['x', 'javascript:alert(1)'],
    ['telegram', 'abc'],
    ['youtube', 'https://www.youtube.com/channel/UCabcdef'],
    ['tiktok', 'https://www.tiktok.com/seat.air'],
    ['github', '-leading-dash'],
    ['discord', 'https://discord.example/invite/abc'],
  ]) {
    assert(readSocial(network, input) === null, `${network} took "${input}"`);
  }
});

await check('a card with a bad account is refused, and says which', () => {
  const out = readProfileInput({ links: { telegram: 'no' } });
  assert('error' in out && /Telegram/.test(out.error), `refusal did not name the network: ${JSON.stringify(out)}`);
  const ok = readProfileInput({ links: { x: '@seatairlines', myspace: 'tom', github: '' } });
  assert(!('error' in ok), 'a good card was refused');
  assert(JSON.stringify(ok.profile.links) === '{"x":"seatairlines"}', `kept ${JSON.stringify(ok.profile.links)}`);
});

await check('the page links each account only on its own network', () => {
  const hosts = { x: 'x.com', telegram: 't.me', linktree: 'linktr.ee', instagram: 'www.instagram.com', tiktok: 'www.tiktok.com', youtube: 'www.youtube.com', github: 'github.com' };
  for (const social of SOCIALS) {
    if (social.key === 'discord') {
      assert(social.href('pilot.one') === null, 'a Discord username was linked');
      assert(social.href('https://discord.gg/abc123') === 'https://discord.gg/abc123', 'a Discord invite was not linked');
      continue;
    }
    const href = new URL(social.href('name'));
    assert(href.protocol === 'https:' && href.hostname === hosts[social.key], `${social.key} links to ${href}`);
  }
});

await check('stored links that are not links read back as none', () => {
  assert(JSON.stringify(parseStoredLinks('not json')) === '{}', 'garbage was read as links');
  assert(JSON.stringify(parseStoredLinks(null)) === '{}', 'a card with no row was not empty');
  assert(JSON.stringify(parseStoredLinks('{"x":"https://evil.example/a"}')) === '{}', 'a bad stored link came back');
});

await check('an empty introduction is refused', () => {
  assert('error' in readMessageBody('   '), 'an empty message was accepted');
  assert('error' in readMessageBody(null), 'a non-string message was accepted');
});

await check('an oversized introduction is refused', () => {
  assert('error' in readMessageBody('x'.repeat(MAX_BODY_CHARS + 1)), 'an oversized message was accepted');
  assert(!('error' in readMessageBody('Hello from 3A')), 'a normal message was refused');
});

await check('invisible text is stripped from cards and messages', () => {
  const out = readProfileInput({ displayName: '\u202Eeman\u200B\u0007 real\nname', role: 'Pilot \uD83D\uDC68\u200D\u2708\uFE0F' });
  assert(!('error' in out), 'a card with invisible text was refused rather than cleaned');
  assert(out.profile.displayName === 'eman real name', `invisible or line-breaking characters were kept: ${JSON.stringify(out.profile.displayName)}`);
  assert(out.profile.role.includes('\u200D'), 'the zero-width joiner inside an emoji was stripped');
  assert('error' in readMessageBody('\u200B\u200B \uFEFF'), 'a message of only invisible characters was accepted');
  const kept = readMessageBody('Line one\r\n\n\n\nLine two\u0000');
  assert(!('error' in kept) && kept.body === 'Line one\n\nLine two', `a message was not cleaned as expected: ${JSON.stringify(kept.body)}`);
});

await check('a token is stored only as its hash', async () => {
  const token = mintToken();
  const hash = await tokenHash(token);
  assert(token.length >= 40, `the token is too short to be random: ${token.length}`);
  assert(hash.length === 64 && !hash.includes(token), 'the hash is not a SHA-256 of the token');
  assert(await tokenHash(token) === hash, 'hashing the same token twice gave two answers');
  assert(await tokenHash(mintToken()) !== hash, 'two tokens hashed the same');
});

await check('the bearer header is read, and only when it is one', () => {
  assert(bearerToken('Bearer abc-123') === 'abc-123', 'a valid bearer header was not read');
  assert(bearerToken('Basic abc') === null, 'a non-bearer scheme was accepted');
  assert(bearerToken(null) === null, 'a missing header was accepted');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
