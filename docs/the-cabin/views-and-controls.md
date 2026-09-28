---
description: Outside, in a seat, on the flight deck, in the hold — and how to move between them.
---

# Views and controls

The site opens on a departure board in the middle of the screen, turning through a few of the airline's lines — _Hold more. Fly higher._ first, _Now boarding_ last — then fading onto the aircraft **full screen**. A tap or any key skips it. **Docs on GitBook** is under the board, and at the top right of the screen after it. **Enter** goes in. Every other view is a step inward from the one the page then opens on: **outside, on the whole aircraft**, right under the gate sign, whose **Claim a seat** button opens the seat map from anywhere on the page.

## Fly the plane

On the way in you can take the controls. Press **Fly the plane** — or just press an arrow key — and the aircraft dives down to a few hundred metres over the hills while the camera swings round behind it. Your brief: **climb to 10,000 ft**.

**You need a Solana wallet connected to fly.** Until one is, the button reads **Connect wallet to fly**: press it, approve the connection in your wallet, and it takes off — and your score can go straight on the leaderboard when you land. An arrow key with no wallet connected brings up the same card. With no wallet installed, the card says where to get one; on a phone it offers **Open in Phantom** and **Open in Solflare**, which reopen the page inside that wallet's own browser. Connecting shares your address and nothing else. Once connected, the line under the buttons says which wallet you are flying as.

| With | Climb / dive | Turn |
| --- | --- | --- |
| Keyboard | **↑** / **↓** (or **W** / **S**) | **←** / **→** (or **A** / **D**) |
| Touch or mouse | drag up / down from where you pressed | drag left / right |

There is no clock. The altitude reads your height above the ground and the bar under **Climb to** fills as you go; **PULL UP** means the ground is close. **Enter** (or **Esc**) goes in at any point.

### At 10,000 ft

Somebody shouts "FBI, open up!" and, on the bang, one engine explodes. From then on:

* the aircraft yaws and rolls toward the dead engine, and keeps rolling unless you hold it;
* the controls go soft, and softer as the fire spreads — and about twenty seconds in, when the fire is at its worst, it starts on the wing: the roll toward the dead side grows until nobody can hold it;
* it cannot stay up. It sinks whatever you do, drag takes the speed off even with the wings level, and only the nose going down puts speed back. Pull up to stop the sink and it bleeds speed until it **STALL**s and drops like a stone. Every bank costs height too;
* the engine burns and trails black smoke, and the camera moves over its shoulder so you can see it.

Left alone it is down in under twenty seconds; holding the nose up buys about half a minute; flown about as well as it can be, it lasts about a minute. The flight lasts until it meets the ground — and as it comes up, the cabin starts screaming, timed from your height, your sink rate and the hills ahead so the screaming stops on the impact. The way to fly it is the way pilots are taught — bank a little toward the good engine, keep the wings as level as the fire allows, and hold the speed just above the stall: nose down for it, never up. When it does meet the ground, it is **WASTED**: the picture freezes and goes grey, then red as the word lands, with a slow dolly zoom. Either way you are taken into the site a few seconds later. Add `?mayday` to the address to have the engine go at 1,500 ft instead.

### Scoring and the leaderboard

The run is scored as you fly:

| | Points |
| --- | --- |
| Height, before the engine goes | a tenth of a point per foot of your best height |
| Reaching 10,000 ft | 1,000 |
| Getting there fast | 40 for every second under 75 |
| Each second in the air on one engine | 100 |
| … with the wings within 20° of level | × 1.5 |
| … with the ground under 500 ft | × 2 |
| … both | × 2.5 |

The score and its multiplier are under the altimeter; your best is kept in this browser. On the **WASTED** screen you can put the score on the **Top pilots** board with any Solana wallet (Phantom, Solflare, Backpack): the wallet signs a short message naming the score — a message, not a transaction, so it moves nothing and approves nothing. Each wallet keeps its best. Once you are inside, **Scores** in the tab bar along the bottom of the screen opens the **Top pilots** board again, with your best in this browser under it.

