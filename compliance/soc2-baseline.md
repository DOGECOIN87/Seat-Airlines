> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# SOC 2 readiness baseline

**Assessment date:** 2026-10-06 (recorded from this sandbox run)
**Repository:** `DOGECOIN87/Seat-Airlines`, public, default branch `main`

## Scope observed
React/Vite frontend on GitHub Pages; Cloudflare Worker using KV, R2, and D1; GitHub Actions; Solana/RPC and Helius; wallet providers; X OAuth/API; GitBook; optional analytics and other providers.

## Baseline commands and results

| Area | Command | Result | Evidence/exception |
|---|---|---|---|
| Frontend typecheck | `npm run typecheck` | PASS | Run locally; exact timestamp above |
| Frontend build | `npm run build` | PASS | Vite production build completed |
| Frontend tests | `npm test` | PASS | Existing suites passed |
| Frontend audit | `npm run audit:frontend` | PASS | Script reports documented upstream exception through 2027-01-31 |
| Frontend dependencies | `npm audit --audit-level=high` | FAIL / 5 findings | 1 high `source-map-js`; 4 moderate including transitive `uuid`; remediation or risk acceptance required |
| Worker typecheck | `cd worker && npm run typecheck` | PASS | Run locally |
| Worker tests | `cd worker && npm test` | PASS | Existing Worker suites passed |
| Worker dependencies | `cd worker && npm audit --audit-level=high` | FAIL / 3 high findings | `sharp` via `wrangler`/`miniflare`; `npm audit fix --force` indicates breaking change; owner decision required |
| Worker X E2E | `cd worker && npm run test:x` with synthetic local Worker/X | PASS | 16 passed, 0 failed; no production credentials or data used |
| Secret scan | `git grep` credential-pattern scan | PASS with review note | No private-key/provider-token literal found; placeholders and public configuration reviewed |
| Repository settings | `gh repo view`; branch protection API | GAP | Public repo; main branch reported “Branch not protected”; secrets/variables API returned 403 and are unverified |

## Initial findings
1. **Fixed in this change:** Worker CORS previously fell back to wildcard/echo behavior when the allowlist was empty. It now emits `Access-Control-Allow-Origin` only for an explicit match.
2. **Fixed in this change:** X OAuth token encryption was derived from the browser-held handle. It now requires the server-held `X_TOKEN_ENCRYPTION_KEY` secret.
3. **Remaining:** dependency vulnerabilities need compatible upgrades or time-bounded risk acceptance.
4. **Remaining:** branch protection, CODEOWNERS assignment, GitHub secret/variable inventory, Cloudflare backup evidence, access reviews, vendor contracts, and auditor selection require human/provider action.
5. **Remaining:** the production Worker secret must be set with `wrangler secret put X_TOKEN_ENCRYPTION_KEY`; the local test value is not for production.

## System boundary and data inventory
See `system-description.md`, `data-classification-and-handling.md`, and `vendor-and-subprocessor-management.md`.

## Baseline limitations
This run did not access production credentials, Cloudflare dashboards, private GitHub Actions secret values, D1/KV/R2 production data, or audit evidence. No test result here proves production configuration.
