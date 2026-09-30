---
description: Outside, in a seat, on the flight deck, in the hold — and how to move between them.
---

# Views and controls

The site opens on a departure board in the middle of the screen, turning through a few of the airline's lines — _Hold more. Fly higher._ first, _Now boarding_ last — then fading onto the aircraft **full screen**. A tap or any key skips it. **Docs on GitBook** is under the board, and at the top right of the screen after it. **Enter** goes in. Every other view is a step inward from the one the page then opens on: **outside, on the whole aircraft**, right under the gate sign, whose **Claim a seat** button opens the seat map from anywhere on the page.

## Fly the plane

On the way in you can take the controls. Press **Fly** — or just press an arrow key — and the aircraft dives down to a few hundred metres over the hills while the camera swings round behind it. Your brief: **climb to 10,000 ft**.

**You need a Solana wallet connected to fly.** Until one is, the button reads **Connect & fly**: press it, approve the connection in your wallet, and it takes off — and your score can go straight on the leaderboard when you land. An arrow key with no wallet connected brings up the same card. With no wallet installed, the card says where to get one; on a phone it offers **Open in Phantom** and **Open in Solflare**, which reopen the page inside that wallet's own browser. Connecting shares your address and nothing else.

| With | Climb / dive | Turn |
| --- | --- | --- |
| Keyboard | **↑** / **↓** (or **W** / **S**) | **←** / **→** (or **A** / **D**) |
| Touch or mouse | drag up / down from where you pressed | drag left / right |

There is no clock. The altitude reads your height above the ground and the bar under **Climb to** fills as you go; **PULL UP** means the ground is close. **Enter** (or **Esc**) goes in at any point.

Along the foot of the screen are three instruments: **airspeed** (the red arc is the stall), the **attitude** indicator (the horizon moves behind the fixed yellow aircraft), and the **climb rate**, in thousands of feet a minute. Under them, **ENG 1** and **ENG 2** light green while they run. The ground goes by at the airspeed, so the lower you fly, the faster it rushes past.

### When it goes wrong

Somewhere on the way up an engine goes. Half the time it is at 10,000 ft; the rest, it is anywhere from 4,000 ft up — and you do not know which until it happens. Somebody shouts "FBI, open up!" and, on the bang, one engine explodes — or, one flight in three, a **bolt of lightning** comes down out of the cloud and hits it, with a crack of thunder and a blue-white flash. From then on:

* the aircraft yaws and rolls toward the dead engine, and keeps rolling unless you hold it;
* the controls go soft, and softer as the fire spreads — and about twenty seconds in, when the fire is at its worst, it starts on the wing: the roll toward the dead side grows until nobody can hold it;
* it cannot stay up. It sinks whatever you do, drag takes the speed off even with the wings level, and only the nose going down puts speed back. Pull up to stop the sink and it bleeds speed until it **STALL**s and drops like a stone. Every bank costs height too;
* the engine burns and trails black smoke, and the camera moves over its shoulder so you can see it.

On about a third of flights **the other engine goes too**, somewhere between 12 and 30 seconds later. With no thrust on either side the pull toward the dead engine goes — it is easier to hold level — but it sinks a great deal faster.

Once an engine has gone, look ahead for **rising air**. Thermals turn up every several seconds, most of a kilometre across: each is marked the way real ones are, by a cumulus cloud sitting on top of it, with a faint shimmer of heat and specks of dust rising under it. Steer under one and **UPDRAFT** lights over the instruments, the wind picks up, and a wing held level climbs again — most strongly in the middle — while the controls bite harder and the fire holds back. It lifts a banked wing hardly at all, so it is worth most to whoever is flying best. Each lasts about half a minute before it fades.

And keep an eye on the sky. On some flights **something else is out there**: a glowing saucer that blinks in far ahead, stops dead, and darts off at impossible speed — every turn a right angle — before shooting straight up and away, to eerie music. Now and then it comes for you instead. **DODGE!** — the world drops into slow motion as it streaks in, but your aeroplane keeps more than half its speed and answers the stick crisply: climb, dive or bank the wingtip out of its line and it goes past (**DODGED**, +2,500 — and a *wow*). Hold your course and it clips the wing: the outer wing tears off and tumbles away. **UFO STRIKE · WING DAMAGE** — and from then on the aeroplane rolls toward the short side unless you hold it. (`?ufo` shows it; `?ufohit` makes it hit.)

