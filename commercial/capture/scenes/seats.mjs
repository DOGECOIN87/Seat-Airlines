// Scene 5 (h): the seat map; the cold open's seat, 16A, lights as if picked.
import { open, board, preview, stillPath } from '../lib/session.mjs';
const s = await open();
await board(s);
await s.api((api) => { api.selectSeat(null); api.app.openPanel('wall'); });
await s.step(15, 100);
if (preview) {
  await s.shot(stillPath('seats'));
  await s.api((api) => api.selectSeat('16A')); await s.step(10); await s.shot(stillPath('seats_selected'));
} else {
  await s.record('seats_take1', 30, async (i) => { if (i === 8) await s.api((api) => api.selectSeat('16A')); });
}
await s.close();
