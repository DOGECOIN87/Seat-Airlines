// Scenes 2-3 (a, b): the splash from its first frame, then the landing it fades onto.
import { open, preview, stillPath, ROOT } from '../lib/session.mjs';
import fs from 'node:fs';
const s = await open();
// A navy page first, so the recording can start before the site does.
await s.page.setContent('<body style="margin:0;background:#0F1725"></body>');
await s.goto();
if (preview) {
  for (const [f, n] of [[20, 'splash_a'], [90, 'splash_b'], [60, 'splash_c'], [120, 'postsplash']]) { await s.step(f); await s.shot(stillPath(n)); }
} else {
  await s.record('splash_take1', 120);
}
await s.close();
