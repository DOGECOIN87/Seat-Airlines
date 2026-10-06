> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# System description

## Service
Seat Airlines is a browser-based React/Vite dApp deployed to GitHub Pages. A Cloudflare Worker provides API routes for adverts, holder data, sessions, directory/profile/messages, logbook, flight controls, scores, share cards, embedded-wallet relay, and optional X OAuth/posting.

## Components and boundaries
- **Browser/GitHub Pages:** public JavaScript bundle; must contain no secrets.
- **Cloudflare Worker:** server-side authorization, input validation, upstream calls, and response headers.
- **Cloudflare KV:** adverts, OAuth state/link records, and selected operational records.
- **Cloudflare R2:** optional public artwork storage.
- **Cloudflare D1:** sessions, profiles, messages, logbook, leaderboard, and seating cache.
- **GitHub/GitHub Actions:** source, workflow execution, Pages deployment, repository configuration.
- **External providers:** Solana/RPC/Helius, wallet providers, X, GitBook, and any enabled analytics.

## Trust boundaries
Untrusted browser input crosses into the Worker; Worker-to-provider calls cross external trust boundaries; deployment secrets cross GitHub/Cloudflare secret stores. Wallet signatures establish control of a wallet but do not by themselves authorize unrelated objects.

## Availability/degraded states
Worker up; authorization data unavailable; D1 unavailable; upstream RPC unavailable; and safe degraded mode where protected access is denied or existing known-good cached state is used within an approved bound.
