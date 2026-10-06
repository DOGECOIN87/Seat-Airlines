import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { DEFAULT_WORKER_API } from './src/lib/workerBase';

/**
 * The page's Content-Security-Policy, as a <meta> tag, because GitHub Pages
 * cannot send headers.
 *
 * What it buys: a script that is not one of this site's own files does not
 * run, whatever gets into the page — an advert caption, a card, a message —
 * and data can only be sent to the services named here. So the list of
 * services is made from the same VITE_ variables the build reads, rather than
 * typed out a second time: point the page at another Worker or feed and the
 * policy follows, instead of quietly blocking it.
 *
 * Wallets are unaffected: Phantom, Solflare, Backpack and Nightly inject from
 * their own extension context, which a page's policy does not reach (pump.fun
 * runs the same `script-src 'self'`). Only on `vite build`: the dev server
 * needs inline scripts and a socket for hot reload. `frame-ancestors` cannot
 * be set from a meta tag, so framing is not covered here.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const origin = (value: string | undefined) => {
    try {
      return value?.trim() ? new URL(value.trim()).origin : null;
    } catch {
      return null;
    }
  };
  const connect = new Set([
    "'self'",
    origin(env.VITE_BANNERS_API) ?? DEFAULT_WORKER_API,
    origin(env.VITE_DIRECTORY_API),
    origin(env.VITE_BANNERS_URL),
    origin(env.VITE_HOLDERS_URL),
    origin(env.VITE_RPC_URL_PUBLIC),
    origin(env.VITE_MARKET_URL) ?? 'https://api.jup.ag',
    'https://api.open-meteo.com',
    // The plane's afterburner: the Boosts running on the token's pair (src/lib/dexBoost.ts).
    'https://api.dexscreener.com',
    // Advert artwork when it is served straight from R2 (the Worker's PUBLIC_IMAGE_BASE).
    'https://*.r2.dev',
    /* Email and passkey wallets (src/lib/heliusBridge.tsx): sign-in and
       signing go to Turnkey from the browser, the wallet reads the chain from
       the project's key-less Secure RPC URL, and the sign-in screen fetches
       its loading animation. The Helius key itself stays in the Worker. */
    'https://api.turnkey.com',
    'https://authproxy.turnkey.com',
    'https://*.helius-rpc.com',
    'https://lottie.host',
  ].filter((o): o is string => Boolean(o)));
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Adverts come from wherever the Worker stores them; wallet icons are data: URLs; the editor draws to blobs.
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    `connect-src ${[...connect].join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'seat-airlines-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_'))],
  // Served from a project page as often as a root domain, so relative asset
  // URLs keep both working without a rebuild.
  base: './',
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  // The sandbox exposes previews through a generated hostname that is not
  // known at build time. This is only used by the local preview server.
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'three-vendor';
          // React itself only: `@headlessui/react/` and the like also contain
          // "/react/", and belong to the embedded wallet's lazy chunk.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
}));
