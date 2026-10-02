#!/usr/bin/env node
/**
 * Switches the aircraft to a new token, end to end, in one command:
 *
 *   npm run token:update -- <new contract address>
 *
 * 1. Checks the address is a real SPL token mint on Solana mainnet, so a typo
 *    or a wallet address cannot go live.
 * 2. Shows the old and new address and asks you to type "yes".
 * 3. Writes the new address everywhere it is printed: the page
 *    (src/lib/token.ts), the Worker (worker/wrangler.toml), the page's head
 *    (index.html), the README and the docs.
 * 4. Runs the site and Worker tests and a production build.
 * 5. Commits and pushes to main, which deploys the site and the Worker.
 * 6. Waits for both deploys and checks the live site and Worker are on the
 *    new address.
 *
 * Nothing is written until the checks in 1 pass and you say yes; nothing is
 * pushed unless the tests and the build pass. `--no-push` stops after 4.
 *
 * For the "Switch token" workflow, which runs this on GitHub where nobody can
 * type: `--yes` skips the question, `--fast` skips step 4 (the address is
 * the only change, and the deploy rebuilds the site anyway) and `--no-wait`
 * skips step 6, since the workflow starts the deploys itself.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const REPO = 'DOGECOIN87/Seat-Airlines';
// Overridable only so the whole flow can be rehearsed against a local copy.
const SITE = process.env.SA_SITE || 'https://seat-airlines.space';
const WORKER = process.env.SA_WORKER || 'https://seat-airlines-banners.trashmarket.workers.dev';
const RPC = 'https://api.mainnet-beta.solana.com';
// As Solana names them in a parsed account: the classic token program, and Token-2022 (pump.fun's mints).
const TOKEN_PROGRAMS = new Set(['spl-token', 'spl-token-2022']);

const args = process.argv.slice(2);
const push = !args.includes('--no-push');
const assumeYes = args.includes('--yes');
const fast = args.includes('--fast');
const wait = !args.includes('--no-wait');
const nextMint = args.find((a) => !a.startsWith('--'))?.trim() ?? '';

const say = (line = '') => console.log(line);
const fail = (line) => {
  console.error(`\n✗ ${line}`);
  process.exit(1);
};
const step = (n, line) => say(`\n${n}. ${line}`);

if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(nextMint)) {
  fail('Usage: npm run token:update -- <new contract address>\n  That is not a Solana address (32–44 base58 characters).');
}

/* ── 1. Is it a token? ─────────────────────────────────────────────────── */
step(1, 'Checking the address on Solana…');
let info;
try {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [nextMint, { encoding: 'jsonParsed' }] }),
  });
  info = (await res.json())?.result?.value;
} catch {
  fail('Could not reach Solana to check the address. Check your internet connection and run it again.');
}
if (!info) fail('Nothing exists at that address on Solana mainnet. Check it was copied in full.');
if (!TOKEN_PROGRAMS.has(info.data?.program) || info.data?.parsed?.type !== 'mint') {
  fail('That address exists but is not a token mint (it may be a wallet or a pool). Copy the token\'s contract address (CA).');
}
const supply = Number(info.data.parsed.info.supply) / 10 ** info.data.parsed.info.decimals;
const meta = (info.data.parsed.info.extensions ?? []).find((e) => e.extension === 'tokenMetadata')?.state;
const named = meta?.name ? `${meta.name}${meta.symbol ? ` ($${meta.symbol})` : ''}` : 'a token';
say(`   ✓ ${named}, supply ${supply.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`);

