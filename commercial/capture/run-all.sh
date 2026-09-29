#!/bin/sh
# Re-captures every scene in turn: sh capture/run-all.sh [scene ...]
cd "$(dirname "$0")/.."
for sc in ${@:-splash hero seats advert climb game}; do
  echo "== $sc $(date +%T)"; node capture/scenes/$sc.mjs 2>&1 ; done
echo "ALL DONE $(date +%T)"
