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

## New on Seat Airlines (X post)

`NewFeatures` is a 16.5 s, 1080×1350 (4:5) cut for X, text-led so it works muted, made entirely of real screenshots of the new features. `sh render-new-features.sh` writes `out/seat-airlines-new-features.mp4`.

| Screenshots (`public/features/`) | Made by |
|---|---|
| `landing`, `picker`, `tour1`–`4`, `site` | `node capture/features/stills.mjs`: against a built preview of the site (`npm run build && npx vite preview --port 4173`, from the repo root); no WebGL needed except for `landing` |
| `signin-1`–`3` | `node capture/features/signin.mjs`: the real email and passkey sheet (Turnkey's component, run by the site), with stand-in answers for the Worker's status and bootstrap and Turnkey's auth-proxy config. No account is created and the address shown is made up |
