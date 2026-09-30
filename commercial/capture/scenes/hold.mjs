// The cargo hold: standing in the room under the cabin floor, looking along it.
import { open, board, preview, stillPath } from '../lib/session.mjs';
const FROM = Number(process.env.HOLD_FROM ?? -30), TO = Number(process.env.HOLD_TO ?? 30);
const s = await open();
await board(s);
await s.api((api) => { api.setMarketCap(2_400_000); api.goTo('hold'); api.setPlate('view'); });
await s.settle();
if (preview) {
  for (const y of [FROM, 0, TO]) { await s.api((api, v) => api.setLook(v), y); await s.step(3); await s.shot(stillPath(`hold_${y}`)); }
} else {
  const frames = 30; // 2 s at 15 fps
  await s.record('hold_take1', frames, async (i) => { await s.api((api, a, b, k) => api.setLook(a + (b - a) * (0.5 - Math.cos(Math.PI * k) / 2)), FROM, TO, i / (frames - 1)); });
}
await s.close();
