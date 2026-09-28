---
description: The split-flap board the site opens on — how it works and how to change what it says.
---

# The departure board

![](../.gitbook/assets/departure-board.png)

The site opens on a split-flap board in the middle of the screen, drawn after the mechanical ones in terminals: a split across the middle of every flap and a hinge pin at each end of it, painted in the site's own colours — navy flaps, white letters, and the site's blue along the top edge. Every character is a drum of flaps. Changing a phrase, each letter falls through the last few flaps before the one it wants, so you see the letters count up to it, and the columns land at different moments in a wave from left to right. It turns through four phrases, then fades onto the aeroplane, and the landing's own words rise in underneath it. Under the board are the airline's name and a **Docs on GitBook** link.

## What it says

The airline's line first and the call to board last, with two of the others between them, picked fresh on every visit — so anybody who comes back sees the rest in time.

| When | Top row | Bottom row |
| --- | --- | --- |
| First | HOLD MORE | FLY HIGHER |
| Two of | TAKE A | SEAT |
| | NETWORK | |
| | BUILD | |
| | RELAX | |
| | ADVERTISE | |
| | MOVE UP | |
| | TO THE | MOON |
| Last | NOW | BOARDING |

## Changing the words

The phrases are in `src/content/cabin.ts`, with the rest of the site's copy:

```ts
export const SPLASH_FIRST: readonly string[] = ['HOLD MORE', 'FLY HIGHER'];
export const SPLASH_BETWEEN: readonly (readonly string[])[] = [
  ['TAKE A', 'SEAT'],
  ['NETWORK'],
  // …
];
export const SPLASH_LAST: readonly string[] = ['NOW', 'BOARDING'];
```

* **Each phrase is the board's rows, top to bottom** — one line or two.
* **The board is as wide as the longest line of all of them**, so one long line shrinks every flap. Keep lines to **10 characters** or fewer to keep the letters big on a phone.
* **The drums carry** A–Z, 0–9 and `+ - / : ( ) % . , ! ? & $ '`. Lower case is shown in capitals, and any other character comes up blank.
* **How many go between** is `SPLASH_BETWEEN_COUNT` in `src/components/Landing.tsx`: two.

## How it behaves

| | |
| --- | --- |
| **On load** | It opens blank and boards the first phrase a moment after it comes into view. |
| **Each flap** | About 95 ms — slow enough to see it fold, with a shadow thrown on the half below — and each drum runs a little faster or slower than its neighbours, like real mechanisms. |
| **Each letter** | Falls through the last 3 to 7 flaps before its target, a different number for each, so a whole phrase lands in about a second. Columns start a beat apart, left to right. |
| **Between phrases** | 0.8 s once the first has landed, 0.55 s for each of the others. |
| **After the last** | It holds for 0.9 s — longer if the aeroplane behind it is still loading — then the splash fades out over 0.8 s: about eight and a half seconds in all. A tap or any key clears it straight away, and does nothing else; the docs link opens the docs. |
| **Off screen, or in a background tab** | It finishes the turn in progress and waits. Nothing new is queued until it can be seen. |
| **Reduced motion** | The phrases change on the same schedule, but the flaps do not turn — each phrase simply appears. On Android this is the **Remove animations** setting. |

The board's timings are constants at the top of `src/components/SplitFlapBoard.tsx`: `FLIP_MS`, `FLIPS_MIN` and `FLIPS_MAX`, `STAGGER_MS`, `JITTER_MS`, `SETTLE_MS` and `INTRO_MS`, with `HOLD_MS` as the default hold. The order of the flaps on each drum is `DRUM`. The component takes the holds from whoever uses it — `hold`, `firstHold` — and `loop={false}` stops it on its last phrase instead of starting again. The splash's own timings are at the top of `src/components/Landing.tsx`: `SPLASH_FIRST_HOLD`, `SPLASH_PHRASE_HOLD`, `SPLASH_HOLD`, `SPLASH_WAIT`, `SPLASH_GIVE_UP` and `SPLASH_FADE`.

## How it is built

* **One animation loop.** Like the instruments, the board animates off DOM refs through a single `requestAnimationFrame` loop that runs only while flaps are turning — no React render per flap, and no loop at all between phrases.
* **Sized from its own width.** Every measure — the flap, its letter, its hinge pins — comes from the board's width through CSS container units, so it scales as one object from a 320px phone to a wide screen, with no breakpoints.
* **The typeface** is PT Sans Narrow Bold, loaded with the site's other fonts in `index.html`.
* **The styles** are the _departure board_ block in `src/index.css`, and the colours are tokens at the top of it, on `.sa-board` — `--board-housing`, `--flap-upper`, `--flap-lower`, `--flap-ink` and the rest — so the palette changes in one place. The splash around it is the _splash_ block, with the landing's styles.
* **Accessibility.** The board is hidden from assistive technology, because words read out half a letter mid-turn would be worse than none; the landing under the splash says the same line in plain text.
