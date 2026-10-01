# How the train shows the market cap

The aeroplane read the market as **altitude**. A train can't climb to 163,000 ft, so the railway reads the same numbers through the things a train *does* have: its length, the line it runs on, the world outside and the signals beside the track.

## What is built

| The market's… | …on the railway | Where it lives |
| :-- | :-- | :-- |
| **Market cap** | **Length of the train.** A carriage is coupled on at every 1-2-5 step from $10K: $10K, $20K, $50K, $100K, $200K, $500K, $1M … $200M, up to 14 carriages behind the cab. A carriage earned rolls up from behind and couples on; a carriage lost is uncoupled and left behind on the line. | `src/lib/consist.ts`, `src/three/RailWorld.ts` |
| **Market cap** | **The cab's destination display** reads the live figure, e.g. `$163K`, where a metro would show its route number. | `RailWorld.ts`, the cab's LED panel |
| **Market cap** | **Which world the line runs through**, on the airline's milestones: country under $1M, a viaduct above the clouds at $1M, a glowing guideway through space at $10M, the moon at $50M, Mars at $100M. | `RailWorld.ts`, `worldFor` |
| **Market cap** | **Station signs** along the line: "SEAT RAILWAY · $163K · next carriage $200K". | `RailWorld.ts`, stations |
| **Five-minute move** | **The grade.** Each stretch of line ahead is laid at the market's grade *as it is laid*, so the track behind the train is literally the chart: uphill on a rally, downhill on a dump. | `gradeFor`, the line's profile |
| **Five-minute move** | **Speed**, and the **signals** beside the line: green when rising, amber when flat, red when falling. | `trainSpeedFor`, signals |
| **Holders** | **Lit carriages**, front first: the share of the 178 seats that are booked. | `setOccupancy` |
| **Milestones, heard** | A **long-and-short horn** when a carriage is coupled on, and the **crossing bell** when one is uncoupled. | `src/lib/useAircraftAudio.ts` |
| **Seated holders' adverts** | **Trackside billboards** carry the holders' advert images, front seats first; empty boards show house ads. | `RailWorld.ts`, billboards |

The overlay on the Outside view prints the same reading in words: **Market cap · Carriages · Next at · 5m**.

## Ideas not built yet

- **Freight for the long tail.** Holders below the 178 seats ride in a freight wagon (the airline's cargo hold) whose load is heaped up as their combined share grows.
- **Milepost market caps.** Lineside mileposts showing the market cap when the train passed them, so the line keeps a readable history behind it.
- **Smoke, steam and sparks.** A heritage locomotive for small caps that turns into a high-speed set past $1M: the rolling stock itself upgrades with the market.
- **Tunnels on dumps.** A sharp drop sends the train into a tunnel; it comes out into daylight when the market recovers.
- **Departure board.** A split-flap board at each station listing the next milestones as "destinations", with "due" times from the current trend.
- **All-time high.** A ribboned, lit-up station ("ATH") is built where the train first passes a new all-time high, and stays on the line.
