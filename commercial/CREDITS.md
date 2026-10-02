# Credits and sources

- **App footage**: captured from this repository (SEAT AIRLINES), in capture mode with invented data. MIT, same owner.
- **Intro animation**: supplied by the client (`assets/source/user-plane.mp4`, 21.0–25.5 s). Its audio is not used.
- **Brand graphics**: the app's own `public/seat-airlines-logo.svg`, `plane-top.svg` and `seat-airlines-mark-pattern.svg`.
- **Advert creative**: "NIMBUS" cold brew, a fictional brand made for this film (`assets/advert/`).
- **Voice**: Piper TTS (MIT) with the `en-us-ryan-high` voice (rhasspy/piper, released for use with Piper).
- **Sound effects**: all synthesized with ffmpeg in this repo: chime (two sines, 1175 Hz then 880 Hz), cabin hum (brown noise, low-passed), whooshes (filtered pink noise), riser, sub impact, split-flap tick.
- **Fonts**: Montserrat and IBM Plex Mono (SIL OFL) via @fontsource, the same families the site loads.
- **Music**: none. Drop a licensed ~120 BPM track in `public/audio/music.*` (see README).
- Solana is named as text only ("Built on Solana"); no Solana logo is used.

## Launch intro, short and explainer

- **Picture**: drawn in code (React/Remotion), using the app's own logo (`public/seat-airlines-logo.svg`'s embedded badge, as `public/brand/seat-airlines-badge.png`), `plane-top.svg`, the seat-mark pattern and the real cabin layout (`src/content/cabin.ts`, `src/lib/seating.ts`).
- **Voice**: recorded by the client in ElevenLabs (`vo/intro/`, `vo/explainer/`); trimmed, paced and levelled by `vo/prep.py`.
- **Sound design**: every effect and bed synthesized in `sfx/` (oscillators, filtered noise, a Freeverb). No samples.
- **Wallet names** in the explainer are shown as text with plain initials; no wallet logos are used. The contract address on screen is blurred random characters, not a real address. "7xK2…9fQ" is the docs' own example.