Left alone it is down in under twenty seconds; holding the nose up buys about half a minute; flown about as well as it can be, it lasts about a minute in still air, and a good deal longer riding the updrafts. The flight lasts until it meets the ground — and as it comes up, the cabin starts screaming, timed from your height, your sink rate and the hills ahead so the screaming stops on the impact. The way to fly it is the way pilots are taught — bank a little toward the good engine, keep the wings as level as the fire allows, and hold the speed just above the stall: nose down for it, never up. When it does meet the ground, it is **WASTED** — to one of three sounds, picked at random each time: the picture freezes and goes grey, then red as the word lands, with a slow dolly zoom. Either way you are taken into the site a few seconds later. Add `?mayday` to the address to have the engine go at 1,500 ft instead (`?strike` makes it lightning, `?dual` loses both).

### Sharing a flight

**Post** on the **WASTED** screen shares the flight to X, tagging @solana and @pumpdotfun. The card is made from the flight itself: the moment the engine went — the fireball, or the bolt — with your score, what happened and where.

* **On a phone**, Post opens your phone's share sheet with a short video: the card, then the departure board turning up **HOLD MORE / FLY HIGHER** and **NOW BOARDING**, then the logo. Choose X and it goes into a post, words and all. (Where the browser cannot make the video, the card goes as a picture.)
* **On a computer**, Post opens X with the post written and a link whose preview is the card, and saves the video beside it to drop into the post if you want it.

### Scoring and the leaderboard

The run is scored as you fly:

| | Points |
| --- | --- |
| Height, before the engine goes | a tenth of a point per foot of your best height |
| Getting to where the engine goes | 1,000 |
| Getting there fast | 40 for every second under 75 — in proportion when it goes early, so a fast climb pays the same by the foot |
| Each second in the air on one engine | 100 |
| … with the wings within 20° of level | × 1.5 |
| … with the ground under 500 ft | × 2 |
| … both | × 2.5 |

The score and its multiplier are under the altimeter; your best is kept in this browser. On the **WASTED** screen you can put the score on the **Top pilots** board with any Solana wallet (Phantom, Solflare, Backpack, Nightly): the wallet signs a short message naming the score — a message, not a transaction, so it moves nothing and approves nothing. Each wallet keeps its best. **Scores**, at the end of the landing's row of buttons, opens the board before you fly; once you are inside, **Scores** in the tab bar along the bottom of the screen opens the same board, with your best in this browser under it.

The server times every run from the moment you take the controls and refuses a score that time could not have earned, and each run can be posted once. That stops a made-up number; it cannot stop somebody patient enough to wait out the time their made-up number needs, so the board is for bragging rights, not prizes. `?mayday` runs are practice and are not posted.

## The views

| View | What you see |
| --- | --- |
| **Outside** | The whole aircraft in its livery, over the ground it is actually flying above. Drag to walk the camera around it. The corner reads **Souls on board** — how many holders are seated. |
| **Seat · forward** | The row ahead, the passengers in it, and your seat-back screen. |
| **Seat · look left / right** | Your head turned. What is beside you depends on your seat. |
| **Flight deck** | The cockpit in 3D, from the captain's seat: the real sky and ground through the windshield, the glareshield and autopilot panel, live flight, navigation and engine displays for both pilots, the overhead panel with the cabin signs lit, and the throttles. The yokes turn with the bank. Drag to look around. |
| **Cargo hold** | Below the floor, where everyone under the cutoff rides: a 3D room of frames and insulation, containers, netted bags and swinging work lamps. Drag to look around; the higher the flight, the more frost on the skin. |

## Getting around

* **Step inside** — on the view's own bar — takes you to a seat, looking forward.
* **Walk the aircraft**, under the view: **Outside**, **Flight Deck**, **First**, **Business**, **Exit Row**, **Economy**, **Cargo hold**.
* **Seat** — when you are in a seat, choose **Window**, **Middle** or **Aisle**.
* **← Look left**, **Forward**, **Look right →** turn your head.
* **Click any seat on the wall** to open it in a window — its advert on the left, whoever holds it on the right.
* When you check in and are seated, the camera walks you to your own seat on its own.

## The sections

The seat map, the section network, the cabin chat and check-in open from a **tab bar along the bottom of the screen** — **Seats**, **Network**, **Chat** and **Check in** — rather than further down the page, so the aircraft stays on the screen whichever one you are in. **Scores**, at the end of the bar, opens the high scores.

* **On a computer** a tab opens its section in a panel beside the view, and the view narrows to make room. Click the tab again, the **×**, or press **Esc** to close it and give the view its width back.
* **On a phone** a section rises over the page as a sheet. Tap outside it, the **×**, or its tab again to put it away.

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
