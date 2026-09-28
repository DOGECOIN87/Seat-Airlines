---
description: Which wallets work, what connecting shares, and how to check in on a phone.
---

# Connecting a wallet

## Supported wallets

Seat Airlines talks directly to the wallets your browser puts into the page. These work:

* **Phantom**
* **Solflare**
* **Backpack**
* **Nightly**

Any other Solana wallet that registers itself with the page (the Wallet Standard) works too, and is listed by its own name.

**More than one installed?** **Connect wallet** asks which, showing each wallet's own name and icon. The one you pick signs everything after, and is the one reconnected next time.

On a computer, use the wallet's browser extension. **On a phone, open seat-airlines.space inside your wallet app's own browser** — for example, the browser tab in Phantom, Solflare, Backpack or Nightly. An ordinary mobile browser has no wallet in the page to connect to; with none installed, the page offers **Open in Phantom**, **Open in Solflare** and **Open in Backpack**, and a link to get Nightly.

## Checking in

1. Open **Check in** in the tab bar.
2. Press **Connect wallet**, pick your wallet if you have more than one, and approve the connection in it.
3. The card turns into your receipt: **Passenger** (your address, shortened), **Cabin**, **Holding** and **Share of supply**.

Your balance is merged into the seating the moment it is read, so you do not wait for the next refresh to see where you sit.

## Flying the plane

The game on the way in needs a connected wallet too: **Connect & fly** connects it and takes off. It is the same connection as checking in, so connect once and both are done. See [Views and controls](../the-cabin/views-and-controls.md#fly-the-plane).

## What connecting shares

Connecting gives the site your **public address**, which is already public on the chain. It does not sign anything, move anything, or grant the site any permission over your funds.

{% hint style="info" %}
A few features ask for a signature later, and every one is a plain-text message, never a transaction: putting an advert on your seat, taking it down, and signing in to the cabin directory. [Wallet safety](../safety/wallet-safety.md) shows each message in full.
{% endhint %}

## Coming back

If you have connected before and your wallet trusts the site, you are checked in again automatically when the page opens. **Sign out** on the check-in card disconnects the wallet from the page.

## Troubleshooting

| You see | What it means |
| --- | --- |
| _No wallet extension detected_ | The page cannot find a wallet. Install one, or on a phone open the site in your wallet app's browser. |
| _No Solana wallet found…_ | Same cause, after pressing the button. |
| You closed the wallet prompt | Nothing happens and nothing is reported — declining is a choice, not an error. Press the button again when you are ready. |
| Holding reads **unread** | Your balance could not be read yet. It is retried every two minutes; reloading the page tries at once. |
