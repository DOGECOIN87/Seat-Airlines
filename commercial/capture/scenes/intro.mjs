// The opening shot, when the supplied animation (assets/source/user-plane.mp4) is not to hand:
// the app's own airliner, outside, full frame, under the cloud deck.
import { open, board, preview, stillPath } from '../lib/session.mjs';
const s = await open();
await board(s);
await s.api((api) => { api.setMarketCap(600_000); api.setChange(3.2); api.app.setCamera('exterior'); api.setPlate('view'); });
await s.settle();
if (preview) {
  for (const n of [0, 30, 60]) { await s.step(n ? 30 : 1); await s.shot(stillPath(`intro_${n}`)); }
} else {
  await s.record('intro_take1', 72); // 4.8 s at 15 fps
}
await s.close();
