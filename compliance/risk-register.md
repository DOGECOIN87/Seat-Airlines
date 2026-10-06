> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Risk register

| ID | Risk | Severity | Likelihood | Treatment | Owner | Due/review | Evidence |
|---|---|---|---|---|---|---|---|
| R-001 | Dependency vulnerabilities in frontend/Worker toolchains | Closed | Medium | Upgraded/overridden; both audits report 0 vulnerabilities | Repository owner | 2026-10-06 | audit output/lockfiles |
| R-002 | Production branch unprotected | Closed | Medium | Enabled required CODEOWNER review, conversation resolution, no force push/deletion | Repository owner | 2026-10-06 | GitHub protection API |
| R-003 | OAuth encryption secret missing or mishandled | High | Low | Set secret, restrict access, rotate by approved process | [ASSIGN OWNER] | [SET DATE] | secret inventory/runbook |
| R-004 | RPC/indexer outage or stale authorization data | High | Medium | deny new protected access when unavailable; bounded cache and alerts | [ASSIGN OWNER] | [SET DATE] | outage tests/alerts |
| R-005 | D1/KV/R2 recovery not tested | High | Medium | document provider backup capabilities and non-prod restore | [ASSIGN OWNER] | [SET DATE] | restore record |
| R-006 | Vendor privacy/security terms not collected | Medium | Medium | vendor reviews and contract/attestation inventory | [ASSIGN OWNER] | [SET DATE] | vendor files |
