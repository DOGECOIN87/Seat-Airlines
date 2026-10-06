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
