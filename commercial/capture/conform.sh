#!/bin/sh
# Conforms the 15 fps captures to 30 fps clips for the edit.
# UI screens: each frame held twice (text stays crisp). 3D and game: frames blended.
cd "$(dirname "$0")/.."
R=capture/raw; C=public/clips
enc="-c:v libx264 -crf 13 -preset slow -pix_fmt yuv420p -g 15 -an"
ui() { [ -f $R/$1_take1.mp4 ] && ffmpeg -y -loglevel error -i $R/$1_take1.mp4 -vf "fps=30" $enc $C/$2.mp4 && echo "$2 (held)"; }
blend() { [ -f $R/$1_take1.mp4 ] && ffmpeg -y -loglevel error -i $R/$1_take1.mp4 -vf "framerate=fps=30:interp_start=0:interp_end=255" $enc $C/$2.mp4 && echo "$2 (blended)"; }
ui splash splash; ui hero hero; ui seats seats
blend advert advert; blend climb climb; blend game game; blend highscore highscore; blend altitudes altitudes
# The supplied intro: 21.0–25.5 s of the client's animation, no text, no audio.
[ -f assets/source/user-plane.mp4 ] && ffmpeg -y -loglevel error -ss 21.0 -t 4.6 -i assets/source/user-plane.mp4 -r 30 $enc $C/intro.mp4 && echo "intro"