The server times every run from the moment you take the controls and refuses a score that time could not have earned, and each run can be posted once. That stops a made-up number; it cannot stop somebody patient enough to wait out the time their made-up number needs, so the board is for bragging rights, not prizes. `?mayday` runs are practice and are not posted.

## The views

| View | What you see |
| --- | --- |
| **Outside** | The whole aircraft in its livery, over the ground it is actually flying above. Drag to walk the camera around it. The corner reads **Souls on board** — how many holders are seated. |
| **Seat · forward** | The row ahead, the passengers in it, and your seat-back screen. |
| **Seat · look left / right** | Your head turned. What is beside you depends on your seat. |
| **Flight deck** | The cockpit: overhead panel, autopilot panel, primary flight display and navigation display. |
| **Cargo hold** | Below the floor, where everyone under the cutoff rides. |

## Getting around

* **Step inside** — on the view's own bar — takes you to a seat, looking forward.
* **Walk the aircraft**, under the view: **Outside**, **Flight Deck**, **First**, **Business**, **Exit Row**, **Economy**, **Cargo hold**.
* **Seat** — when you are in a seat, choose **Window**, **Middle** or **Aisle**.
* **← Look left**, **Forward**, **Look right →** turn your head.
* **Click any seat on the wall** to open it in a window — its advert on the left, whoever holds it on the right — and press **Look from this seat** to put the camera in it. Looking from any seat is free.
* When you check in and are seated, the camera walks you to your own seat on its own.

## The sections

The seat map, the section network, the cabin chat and check-in open from a **tab bar along the bottom of the screen** — **Seats**, **Network**, **Chat** and **Check in** — rather than further down the page, so the aircraft stays on the screen whichever one you are in. **Scores**, at the end of the bar, opens the high scores.

* **On a computer** a tab opens its section in a panel beside the view, and the view narrows to make room. Click the tab again, the **×**, or press **Esc** to close it and give the view its width back.
* **On a phone** a section rises over the page as a sheet. Tap outside it, the **×**, or its tab again to put it away. **Look from this seat**, in a seat's window, closes the sheet so you can see the view from it.

Windows — a seat, the high scores, the advert editor — open over the page with the page frosted behind them. **Esc**, the **×** or a click on the frost closes one, and leaves the section under it open.

**Seats** opens on the seat map itself; how seating works is underneath it. The old links — `#wall`, `#network`, `#chat` and `#check-in` — open the matching section.

### Turning your head depends on your seat

From **8A** the window is one turn to the left and fills the view. From **8F** that same window is on the far side of the cabin — two seats, the aisle, three more seats, and a porthole the size of a coin. From **8C** you look past 8B's shoulder to see any of it. The row is modelled as it really is — window, seats, aisle, seats, window — and read outward from wherever you sit.

## Zoom and pan

Every view zooms from 1× to 4×.

| With | Zoom | Pan |
| --- | --- | --- |
| Buttons | **−** and **+**; **Reset** returns to 1× | — |
| Trackpad or mouse | pinch, or **Ctrl** (**⌘** on a Mac) + scroll | drag, once zoomed in |
| Touch | pinch with two fingers | drag with one finger, once zoomed in |
| Keyboard | **+** and **−**; **0** resets | arrow keys |

A plain scroll without Ctrl scrolls the page, not the view. **Zooming out past 1×** from any inside view takes you back outside.

**Full screen** fills your screen with the view; **Esc** leaves it.

## Sound

Sound is **on by default**: the cabin ambience, the seat-belt chime and the crew announcements start with your first click, tap or key press (browsers allow no sound before that). **Sound on / Sound off**, on the view's control bar, switches it, and the page remembers your choice. See [The overhead panel and the PA](../how-it-flies/overhead-panel.md#sound).

{% hint style="info" %}
The drawn views are pictures, so screen readers skip them. Every value they show is also published as text — in the overhead panel and the readouts under the view — and the seat map's seats are real buttons.
{% endhint %}
