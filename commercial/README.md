# SEAT AIRLINES — 24 s commercial

Output: `out/seat-airlines-commercial-A.mp4` (primary) and `-B.mp4` (comparison order), 1920×1080, 30 fps, H.264 + AAC, −14 LUFS.

Everything runs from `commercial/` after `npm ci`. The app's dev server must be running in capture mode for captures:
`(cd .. && VITE_CAPTURE_MODE=1 npx vite --host 127.0.0.1 --port 3000)`.

| Task | Command |
|---|---|
| Re-capture a scene | `node capture/scenes/<intro\|splash\|hero\|deck\|seats\|advert\|hold\|climb\|altitudes>.mjs` (all: `sh capture/run-all.sh`), then `sh capture/conform.sh`. Add `--preview` for stills only. Prefix `SA_GL=gpu` to render on this machine's GPU (minutes rather than hours); without it, SwiftShader. Change no files in the repo while a capture runs: Vite reloads the page and the take fails. |
| Regenerate VO | `sh vo/generate.sh && python3 vo/verify.py` (update the `seconds` in `src/config/timeline.ts` if lengths change) |
| Swap music | Put the track at `public/audio/music.wav`; it enters at the splash, ducks under VO and hits at the cloud break (see `Commercial.tsx`) |
| Reorder scenes | Move a line in `ORDER_A` / `ORDER_B` in `src/config/timeline.ts` |
| Re-render | `sh render.sh` (renders A and B, loudness-normalises, writes the contact sheet) |

The intro is the client's animation (`assets/source/user-plane.mp4`, not in git) when it is present; otherwise `conform.sh` uses `intro.mjs`, the app's own airliner filmed outside.

Capture mode lives in the app at `src/capture/` and is compiled out of production builds (it needs both `VITE_CAPTURE_MODE=1` at build time and `?capture=1` in the URL).

## The launch films (drawn in code, 4K)

Three films that need no captures: every frame is drawn by React in `src/intro` and `src/explainer`,
on a 1920×1080 stage zoomed to 3840×2160, and every sound is synthesized by `sfx/` (no samples).

| Film | Composition | Length | What it is |
|---|---|---|---|
| Launch intro | `Intro-4K` | 33 s | The site's opening film: the glossy badge, the airliner above the clouds, the seat map filling, the climb from weather to Mars, the departures board, the end card. |
| Short | `Short-4K` | 14.5 s | The same film cut down: badge, climb, board, end card. |
| Explainer | `Explainer-4K` | ~58 s, loops | "How it works", a pre-flight briefing in eight steps. The last frame dissolves into the first, and its sound bed loops on the same period, so it can play on repeat. |

`npm run films` (or `sh render-films.sh Intro`) preps the VO, synthesizes the sound, renders, masters to −14 LUFS
and writes `out/seat-airlines-<film>-4k.mp4` plus a 1080p copy. `npm run stills -- Intro-1080 0 300 600` writes a contact sheet.

| To change | Edit |
|---|---|
| Scene lengths, VO cues, the climb's band times | `config/intro.json` |
| Explainer chapters, their minimum lengths and action frames | `config/explainer.json` (a chapter stretches by itself if its line needs longer) |
| Voice | Drop takes in `vo/intro/` or `vo/explainer/` (names in `vo-script-intro.md`, `vo-script-explainer.md`), then `npm run vo`. Pauses over 0.45 s are capped and slow lines sped up a touch (`TEMPO` in `vo/prep.py`). |
| Sound | `sfx/intro.mjs`, `sfx/explainer.mjs` (toolkit in `sfx/dsp.mjs`); `npm run sfx`. Stem levels and ducking: `src/intro/sound.tsx`, `src/explainer/Film.tsx`. |
