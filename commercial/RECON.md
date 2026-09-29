# Recon: SEAT AIRLINES for the commercial

## Stack
- React 19 + TypeScript, bundled by Vite 6; Tailwind 4 (PostCSS); three.js 0.185 for every 3D view. No state library: React state/hooks in `src/App.tsx`, feeds in `src/lib/*`.
- Run: `npm ci && npm run dev` (port 3000). Capture mode: `VITE_CAPTURE_MODE=1 npm run dev`, then open `/?capture=1`.
- Backend is a Cloudflare Worker (`worker/`, default `https://seat-airlines-banners.trashmarket.workers.dev`): holders, holdings, banners, scores, runs, flight switches. Market data from Jupiter, weather from Open-Meteo.

## Must-haves
| # | What | Where | How to reach it |
|---|---|---|---|
| a | Splash | `src/components/Landing.tsx` (`.sa-splash`), board `SplitFlapBoard.tsx` | Every visit. Phrases land, hold, then it fades (≤15 s); a key or tap clears it. Not gated by storage. |
| b | Post-splash | Same file: the landing ("Hold more. Fly higher."), 3D `LandingScene.tsx`, wordmark `Flyover.tsx` | Shown under the fading splash |
| c | Game | `Landing.tsx` + `LandingScene.tsx`, rules in `src/lib/landingGame.ts`, score in `src/lib/scoring.ts` | Fly / arrow keys; needs a wallet (capture mode supplies a fake one) |
| d | High score | End of flight in `Landing.tsx` (`.sa-landing__score`, "New best"); board `ScoresDialog.tsx` | After the crash. Best kept in localStorage (`readBest`/`keepBest`), board on the Worker `/scores` |
| e | Main page, hero plane | `App.tsx` with `ExteriorView.tsx` (inside `ViewFrame`) | "Enter"; camera `exterior` |
| f/g | Exit-row forward/left | `CabinView3D.tsx`, zone `exit` (rows 16–17), `YAW_FOR` left = −64° | Walk to Exit Row, Look left. **Dropped from the final cut at the client's request.** |
| h | Seat map | `SeatMap.tsx` in the `wall` panel | "Claim a seat" or `#wall` |
| i | Advert slot | Seats are square billboards (`src/lib/banners.ts`, 1:1, 384 px); they show on the seat map and on the seatback screens of the row ahead in 3D (`three/cabin.ts setAdverts`) | Holders upload via `AdvertDialog`; house ads fill unsold seats |
| j | Hero climb | Market cap → `bandFor()` → `WorldScene.render` camera height | Feed the market cap |

## Altitude
`src/lib/flightModel.ts`: `BAND_CLOUDS = 1_000_000`, `BAND_SPACE = 10_000_000`, `BAND_MOON = 50_000_000`, `BAND_MARS = 100_000_000`. Within a band, progress is log-scaled. `WorldScene.ts` `ALTITUDE` maps each band to camera metres (weather 900–2,600 m, above the clouds 3,400–9,000 m). The cloud deck sits at 2,400 m, so crossing $1M lifts the camera over it.

## Game
Arrows/WASD or drag. It dives to the deck, you climb to 10,000 ft, an engine blows (sometimes early, sometimes by lightning), then you survive on one engine until the ground. Randomness is plain `Math.random` (capture mode seeds it). Score: height, climb bonus, survival rate ×1.5 wings level, ×2 under 500 ft, UFO dodge +2,500.

## Seat map data
It shows each held seat's rank and **real shortened wallet addresses** (`shortAddress`) from the live holder list. Capture mode replaces the list with invented `FAKE…` addresses, so no real address can appear.

## Window view
Real 3D ground, clouds and sky from the same world scene; left windows look out over the port wing.

## Wallet
Needed only to fly the game and to post scores or adverts. Signing is plain-text messages only. Capture mode installs a fake provider that refuses every signature.

## Capture method (deviation)
The container has no GPU (WebGL = SwiftShader, ~0.4 fps at 1080p). Real-time screencast is impossible, so capture freezes time (virtual clock for `performance.now`, `Date`, timers, rAF, CSS/Web Animations), steps 1/15 s per frame, and screenshots each frame with CDP `Page.captureScreenshot`. The footage is frame-perfect; it is blended to 30 fps in the edit.
