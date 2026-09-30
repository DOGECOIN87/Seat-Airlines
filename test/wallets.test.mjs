/**
 * Finding the wallets: the Wallet Standard handshake, and the older
 * providers on `window`, against a window with made-up wallets in it.
 *
 * What matters is that every wallet a person has installed is offered once,
 * by its own name, in a sensible order — and that the one they pick is the
 * one that connects and signs.
 *
 *   npm test
 */

// A window before the module ever looks at one: it reads `window` lazily.
globalThis.window = new EventTarget();

let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';
/** A Wallet Standard wallet that remembers what it was asked. */
const standardWallet = (name, { chains = ['solana:mainnet'], sign = true, address = `${name}Address1111` } = {}) => {
  const account = { address, chains };
  const asked = { connect: [], sign: [] };
  const features = {
    'standard:connect': {
      version: '1.0.0',
      connect: async (input) => {
        asked.connect.push(input);
        return { accounts: input?.silent && !wallet.trusted ? [] : [account] };
      },
    },
    'standard:disconnect': { version: '1.0.0', disconnect: async () => { asked.disconnected = true; } },
  };
  if (sign) {
    features['solana:signMessage'] = {
      version: '1.0.0',
      signMessage: async (...inputs) => {
        asked.sign.push(...inputs);
        return inputs.map(() => ({ signedMessage: inputs[0].message, signature: new Uint8Array([9, 9, 9]) }));
      },
    };
  }
  const wallet = { version: '1.0.0', name, icon: ICON, chains, accounts: [], features, asked, trusted: false };
  return wallet;
};

const nightly = standardWallet('Nightly');
const backpack = standardWallet('Backpack');
const ethOnly = standardWallet('MetaMask', { chains: ['eip155:1'] });
const noSigning = standardWallet('Half Wallet', { sign: false });

// Loaded before the page: they answer the page's app-ready.
window.addEventListener('wallet-standard:app-ready', (event) => event.detail.register(nightly, ethOnly, noSigning));
// An older provider, and one for a wallet that also registers.
window.solflare = {
  connect: async () => ({ publicKey: { toString: () => 'SolflareAddress1111' } }),
  signMessage: async () => new Uint8Array([7, 7]),
};
window.backpack = { connect: async () => ({ publicKey: { toString: () => 'LegacyBackpack1111' } }) };

const { listWallets, onWalletsChange } = await import('../dist-test/wallets.js');

console.log('\nfinding the wallets');

await check('a wallet loaded before the page is found, and one that cannot do Solana is not', () => {
  const names = listWallets().map((w) => w.name);
  assert(names.includes('Nightly'), `Nightly was not found: ${names}`);
  assert(!names.includes('MetaMask'), 'a wallet with no Solana chain was offered');
  assert(!names.includes('Half Wallet'), 'a wallet that cannot sign a message was offered');
});

await check('a wallet that registers late is found, and the page is told', () => {
  let told = 0;
  const stop = onWalletsChange(() => { told++; });
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: ({ register }) => register(backpack) }));
  stop();
  assert(told === 1, `the page was told ${told} times`);
  assert(listWallets().some((w) => w.id === 'std:Backpack'), 'the late wallet was not listed');
});

await check('a wallet found both ways is offered once, the registered way', () => {
  const backpacks = listWallets().filter((w) => w.name === 'Backpack');
  assert(backpacks.length === 1, `Backpack was offered ${backpacks.length} times`);
  assert(backpacks[0].id === 'std:Backpack', `the wrong Backpack was kept: ${backpacks[0].id}`);
});

await check('the four known wallets come first, in order', () => {
  window.phantom = { solana: { isPhantom: true, connect: async () => ({ publicKey: { toString: () => 'PhantomAddress1111' } }) } };
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: ({ register }) => register(standardWallet('Zeta'), standardWallet('Glow')) }));
  const names = listWallets().map((w) => w.name).join(', ');
  assert(names === 'Phantom, Solflare, Backpack, Nightly, Glow, Zeta', `offered as ${names}`);
});

await check('a registered wallet brings its icon; an older provider has none', () => {
  const byName = Object.fromEntries(listWallets().map((w) => [w.name, w]));
  assert(byName.Nightly.icon === ICON, 'Nightly lost its icon');
  assert(byName.Solflare.icon === null, 'an older provider was given an icon');
});

console.log('\nconnecting and signing');

