> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Risk register

| ID | Risk | Severity | Likelihood | Treatment | Owner | Due/review | Evidence |
|---|---|---|---|---|---|---|---|
| R-001 | Dependency vulnerabilities in frontend/Worker toolchains | High | Medium | Upgrade compatibly or accept with compensating controls | [ASSIGN OWNER] | [SET DATE] | audit output/advisory |
| R-002 | Production branch unprotected | High | Medium | Enable required reviews/checks and no force push | [ASSIGN OWNER] | [SET DATE] | GitHub settings screenshot/API |
| R-003 | OAuth encryption secret missing or mishandled | High | Low | Set secret, restrict access, rotate by approved process | [ASSIGN OWNER] | [SET DATE] | secret inventory/runbook |
| R-004 | RPC/indexer outage or stale authorization data | High | Medium | deny new protected access when unavailable; bounded cache and alerts | [ASSIGN OWNER] | [SET DATE] | outage tests/alerts |
| R-005 | D1/KV/R2 recovery not tested | High | Medium | document provider backup capabilities and non-prod restore | [ASSIGN OWNER] | [SET DATE] | restore record |
| R-006 | Vendor privacy/security terms not collected | Medium | Medium | vendor reviews and contract/attestation inventory | [ASSIGN OWNER] | [SET DATE] | vendor files |
