import assert from 'node:assert/strict';
import worker from '../dist-test/occupancyWorker.js';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let clock = originalNow();
Date.now = () => clock;
const rpcCalls = [];
const holders = Array.from({ length: 200 }, (_, i) => ({ address: `wallet${i}`, balance: 1000 - i }));
let available = true;
globalThis.fetch = async (url, init) => {
  const request = JSON.parse(init.body);
  rpcCalls.push({ url: String(url), request });
  if (!available) return new Response('{}', { status: 503 });
  let result;
  switch (request.method) {
    case 'getTokenSupply': result = { value: { amount: '1000000', decimals: 0, uiAmount: 1000000 } }; break;
    case 'getTokenAccounts': result = { token_accounts: request.params.page === 1 ? holders.map(h => ({ owner: h.address, amount: h.balance })) : [] }; break;
    case 'getMultipleAccounts': result = { value: request.params[0].map(() => ({ owner: '11111111111111111111111111111111' })) }; break;
    default: throw new Error(`Unexpected RPC call: ${request.method}`);
  }
  return Response.json({ jsonrpc: '2.0', id: 1, result });
};
const read = env => worker.fetch(new Request('https://worker.test/holders'), env);
try {
  const unknown = await read({});
  assert.equal(unknown.status, 503, 'an unread holder list must not be a successful empty cabin');

  const env = { TOKEN_MINT: 'mint', HELIUS_API_KEY: 'test-key', LADDER_CACHE_MS: '1000' };
  const response = await read(env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.coverage, 'complete');
  assert.equal(body.holders.length, 178, 'all cabin seats should be read over the Worker route');
  assert.equal(new Set(body.holders.map(h => h.address)).size, 178);
  assert(rpcCalls.every(call => call.url === 'https://mainnet.helius-rpc.com/?api-key=test-key'), 'the configured Helius key was not used server-side');
  assert.equal(rpcCalls.filter(call => call.request.method === 'getTokenAccounts').length, 2, 'DAS pagination must reach the final empty page');

  available = false;
  clock += 2000;
  const fallback = await read(env);
  assert.equal(fallback.status, 200);
  assert.deepEqual((await fallback.json()).holders, body.holders, 'a failed refresh replaced the complete chart with false vacancies');
  assert(!rpcCalls.some(call => call.request.method === 'getTokenLargestAccounts'));
  console.log('Worker occupancy: unknown returns 503; 178 seats read via Helius; failed refresh retains complete seating.');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
