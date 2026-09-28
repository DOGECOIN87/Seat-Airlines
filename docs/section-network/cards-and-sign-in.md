---
description: Sign in once a day, publish your card, and control what the cabin sees.
---

# Cards and sign-in

## Sign in once

Everything in the directory is behind one sign-in, so you are not asked to sign every time you read or send something.

1. Check in with your wallet — see [Connecting a wallet](../getting-started/connecting-a-wallet.md).
2. In the **Network** tab, press **Sign in**.
3. Your wallet shows this message. Approve it:

```
SEAT AIRLINES
Sign in to the cabin directory.

This lets you publish your card, read your section, and send and
receive introductions for one day. It authorises no transaction.

wallet: <your address>
issued: <the time you pressed the button>
```

That opens a session for **24 hours**. The directory is a room for holders: it opens only to a wallet that **holds the token**, and the session keeps working only while it still does.

**Sign out** ends the session straight away. Switching to a different wallet ends it too.

## Publish your card

You need a seat to publish a card. Press **Publish a card** (or **Edit card**), fill in what you want the cabin to see, and press **Publish card**.

| Field | Up to | Who sees it |
| --- | --- | --- |
| **Name or company** | 80 characters | Every signed-in holder |
| **Role** | 120 characters | Every signed-in holder |
| **Email** | 254 characters | Your section and every section ahead of you |
| **Website** | 300 characters | Your section and every section ahead of you |
| **LinkedIn** | 300 characters | Your section and every section ahead of you |
| **X, Telegram, Discord, Linktree, Instagram, TikTok, YouTube, GitHub** | One account each | Your section and every section ahead of you |

Every field is optional. Website and LinkedIn must start with `http://` or `https://`.

For the social accounts, type your handle, `@handle`, or paste the link from your profile — all three are kept as the handle, and the card links to that network's page for it. Discord takes a username (shown as text, since Discord has no profile pages) or an invite link (`discord.gg/…`). An account that is not one on that network — a link to another site, a handle the network would not allow — is refused, and the card says which.

{% hint style="info" %}
**Your contact details are read by the rows ahead of you, never by the ones behind.** An email you publish from Business is readable by Business, First and the flight deck — and not by the Exit Row or Economy.
{% endhint %}

## Your card follows your wallet

A card is stored against your wallet, not your browser or your seat. It is there on any device you sign in from, and it moves up and down the aircraft with you — as your seat changes, so does who can read your contact details. If you are out-held and lose your seat, you can still sign in and read introductions sent to you.

## Reading other cards

The roster lists every seated holder with their cabin and seat. Select one to open their card. Where your seat does not reach, you see their name and role, and their contact details are withheld.

A holder who has not published a card is listed as _Holder_ and the first four characters of their address, with their cabin's default role — _Flight operations_, _Business development_, _Partnerships_, _Campaigns & growth_ or _Community_. Until you sign in, every card reads _Sign in to see contact details._
