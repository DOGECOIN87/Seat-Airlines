#!/bin/sh
# Renders the code-drawn films in 4K: the launch intro, its short, and the looping explainer.
# Preps the VO (vo/prep.py), synthesizes the sound design (sfx/synth.mjs), renders each composition,
# then masters the audio (two-pass loudnorm to -14 LUFS / -1 dBTP, picture copied untouched).
# Usage: sh render-films.sh [Intro Short Explainer]   (default: all three)
set -e
cd "$(dirname "$0")"
BROWSER=${BROWSER:-$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)}
mkdir -p out
python3 vo/prep.py
node sfx/synth.mjs
for name in ${@:-Intro Short Explainer}; do
  slug=$(echo "$name" | tr 'A-Z' 'a-z')
  npx remotion render src/index.ts "$name-4K" "out/raw-$slug.mp4" --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k \
    ${BROWSER:+--browser-executable=$BROWSER} --concurrency=${CONCURRENCY:-4} --log=error
  m=$(ffmpeg -hide_banner -i "out/raw-$slug.mp4" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  get() { echo "$m" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -y -loglevel error -i "out/raw-$slug.mp4" -c:v copy -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" \
    -c:a aac -b:a 256k -movflags +faststart "out/seat-airlines-$slug-4k.mp4"
  rm "out/raw-$slug.mp4"
  # A 1080p copy for the web and for socials.
  ffmpeg -y -loglevel error -i "out/seat-airlines-$slug-4k.mp4" -vf scale=1920:1080:flags=lanczos -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart "out/seat-airlines-$slug-1080p.mp4"
  # A compact 4K (HEVC) for sharing; the H.264 master above plays everywhere.
  ffmpeg -y -loglevel error -i "out/seat-airlines-$slug-4k.mp4" -c:v libx265 -crf 23 -preset medium -tag:v hvc1 -pix_fmt yuv420p -x265-params log-level=error -c:a copy -movflags +faststart "out/seat-airlines-$slug-4k-hevc.mp4"
  ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of compact "out/seat-airlines-$slug-4k.mp4"
done
