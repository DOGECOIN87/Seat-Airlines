> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Evidence index

This index records evidence that exists; placeholders are not evidence.

| Evidence ID | Control(s) | Artifact/command | Actual date/time | Result | Custodian | Retention | Status |
|---|---|---|---|---|---|---|---|
| E-BASELINE-001 | CC3–CC8 | `soc2-baseline.md` and local command output | 2026-10-06 [VERIFY TZ] | baseline recorded | [ASSIGN] | [SET] | draft |
| E-CI-001 | CC8 | `.github/workflows/security.yml` | [RECORD] | configuration exists; run unverified in GitHub | [ASSIGN] | [SET] | draft |
| E-CORS-001 | CC6.7 | Worker source and regression test result | [RECORD AFTER TEST] | [RECORD] | [ASSIGN] | [SET] | draft |
| E-OAUTH-001 | CC6.6/C1 | Worker source and secret inventory | [RECORD] | production secret unverified | [ASSIGN] | [SET] | draft |
| E-REPO-001 | CC8 | GitHub branch protection/API response | 2026-10-06 | main not protected; secrets API 403 | [ASSIGN] | [SET] | exception |
| E-TEST-X-001 | CC6.6/CC7 | `cd worker && npm run test:x` against synthetic local X/Worker | 2026-10-06 | 16 passed, 0 failed | [ASSIGN] | [SET] | draft |

Attach raw outputs only in an approved evidence repository; redact secrets and personal data.
