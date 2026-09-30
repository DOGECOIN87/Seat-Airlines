#!/bin/sh
# Re-captures every scene in turn: sh capture/run-all.sh [scene ...]
# SA_GL=gpu renders on this machine's GPU (much faster); unset, SwiftShader.
cd "$(dirname "$0")/.."
for sc in ${@:-intro splash hero deck seats advert hold climb altitudes}; do
  echo "== $sc $(date +%T)"; node capture/scenes/$sc.mjs 2>&1 ; done
echo "ALL DONE $(date +%T)"
