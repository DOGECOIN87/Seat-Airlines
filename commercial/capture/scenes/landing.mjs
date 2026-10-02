// The launch intro's opening: the landing page as a desktop visitor first sees it, the 3D airliner
// flying full screen under the site's own bar and buttons, the splash already cleared.
import { open, preview, stillPath } from '../lib/session.mjs';
const s = await open({ width: 1920, height: 1080 });
await s.page.setViewportSize({ width: 480, height: 270 }); // warm up cheaply, as board() does
await s.goto();
await s.untilReady();
await s.api((api) => { api.setMarketCap(640_000); api.setChange(2.4); api.setSky(15, 'cloudy'); });
await s.page.keyboard.press('Space'); // a key clears the splash, as it does for a visitor
await s.step(20, 100);
await s.page.setViewportSize({ width: 1920, height: 1080 });
await s.settle(6, 700);
if (preview) {
  for (const n of [0, 20]) { await s.step(n || 1); await s.shot(stillPath(`landing_${n}`)); }
} else {
  await s.record('landing_take1', Number(process.env.FRAMES || 75)); // 5 s at 15 fps
}
await s.close();
