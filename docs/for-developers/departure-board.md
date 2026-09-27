---
description: The split-flap board the site opens on — how it works and how to change what it says.
---

# The departure board

![](../.gitbook/assets/departure-board.png)

The site opens on a split-flap board in the middle of the screen, drawn after the mechanical ones in terminals: a split across the middle of every flap and a hinge pin at each end of it, painted in the site's own colours — navy flaps, white letters, and the site's blue along the top edge. Every character is a drum of flaps. As the board boards its line, each letter falls through the last few flaps before the one it wants, so you see the letters count up to it, and the columns land at different moments in a wave from left to right. Then it holds a moment and fades onto the aeroplane, and the landing's own words rise in underneath it.

## What it says

| Top row | Bottom row |
| --- | --- |
| HOLD MORE | FLY HIGHER |

## Changing the words

The line is `SPLASH_LINE` in `src/content/cabin.ts`, with the rest of the site's copy:

```ts
export const SPLASH_LINE: readonly string[] = ['HOLD MORE', 'FLY HIGHER'];
```

* **Each entry is one of the board's rows, top to bottom** — one line or two.
* **The board is as wide as the longer row**, so a long row shrinks every flap. Keep rows to **10 characters** or fewer to keep the letters big on a phone.
* **The drums carry** A–Z, 0–9 and `+ - / : ( ) % . , ! ? & $ '`. Lower case is shown in capitals, and any other character comes up blank.

The component itself, `SplitFlapBoard`, can still turn through a list of phrases, holding each one and starting again: give it more than one and it will. The splash gives it one, and goes once that has landed.

## How it behaves

| | |
| --- | --- |
| **On load** | It opens blank and boards the line a moment after it comes into view. |
| **Each flap** | About 120 ms — slow enough to see it fold, with a shadow thrown on the half below — and each drum runs a little faster or slower than its neighbours, like real mechanisms. |
| **Each letter** | Falls through the last 4 to 9 flaps before its target, a different number for each, so a whole word lands in about a second and a half. Columns start a beat apart, left to right. |
| **Once it has landed** | The line holds for about a second — longer if the aeroplane behind it is still loading, up to six seconds from the start — then the splash fades out over 0.8 s. A tap or any key clears it straight away, and does nothing else. |
| **Between phrases** | When it is given more than one: 4 seconds once the last flap has landed — 8 for the first. |
| **Off screen, or in a background tab** | It finishes the turn in progress and waits. Nothing new is queued until it can be seen. |
| **Reduced motion** | The words change on the same schedule, but the flaps do not turn — each phrase simply appears. On Android this is the **Remove animations** setting. |

The board's timings are constants at the top of `src/components/SplitFlapBoard.tsx`: `FLIP_MS`, `FLIPS_MIN` and `FLIPS_MAX`, `HOLD_MS`, `HOME_HOLD_MS`, `STAGGER_MS`, `JITTER_MS`, `SETTLE_MS` and `INTRO_MS`. The order of the flaps on each drum is `DRUM`. The splash's are at the top of `src/components/Landing.tsx`: `SPLASH_HOLD`, `SPLASH_WAIT`, `SPLASH_GIVE_UP` and `SPLASH_FADE`.

## How it is built

* **One animation loop.** Like the instruments, the board animates off DOM refs through a single `requestAnimationFrame` loop that runs only while flaps are turning — no React render per flap, and no loop at all between phrases.
* **Sized from its own width.** Every measure — the flap, its letter, its hinge pins — comes from the board's width through CSS container units, so it scales as one object from a 320px phone to a wide screen, with no breakpoints.
* **The typeface** is PT Sans Narrow Bold, loaded with the site's other fonts in `index.html`.
* **The styles** are the _departure board_ block in `src/index.css`, and the colours are tokens at the top of it, on `.sa-board` — `--board-housing`, `--flap-upper`, `--flap-lower`, `--flap-ink` and the rest — so the palette changes in one place. The splash around it is the _splash_ block, with the landing's styles.
* **Accessibility.** The board is hidden from assistive technology, because words read out half a letter mid-turn would be worse than none; the landing under the splash says the same line in plain text.
