> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Human actions required

1. Assign owners/approvers and replace all `[ASSIGN ...]` placeholders.
2. **Completed:** main branch protection now requires one CODEOWNER review, dismisses stale reviews, requires conversation resolution, and blocks force pushes/deletions. Add required CI check contexts after the first successful GitHub security run.
3. **Completed:** CODEOWNERS is assigned to `@DOGECOIN87`; verify a real pull request is blocked until the required review is present.
4. Set production `X_TOKEN_ENCRYPTION_KEY` as a Cloudflare Worker secret; do not put it in `wrangler.toml`, GitHub variables, logs, or browser code.
5. Inventory GitHub Actions secrets/variables and Cloudflare secrets; CLI read was denied in this assessment.
6. **Completed locally:** frontend and Worker audits report 0 vulnerabilities after dependency upgrades/overrides. Confirm the same result in GitHub Actions.
7. Verify deployed CORS, headers, health checks, rate limits, alert ownership, and log redaction.
8. Document and test D1/KV/R2/configuration backups and restoration in non-production.
9. Complete vendor security/privacy/contract reviews for Cloudflare, GitHub, RPC/Helius, wallets, X, GitBook, and analytics if enabled.
10. Approve retention/deletion periods, RTO/RPO, privacy notice, training cadence, incident contacts, and access-review frequency.
11. Select and coordinate an independent qualified CPA/service auditor; no audit conclusion is represented here.
12. Serve the security headers: GitHub Pages ignores `public/_headers`, so proxy `seat-airlines.space` through Cloudflare and copy each header into a Response Header Transform Rule (steps in `docs/for-developers/deploying.md`, "Security headers"), or move the page to Cloudflare Pages. Verify with `curl -sI https://seat-airlines.space/` and record the output as evidence. Until then only the referrer policy (a `<meta>` in `index.html`) is live.
13. The contact email `mattrickbeats@gmail.com` is now public on the legal pages. Make sure it is monitored, and that privacy requests sent to it are answered within 45 days. Keep `@SEATAIRLINES` on X as the secondary contact. Set up nothing else unless it is needed.
14. Book a consult with a Texas securities lawyer to confirm the token and site structure, and do so before adding any rewards, airdrops, fee sharing, staking or prizes. See `compliance/token-regulatory-guardrails.md`.
15. **Licence the workspace library.** `@danfessler/trellis` and `@danfessler/trellis-react`, which draw the flight workspace, are free for non-commercial use only. A token-linked site is very likely commercial, so it needs the author's commercial licence (an active GitHub Sponsors tier at github.com/sponsors/danfessler for 10 or fewer developers). Keep the receipt as evidence, or replace the library.
16. Optional: set a dedicated `IP_HASH_KEY` Worker secret (`npx wrangler secret put IP_HASH_KEY`, any long random string). Until then the flight cap keys its IP hashes with the X token key, under its own label.
17. The operator logbook (`/logbook`) is disclosed on the privacy page. Include it when answering a privacy request, and delete notes about a person who asks.
