> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Data classification and handling

| Category | Examples | Class | Handling |
|---|---|---|---|
| Public | wallet addresses, public adverts, published cards | Public | minimize, integrity-check, safe caching |
| Personal | email, websites, social links, IP, messages | Confidential | server authorization, no sensitive logs, retention/deletion |
| Credential | bearer sessions, OAuth access/refresh tokens | Restricted | hash sessions, encrypt OAuth tokens, never return/log |
| Operational | scores, health, deployment metadata | Internal | access-controlled, minimize and retain by policy |

Production data is excluded from tests unless separately approved and protected.
