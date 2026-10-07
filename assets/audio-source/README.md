# Audio source recordings

These are the original MP3s, kept outside `public/` so they are not downloaded or copied into the website build.

Run `python3 scripts/build-audio.py` with FFmpeg installed to regenerate `public/audio/` and `src/lib/audioSprite.json`. The generator always encodes from these originals; never re-encode an already optimized output.

The nine flight effects share a 64 kbps stereo MP3 sprite at 32 kHz. Its manifest records sample-derived offsets and durations, with 125 ms silent guards between clips. Web Audio plays and loops explicit clip regions, so simultaneous effects share the download without sharing a playback cursor. The content hash in the filename keeps the recording and its offsets together across deployments.

Cabin ambience stays separate (64 kbps stereo), as do the cabin chime (48 kbps mono) and announcements (40 kbps mono). Announcements still load one at a time, only during the pause before they are needed. MP3 keeps the existing codec support without an extra runtime audio library.

Run `npm run test:audio` for timing, seeking, loop, cancellation and retry regressions. The optimized recordings total 1,418,049 bytes versus 1,966,338 bytes for the originals (28% smaller); the nine effects require one request instead of nine.
