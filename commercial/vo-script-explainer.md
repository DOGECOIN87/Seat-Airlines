# VO script: "How it works" explainer (4K, loops, ~60 s)

Same routine as the intro: one ElevenLabs file per line, named as below, dropped in `commercial/vo/explainer/`,
then `python3 vo/prep.py` (it preps both folders: trims, caps long pauses, speeds slow reads a touch,
levels). Same voice and settings as the intro so the two match.

The video loops: line `e00` opens it, `e09` closes it, and nothing is said across the seam, so it can play
on repeat on the site.

## Lines

| File | Chapter | Line (paste exactly) | Target | Delivery |
|---|---|---|---|---|
| `e00-how-it-works` | Title | `Here's how Seat Airlines works.` | ≤ 2.0 s | Friendly, inviting. The cabin crew about to do the safety demo. |
| `e01-token` | 1 · Get the token | `Step one: get the token. Its address is up top, marked C-A.` | ≤ 4.0 s | Clear and practical. |
| `e02-check-in` | 2 · Check in | `Step two: check in. Connect Phantom, Solflare, Backpack, or Nightly.` | ≤ 4.2 s | Even list, light lift on "Nightly". |
| `e03-your-seat` | 3 · Take your seat | `Step three: take your seat. You don't pick it... your holding does.` | ≤ 4.2 s | Small smile on the turn. |
| `e04-move-up` | 4 · Move up | `Out-hold the holder ahead of you... and you take their seat.` | ≤ 3.8 s | Competitive, a wink. |
| `e05-altitude` | 5 · Altitude | `Market cap is altitude. One million clears the clouds. A hundred million reaches Mars.` | ≤ 5.0 s | Builds; "Mars" lands. |
| `e06-billboard` | 6 · Billboard | `Every seat is a billboard. Put your image on it... and it moves with you.` | ≤ 4.4 s | Matter-of-fact, then pleased. |
| `e07-fly` | 7 · Fly | `Then fly. Arrow keys, or drag. Make ten thousand feet... and hold on.` | ≤ 4.4 s | Playful; tension on "hold on". |
| `e08-safety` | 8 · Safety | `And relax. Seat Airlines never asks your wallet to approve a transaction.` | ≤ 4.4 s | Calm, reassuring, a beat after "relax". |
| `e09-fly-higher` | Outro | `Hold more. Fly higher. Seat-airlines dot space.` | ≤ 3.4 s | The sign-off. |

**Pronunciation:** "C-A" should be read as the two letters. Spell it `C. A.` if the model says "ca".
"Seat-airlines dot space" is the web address: if it rushes, type `Seat Airlines... dot space.`

## Whole read, for a single take

```
Here's how Seat Airlines works.

Step one: get the token. Its address is up top, marked C-A.

Step two: check in. Connect Phantom, Solflare, Backpack, or Nightly.

Step three: take your seat. You don't pick it... your holding does.

Out-hold the holder ahead of you... and you take their seat.

Market cap is altitude. One million clears the clouds. A hundred million reaches Mars.

Every seat is a billboard. Put your image on it... and it moves with you.

Then fly. Arrow keys, or drag. Make ten thousand feet... and hold on.

And relax. Seat Airlines never asks your wallet to approve a transaction.

Hold more. Fly higher. Seat-airlines dot space.
```

## On screen (for reference)

HOW IT WORKS · 01 GET THE TOKEN (CA strip, Copy) · 02 CHECK IN (wallets, boarding pass) · 03 TAKE YOUR SEAT
(178 seats by rank, everyone else in the cargo hold) · 04 MOVE UP (seat change: "passed you") · 05 MARKET CAP IS
ALTITUDE (the five levels; the 5-minute move is pitch) · 06 EVERY SEAT IS A BILLBOARD · 07 FLY (arrows/drag,
10,000 ft, engine out) · 08 PLAIN-TEXT SIGNATURES ONLY · SEAT-AIRLINES.SPACE
