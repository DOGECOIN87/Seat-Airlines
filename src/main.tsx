import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { CAPTURE } from './capture/flag';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element to mount into.');

/* Before the first paint: Android keeps no strip clear at any edge of the
   screen for this page (see `--safe-top` and the rest in index.css). */
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('is-android');

const mount = () => createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Capture mode (filming the commercial) installs its stand-ins first. Never
   true in a production build: see capture/flag.ts. */
if (CAPTURE) void import('./capture/install').then(mount);
else mount();

if (!CAPTURE && 'serviceWorker' in navigator) {
  const register = () => void navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(register, { timeout: 2500 });
  } else {
    globalThis.setTimeout(register, 1500);
  }
}
