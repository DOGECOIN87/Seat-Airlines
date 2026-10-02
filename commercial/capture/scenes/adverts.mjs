// The adverts film's real footage: the cabin from 16A with an advert on the seatback ahead (15A),
// and stills of the wall and the advert dialog for reference.
import { open, board, ROOT } from '../lib/session.mjs';
import path from 'node:path';
import fs from 'node:fs';
const AD = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'public/brand/advert-nimbus.png')).toString('base64');
const dir = path.join(ROOT, 'capture/raw/ref');
fs.mkdirSync(dir, { recursive: true });
const s = await open();
await board(s, { size: [1920, 1080] });
await s.api((api, ad) => { api.setAdvert(ad, '15A'); api.setAdvert(ad, '16A'); api.setCamera('exitRowForward'); }, AD);
await s.settle(6, 700);
await s.shot(path.join(dir, 'cabin.jpg'));
console.log('cabin still');
if (!process.argv.includes('--stills')) await s.record('adverts_cabin_take1', Number(process.env.FRAMES || 40));
const tab = s.page.getByRole('button', { name: /^Seats/ }).first();
if (await tab.count()) { await tab.click().catch(() => {}); await s.step(10, 100); }
await s.shot(path.join(dir, 'wall.jpg'));
console.log('wall still');
const adv = s.page.getByRole('button', { name: /Advertise here|Change your advert/ }).first();
if (await adv.count()) { await adv.click().catch(() => {}); await s.step(8, 100); await s.shot(path.join(dir, 'dialog.jpg')); console.log('dialog still'); }
else console.log('no advertise button');
await s.close();
