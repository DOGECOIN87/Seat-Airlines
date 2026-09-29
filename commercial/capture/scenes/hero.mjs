// Scene 4 (e): the main page, top, the 3D aeroplane idling in the hero view.
import { open, board, preview, stillPath } from '../lib/session.mjs';
const s = await open();
await board(s);
await s.api((api) => api.app.setCamera('exterior'));
await s.step(20, 100);
if (preview) await s.shot(stillPath('hero'));
else await s.record('hero_take1', 30);
await s.close();
