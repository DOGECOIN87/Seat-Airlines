> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Human actions required

1. Assign owners/approvers and replace all `[ASSIGN ...]` placeholders.
2. Enable main branch protection: required PR review/status checks, no force push/direct push where practical, conversation resolution, least-privilege permissions.
3. Configure CODEOWNERS with real teams/users and verify review enforcement.
4. Set production `X_TOKEN_ENCRYPTION_KEY` as a Cloudflare Worker secret; do not put it in `wrangler.toml`, GitHub variables, logs, or browser code.
5. Inventory GitHub Actions secrets/variables and Cloudflare secrets; CLI read was denied in this assessment.
6. Decide compatible remediation or time-bounded risk acceptance for all audit findings.
7. Verify deployed CORS, headers, health checks, rate limits, alert ownership, and log redaction.
8. Document and test D1/KV/R2/configuration backups and restoration in non-production.
9. Complete vendor security/privacy/contract reviews for Cloudflare, GitHub, RPC/Helius, wallets, X, GitBook, and analytics if enabled.
10. Approve retention/deletion periods, RTO/RPO, privacy notice, training cadence, incident contacts, and access-review frequency.
11. Select and coordinate an independent qualified CPA/service auditor; no audit conclusion is represented here.
