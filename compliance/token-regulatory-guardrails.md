> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Token regulatory guardrails

**This is not legal advice.** It summarises the position as of 11 October 2026 so that product and copy changes do not drift into regulated territory. Confirm with a Texas securities lawyer before relying on it (see `human-actions-required.md`).

## How the site is structured today

- The team bought $SEAT at launch; those tokens are locked on Jupiter Lock (`LOCK_URL` in `src/lib/social.ts`). The team may hold more in its own wallets (the operator's `ADMIN_WALLET` is seated when it holds the token). The terms, the FAQ, `llms.txt`, the landing screen, the contract bar, the tour's How to buy page and the token docs all disclose this.
- The project shares no creator fees, revenue or other money with holders. Seats, adverts and the cabin directory are site features, not financial rights.
- The leaderboard has no prizes.
- Governing law in the terms is Texas, USA.

## Federal position

- **SEC staff statement on meme coins (27 February 2025).** Division of Corporation Finance staff said typical memecoins, bought for entertainment or culture with no promise of profit from others' efforts, are not securities under *Howey*. Staff views only: not binding, and fraud is still actionable by other agencies.
- **SEC/CFTC interpretive release (17 March 2026).** Sorts crypto assets into a five-category taxonomy; memecoins and digital collectibles fall in a category generally treated as not securities. It is interpretation, not statute, and does not bind courts. Risk rises with profit sharing, promises of profit from the team's work, or a roadmap tied to price.
- **CLARITY Act.** Failed Senate cloture 49–50 on 15 September 2026. There is no federal market-structure statute, so the analysis above remains case by case.
- **FTC Act section 5.** A promoter with a material connection to what it promotes (here, the team's holdings) must disclose it clearly and close to the promotion. The FTC Endorsement Guides (16 CFR Part 255) set out how.

## Texas position

- **Texas Securities Act.** The State Securities Board enforces it against crypto investment programs, including emergency cease-and-desist orders (for example the TEXITcoin emergency order, February 2026). A federal "not a security" view does not stop a state action.
- **Fraud and the Texas DTPA.** False or misleading statements about a token are actionable whatever its securities status.
- **Lottery law.** An illegal lottery needs prize, consideration and chance. The game has chance and a token-gated mode (arguably consideration); keeping prizes out keeps it outside the definition.

## Guardrails checklist

Anyone changing the product, the copy, the docs or the social posts should check each line before shipping:

- [ ] **No fee or revenue sharing, and no holder payouts** of any kind: creator fees, buybacks credited to holders, dividends, "rewards" for holding, or copy that implies any of these (radio chatter and splash lines included).
- [ ] **No profit or price promises.** No "to the moon", price targets, "number go up", or roadmap items framed as raising the price. The market cap drives the altitude as a display; describe it as one, not as a goal.
- [ ] **No prizes for the game** or the leaderboard: no tokens, SOL, merchandise, whitelist spots or seat upgrades for a score.
- [ ] **Team-holdings disclosure next to every buy link** (pump.fun, DexScreener, swap instructions), linking the Jupiter Lock, not only in the terms.
- [ ] **No paid promotion without disclosure.** Paid influencers, KOLs and boosts must say they are paid; the team must say it holds the token whenever it promotes it.
- [ ] **Legal review first** before adding rewards, airdrops, staking, fee sharing, raffles, giveaways or anything else that gives holders money or a prize.
- [ ] Keep the terms' statement that holding $SEAT gives no share of fees, revenue or profits, and no claim on Seat Airlines, accurate and unchanged unless a lawyer approves.

## Sources

Checked in October 2026. Re-check them before relying on any line above, and have a lawyer confirm the reading.

- SEC Division of Corporation Finance, [Staff Statement on Meme Coins](https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins) (27 February 2025).
- Orrick, [SEC Issues Interpretive Guidance on Crypto Asset Classification](https://www.orrick.com/en/Insights/2026/04/SEC-Issues-Interpretive-Guidance-on-Crypto-Asset-Classification), and Sullivan & Cromwell, [SEC and CFTC Issue Interpretation Regarding the Application of Federal Securities Laws to Crypto Assets](https://www.sullcrom.com/insights/memo/2026/March/SEC-Clarifies-Application-Securities-Laws-Crypto-Assets) (17 March 2026 release).
- Orrick, [The CLARITY Act Stalls in the Senate](https://www.orrick.com/en/Insights/2026/10/The-CLARITY-Act-Stalls-in-the-Senate-Whats-Next-for-Digital-Asset-Regulation) (cloture vote of 15 September 2026).
- Texas State Securities Board, [Cryptocurrency scams](https://www.ssb.texas.gov/cryptocurrency-scams), and Dallas Morning News, [TEXITcoin cease-and-desist order](https://www.dallasnews.com/business/2026/02/19/d-fw-based-texitcoin-creator-accused-of-fraud-hit-with-cease-and-desist-order-by-texas/) (February 2026).
- FTC, [Guides Concerning the Use of Endorsements and Testimonials in Advertising](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255) (16 CFR Part 255).
- Texas Attorney General, [Texas Data Privacy and Security Act](https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act).
