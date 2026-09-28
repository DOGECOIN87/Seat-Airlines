import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element to mount into.');

/* Before the first paint: Android keeps no strip clear at the foot of the
   screen for this page (see `--safe-bottom` in index.css). */
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('is-android');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  const register = () => void navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(register, { timeout: 2500 });
  } else {
    globalThis.setTimeout(register, 1500);
  }
}