/* ── 2. Confirm ────────────────────────────────────────────────────────── */
const tokenPath = 'src/lib/token.ts';
const workerPath = 'worker/wrangler.toml';
const tokenText = await readFile(tokenPath, 'utf8');
const workerText = await readFile(workerPath, 'utf8');
const tokenPattern = /(const COMMITTED_MINT = ')([^']*)(';)/;
const workerPattern = /(TOKEN_MINT = ")([^"]*)(")/;
if (!tokenPattern.test(tokenText)) fail(`Could not find COMMITTED_MINT in ${tokenPath}.`);
if (!workerPattern.test(workerText)) fail(`Could not find TOKEN_MINT in ${workerPath}.`);
const previousMint = tokenText.match(tokenPattern)[2];
if (previousMint === nextMint) fail('That is already the token the site flies. Nothing to do.');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
if (push) {
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Switch to the main branch first (git checkout main).');
  if (git('status', '--porcelain')) fail('There are uncommitted changes in the repo. Commit or discard them first, so only the token change is pushed.');
  const pulled = spawnSync('git', ['pull', '--ff-only', '-q', 'origin', 'main'], { stdio: 'inherit' });
  if (pulled.status !== 0) fail('Could not update from GitHub (git pull). Sort that out, then run this again.');
  /* A repository variable overrides the committed address at build time, so
     it would quietly keep the old token live. */
  const vars = spawnSync('gh', ['variable', 'list', '-R', REPO], { encoding: 'utf8' });
  if (vars.status === 0 && /^VITE_TOKEN_MINT\s/m.test(vars.stdout)) {
    fail(`The GitHub variable VITE_TOKEN_MINT is set and would override this. Delete it first:\n  gh variable delete VITE_TOKEN_MINT -R ${REPO}`);
  }
}

say(`\n   Old CA: ${previousMint || '(none)'}`);
say(`   New CA: ${nextMint}   ← ${named}`);
say(push
  ? '\n   This switches the live site and the Worker to the new token. Seats, the market feed\n   and the holder checks all follow it. Adverts stay with their wallets.'
  : '\n   --no-push: files and checks only; nothing is committed or deployed.');
if (!assumeYes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\n   Type yes to continue: ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'yes') fail('Stopped. Nothing was changed.');
}

/* ── 3. Write it everywhere ───────────────────────────────────────────── */
step(3, 'Writing the new address…');
async function markdownUnder(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const found = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownUnder(path)));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}
const changed = [tokenPath, workerPath];
await writeFile(tokenPath, tokenText.replace(tokenPattern, `$1${nextMint}$3`));
await writeFile(workerPath, workerText.replace(workerPattern, `$1${nextMint}$3`));
/* Anywhere else the old address is printed for a person to read or copy:
   a stale CA in the docs is how somebody ends up buying the wrong token. */
/* With no token before this one, those places say so in fixed words instead
   (see "Announced at launch"), and those are what get replaced. */
const launchPlaceholders = [
  ['"https://pump.fun",', `"https://pump.fun/coin/${nextMint}",`],
  ['<a href="https://pump.fun">see $SEAT on pump.fun</a>', `<a href="https://pump.fun/coin/${nextMint}">see $SEAT on pump.fun</a>`],
  ['```\nAnnounced at launch\n```', '```\n' + nextMint + '\n```'],
  ['It trades on pump.fun, and its page is linked here once it launches.',
    `It trades on pump.fun: [pump.fun/coin/${nextMint}](https://pump.fun/coin/${nextMint}).`],
];
for (const path of ['index.html', 'README.md', ...(await markdownUnder('docs'))]) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    continue;
  }
  let next = text;
  if (previousMint) next = next.split(previousMint).join(nextMint);
  else for (const [from, to] of launchPlaceholders) next = next.split(from).join(to);
  if (next === text) continue;
  await writeFile(path, next);
  changed.push(path);
}
for (const path of changed) say(`   ✓ ${path}`);

