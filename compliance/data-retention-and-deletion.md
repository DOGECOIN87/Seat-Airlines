> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Data retention and deletion

| Data | Proposed period | Deletion/anonymization | Approval/status |
|---|---|---|---|
| Sessions/sign-in records | [SET PERIOD] | scheduled expiry cleanup | [APPROVE] |
| Messages/profiles | [SET PERIOD] | user request/admin workflow | [APPROVE] |
| Adverts/images/cards | [SET PERIOD] | owner takedown and storage cleanup | [APPROVE] |
| OAuth state | 10 minutes (code) | KV TTL/one-time delete | implemented; verify |
| OAuth links/tokens | [SET PERIOD] | disconnect/revocation and KV delete | [APPROVE] |
| Scores/logs/IP/metadata | [SET PERIOD] | aggregation/anonymization/delete | [APPROVE] |
| Backups | [SET PERIOD] | provider lifecycle policy | [VERIFY] |

Implement periodic cleanup for expired sessions and spent sign-in records; document cache invalidation bounds for public profile revocation.
