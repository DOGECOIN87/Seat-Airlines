#!/bin/sh
# Regenerates every VO line with Piper (stock synthetic voice en-us-ryan-high), then the intercom filter on line 1.
# Usage: sh vo/generate.sh   (PIPER_MODEL overrides the voice file)
cd "$(dirname "$0")/.."
M=${PIPER_MODEL:-/tmp/claude-0/tts/en-us-ryan-high.onnx}
say() { echo "$2" | piper -m "$M" --length-scale "$3" --noise-scale 0.333 --sentence-silence "$4" -f "vo/raw_$1.wav" 2>/dev/null; }
say 01 "Welcome aboard Seat Airlines." 0.92 0.12
say 02 "One plane. Everyone's in it. Your bag is your seat." 1.0 0.3
say 03 "Market cap is altitude." 0.95 0.2
say 04 "Seat, Airlines. Now boarding." 0.88 0.18
# Line 1: cabin PA — band-limited, a little saturation, a small room.
ffmpeg -y -loglevel error -i vo/raw_01.wav -af "highpass=f=300,lowpass=f=3400,atempo=1.06,asoftclip=type=tanh,volume=1.4,aecho=0.8:0.5:28|46:0.18|0.1,silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,aresample=48000" public/vo/01.wav
for n in 02 03 04; do T=1.0; [ $n = 04 ] && T=1.06;
  ffmpeg -y -loglevel error -i vo/raw_$n.wav -af "atempo=$T,highpass=f=70,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=80,silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,aresample=48000" public/vo/$n.wav
done
for f in public/vo/*.wav; do printf "%s %s\n" "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"; done
