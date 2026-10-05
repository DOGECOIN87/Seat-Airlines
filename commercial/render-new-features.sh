#!/bin/sh
# Renders "New on Seat Airlines" (1080x1350, 16.5 s, for X), loudness-normalised
# (-14 LUFS / -1 dBTP, video copied), and writes a contact sheet.
#   sh render-new-features.sh
# Needs the screenshots in public/features/ (see capture/features/): landing, picker,
# signin-1..3, tour1..4, site.
set -e
cd "$(dirname "$0")"
BROWSER=${BROWSER:-$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)}
mkdir -p out
npx remotion render src/index.ts NewFeatures out/raw-nf.mp4 --codec=h264 --crf=17 --audio-codec=aac \
  ${BROWSER:+--browser-executable=$BROWSER} --concurrency=${CONCURRENCY:-3} --log=error
m=$(ffmpeg -hide_banner -i out/raw-nf.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$m" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -loglevel error -i out/raw-nf.mp4 -c:v copy -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" \
  -c:a aac -b:a 192k out/seat-airlines-new-features.mp4
rm -f out/raw-nf.mp4
# One still per scene midpoint.
i=0; for t in 1.0 3.0 6.0 9.25 11.5 13.5 14.0 15.5; do
  ffmpeg -y -loglevel error -ss $t -i out/seat-airlines-new-features.mp4 -frames:v 1 -vf "scale=360:-2" out/_nf$i.png; i=$((i+1)); done
ffmpeg -y -loglevel error -i out/_nf%d.png -vf tile=8x1 -frames:v 1 out/contact-sheet-new-features.jpg && rm out/_nf*.png
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact out/seat-airlines-new-features.mp4
