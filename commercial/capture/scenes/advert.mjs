// Scene 6 (i): the custom demo creative on the seatback screen ahead, via capture mode only.
import { open, board, preview, stillPath, ROOT } from '../lib/session.mjs';
import fs from 'node:fs';
const png = fs.readFileSync(`${ROOT}/assets/advert/nimbus-cold-brew.png`).toString('base64');
const s = await open();
await board(s);
await s.api((api, src) => { api.setPlate('view'); api.setCamera('exitRowForward'); api.setAdvert(src, '15A'); }, `data:image/png;base64,${png}`);
await s.step(15, 100);
if (preview) await s.shot(stillPath('advert'));
else await s.record('advert_take1', 30);
await s.close();