await check('a registered wallet connects, and signs with the account it connected', async () => {
  const wallet = listWallets().find((w) => w.name === 'Nightly');
  const address = await wallet.connect(false);
  assert(address === 'NightlyAddress1111', `connected as ${address}`);
  const sig = await wallet.signMessage(new TextEncoder().encode('hello'));
  assert(sig.join() === '9,9,9', 'the signature did not come back');
  const [asked] = nightly.asked.sign;
  assert(asked.account.address === 'NightlyAddress1111', 'signed with some other account');
  assert(new TextDecoder().decode(asked.message) === 'hello', 'signed some other message');
});

await check('asking quietly gets nothing from a wallet that has not trusted the site', async () => {
  const wallet = listWallets().find((w) => w.name === 'Backpack');
  assert((await wallet.connect(true)) === null, 'a quiet connect got an address it was never given');
  assert(backpack.asked.connect[0]?.silent === true, 'the wallet was not asked quietly');
  backpack.trusted = true;
  assert((await wallet.connect(true)) === 'BackpackAddress1111', 'a trusting wallet did not reconnect quietly');
});

await check('an older provider connects and signs, whichever shape its signature takes', async () => {
  const wallet = listWallets().find((w) => w.name === 'Solflare');
  assert((await wallet.connect(false)) === 'SolflareAddress1111', 'Solflare did not connect');
  assert((await wallet.signMessage(new Uint8Array([1]))).join() === '7,7', 'raw signature bytes were not taken');
  window.solflare.signMessage = async () => ({ signature: new Uint8Array([5]) });
  assert((await wallet.signMessage(new Uint8Array([1]))).join() === '5', 'a { signature } reply was not taken');
});

await check('a wallet that leaves is no longer offered', () => {
  let unregister;
  const temp = standardWallet('Temporary');
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: ({ register }) => { unregister = register(temp); } }));
  assert(listWallets().some((w) => w.name === 'Temporary'), 'the wallet did not arrive');
  unregister();
  assert(!listWallets().some((w) => w.name === 'Temporary'), 'the wallet that left is still offered');
});

console.log('\nswitching account inside the wallet');

await check('a registered wallet reports the new account, and then signs with it', async () => {
  const changes = new Set();
  const switcher = standardWallet('Switcher', { address: 'FirstAccount1111' });
  switcher.features['standard:events'] = { version: '1.0.0', on: (_event, fn) => { changes.add(fn); return () => changes.delete(fn); } };
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: ({ register }) => register(switcher) }));
  const wallet = listWallets().find((w) => w.name === 'Switcher');
  await wallet.connect(false);
  const seen = [];
  const stop = wallet.onAccountChange((a) => seen.push(a));
  const second = { address: 'SecondAccount1111', chains: ['solana:mainnet'] };
  changes.forEach((fn) => fn({ accounts: [second] }));
  changes.forEach((fn) => fn({ chains: ['solana:devnet'] })); // not about accounts
  changes.forEach((fn) => fn({ accounts: [second] })); // the same account again
  assert(seen.join() === 'SecondAccount1111', `the page was told: ${seen}`);
  await wallet.signMessage(new Uint8Array([1]));
  assert(switcher.asked.sign.at(-1).account.address === 'SecondAccount1111', 'it signed with the old account');
  changes.forEach((fn) => fn({ accounts: [] }));
  assert(seen.at(-1) === null, 'an account the site is not trusted with did not read as disconnected');
  stop();
  assert(changes.size === 0, 'unsubscribing left the listener behind');
});

await check('an older provider reports the new key, a null one, and a disconnect', () => {
  const handlers = {};
  window.solflare.on = (e, fn) => { (handlers[e] ??= new Set()).add(fn); };
  window.solflare.off = (e, fn) => handlers[e]?.delete(fn);
  const wallet = listWallets().find((w) => w.name === 'Solflare');
  const seen = [];
  const stop = wallet.onAccountChange((a) => seen.push(a));
  handlers.accountChanged.forEach((fn) => fn({ toString: () => 'NewKey1111' }));
  handlers.accountChanged.forEach((fn) => fn(null));
  handlers.disconnect.forEach((fn) => fn());
  assert(seen.join('|') === 'NewKey1111||', `the page was told: ${JSON.stringify(seen)}`);
  stop();
  assert(!handlers.accountChanged.size && !handlers.disconnect.size, 'unsubscribing left a listener behind');
});

await check('a wallet with no events is followed by nothing, and nothing breaks', () => {
  const wallet = listWallets().find((w) => w.name === 'Nightly');
  const stop = wallet.onAccountChange(() => { throw new Error('called'); });
  stop();
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
