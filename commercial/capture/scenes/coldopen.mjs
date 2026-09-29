// Scene 1 (f, g): exit-row POV forward, the head turns to the left window, the invented house outside.
import { open, board, preview, stillPath } from '../lib/session.mjs';
const s = await open();
await board(s);
await s.api((api) => { api.setPlate('view'); api.setCamera('exitRowForward'); api.showEasterEggHouse(true); });
await s.step(15, 100);
if (preview) {
  await s.shot(stillPath('coldopen_forward'));
  await s.api((api) => api.setCamera('exitRowLeft'));
  await s.step(2);
  await s.shot(stillPath('coldopen_left'));
} else {
  await s.api((api) => api.showEasterEggHouse(true));
  // 2.5 s forward, 0.9 s turn, 5.5 s on the window: slid in the edit so the turn starts on "left".
  await s.record('coldopen_take1', 267, async (i) => {
    if (i === 75) await s.api((api) => { api.animateCamera('exitRowForward', 'exitRowLeft', 900, 'easeInOutCubic'); });
  });
}
await s.close();