/* ── 4. Test and build ─────────────────────────────────────────────────── */
step(4, 'Running the tests and a production build (a minute or two)…');
const run = (label, cmd, cmdArgs, cwd = '.') => {
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    say((r.stdout ?? '').split('\n').slice(-25).join('\n'));
    say((r.stderr ?? '').split('\n').slice(-15).join('\n'));
    fail(`${label} failed, so nothing was pushed. The files above were changed; undo them with: git checkout -- .`);
  }
  say(`   ✓ ${label}`);
};
if (fast) {
  say('   (--fast: skipped; the deploy builds the site again anyway.)');
} else {
  run('Site tests', 'npm', ['test']);
  run('Site build', 'npm', ['run', 'build']);
  run('Worker typecheck', 'npm', ['run', 'typecheck'], 'worker');
  run('Worker tests', 'npm', ['test'], 'worker');
}

if (!push) {
  say('\nDone (--no-push). Review with git diff; to ship it, commit and push, or run again without --no-push.');
  process.exit(0);
}

/* ── 5. Commit and push ───────────────────────────────────────────────── */
step(5, 'Committing and pushing to main…');
git('add', ...changed);
git('commit', '-q', '-m', `Fly the new token: ${nextMint}`, '-m', `Replaces ${previousMint || 'no token'} on the site, the Worker and the docs.`);
const pushed = spawnSync('git', ['push', '-q', 'origin', 'main'], { stdio: 'inherit' });
if (pushed.status !== 0) fail('The push failed. The change is committed locally; run: git push origin main');
const sha = git('rev-parse', 'HEAD');
say(`   ✓ Pushed ${sha.slice(0, 7)}.`);

if (!wait) {
  say('\nPushed (--no-wait): the deploys still have to run.');
  process.exit(0);
}

/* ── 6. Wait for the deploys and check the live site ───────────────────── */
step(6, 'Waiting for the site and the Worker to deploy (usually 2–4 minutes)…');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasGh = spawnSync('gh', ['--version']).status === 0;
if (hasGh) {
  for (let i = 0; i < 60; i++) {
    const out = spawnSync('gh', ['run', 'list', '-R', REPO, '-L', '10', '--json', 'headSha,workflowName,status,conclusion'], { encoding: 'utf8' });
    const runs = out.status === 0 ? JSON.parse(out.stdout).filter((r) => r.headSha === sha) : [];
    const pages = runs.filter((r) => r.workflowName === 'Deploy to GitHub Pages');
    const worker = runs.filter((r) => r.workflowName === 'Deploy the banners Worker');
    const done = (list) => list.length && list.every((r) => r.status === 'completed');
    if (done(pages) && done(worker)) {
      const bad = [...pages, ...worker].filter((r) => r.conclusion !== 'success');
      if (bad.length) fail(`A deploy failed (${bad.map((r) => r.workflowName).join(', ')}). See: https://github.com/${REPO}/actions`);
      say('   ✓ Both deploys finished.');
      break;
    }
    await sleep(10_000);
  }
} else {
  say('   (GitHub CLI not found: waiting three minutes instead.)');
  await sleep(180_000);
}

let workerOk = false;
let siteOk = false;
for (let i = 0; i < 12 && !(workerOk && siteOk); i++) {
  try {
    const flight = await fetch(`${WORKER}/holders`, { cache: 'no-store' });
    workerOk = flight.ok;
    const html = await (await fetch(`${SITE}/?v=${Date.now()}`, { cache: 'no-store' })).text();
    const entry = html.match(/assets\/index-[^"]+\.js/)?.[0];
    const js = entry ? await (await fetch(`${SITE}/${entry}`, { cache: 'no-store' })).text() : '';
    siteOk = js.includes(nextMint) && !js.includes(previousMint || '\u0000');
  } catch {
    /* try again */
  }
  if (!(workerOk && siteOk)) await sleep(15_000);
}
say(siteOk ? '   ✓ The live site is on the new CA.' : '   ! The live site does not show the new CA yet; GitHub Pages can take a few more minutes. Reload later to check.');
say(workerOk ? '   ✓ The Worker is answering.' : '   ! The Worker did not answer; check the Actions page.');
say(`\nDone. ${SITE} now flies ${nextMint}.`);
