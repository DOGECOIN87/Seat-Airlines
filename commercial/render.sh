#!/bin/sh
# Renders both cuts, normalises loudness (two-pass, -14 LUFS / -1 dBTP, video copied) and writes the contact sheet.
set -e
cd "$(dirname "$0")"
BROWSER=${BROWSER:-$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)}
mkdir -p out
for v in A B; do
  npx remotion render src/index.ts SeatAirlines-$v out/raw-$v.mp4 --codec=h264 --crf=16 --audio-codec=aac \
    ${BROWSER:+--browser-executable=$BROWSER} --concurrency=${CONCURRENCY:-2} --log=error
  m=$(ffmpeg -hide_banner -i out/raw-$v.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  get() { echo "$m" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -y -loglevel error -i out/raw-$v.mp4 -c:v copy -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" -c:a aac -b:a 192k out/seat-airlines-commercial-$v.mp4
  rm out/raw-$v.mp4
done
# One still per scene midpoint of cut A.
i=0; for t in 2.25 5.25 6.5 7.5 8.5 9.75 11.0 12.5 14.25; do
  ffmpeg -y -loglevel error -ss $t -i out/seat-airlines-commercial-A.mp4 -frames:v 1 -vf "scale=640:-2,drawtext=text='$t s':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6" out/_cs$i.png; i=$((i+1)); done
ffmpeg -y -loglevel error -i out/_cs%d.png -vf tile=3x3 -frames:v 1 out/contact-sheet-A.jpg && rm out/_cs*.png
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact out/seat-airlines-commercial-A.mp4
