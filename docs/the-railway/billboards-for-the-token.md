# Proposal: buy trackside ad space with the token

> Status: **proposal only.** Nothing in this repository takes payment. The billboards that ship today show the adverts seated holders already put on their seats (see [Every seat is a billboard](../the-wall/every-seat-is-a-billboard.md)), and house ads otherwise.

## The idea

The line is full of surfaces: billboards, station signs, the sides of the carriages, the destination display, bridges and tunnel portals. Each could be a placement that anyone can rent with the token, priced by how much it is seen.

| Placement | Seen | Suggested pricing |
| :-- | :-- | :-- |
| Trackside billboard | every few hundred metres, both sides | cheapest; rotates through a queue |
| Station nameboard | every ~2.6 km, three boards per station | mid |
| Carriage wrap | always, for as long as that carriage exists | priced by carriage number: carriage 14 only exists past $200M |
| Cab destination display | always, on the front of the train | most expensive; short slots |

Carriage wraps are the interesting one: **a placement on carriage _n_ only exists while the market cap is above that carriage's milestone.** Advertisers are buying into the token going up.

## How it could work

1. **Pay.** The advertiser sends the token to a treasury or burn address with a memo naming the placement and the slot length. Nothing is ever signed by the site on their behalf; the wallet shows them a plain transfer.
2. **Verify.** The Worker (which already verifies signed adverts) watches for the transfer, checks the amount against the price for that placement and duration, and records the booking.
3. **Moderate.** Image goes through the same checks the seat adverts already use (size, type, square or 2.24:1 crop) plus a review queue before going live.
4. **Show.** `RailWorld.setAdverts` already takes a map of images; it would take a second map of paid placements keyed by placement id.

## Open questions before building

- Burn, treasury, or split? Burning ties ad spend to holders' value; a treasury funds the project.
- Refunds if a carriage wrap disappears because the market falls below its milestone.
- Who moderates, and the takedown policy.
- Whether paid adverts should outrank seated holders' adverts on billboards, or have their own placements only.

This needs on-chain verification and a moderation path, so it is a separate piece of work from the scene change.
