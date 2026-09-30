// The flight deck: the captain's seat, a slow pan across the glass and out of the windshield.
import { open, board, preview, stillPath } from '../lib/session.mjs';
const FROM = Number(process.env.DECK_FROM ?? 28), TO = Number(process.env.DECK_TO ?? -22);
const s = await open();
await board(s);
await s.api((api) => { api.setMarketCap(2_400_000); api.setChange(6.8); api.goTo('deck'); api.setPlate('view'); });
await s.settle(); // the deck's chunk loads and its shaders compile
if (preview) {
  for (const y of [FROM, 0, TO]) { await s.api((api, v) => api.setLook(v), y); await s.step(3); await s.shot(stillPath(`deck_${y}`)); }
} else {
  const frames = 30; // 2 s at 15 fps
  await s.record('deck_take1', frames, async (i) => { await s.api((api, a, b, k) => api.setLook(a + (b - a) * (0.5 - Math.cos(Math.PI * k) / 2)), FROM, TO, i / (frames - 1)); });
}
await s.close();
