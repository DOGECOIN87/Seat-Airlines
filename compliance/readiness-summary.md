> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# SOC 2 readiness summary

## Current readiness level
**Pre-audit remediation in progress; not ready to claim an attestation.** The repository has meaningful application controls and passing local suites, but dependency exceptions, production configuration evidence, repository governance, recovery evidence, vendor reviews, privacy/legal approvals, and independent auditor work remain.

## Implemented or improved
- Server-side session, signature, ownership, admin, and cabin checks exist in the Worker and have regression coverage.
- CORS now fails closed: only explicit allowlist matches receive `Access-Control-Allow-Origin`.
- OAuth token encryption now requires a server-held `X_TOKEN_ENCRYPTION_KEY`; public handles are no longer encryption keys.
- Existing safe headers were retained and HSTS, Referrer-Policy, Permissions-Policy, and COOP were added to Pages headers.
- Security workflow, CODEOWNERS draft, evidence index, control matrix, risk register, policies, runbooks, and templates were added.

## Remaining technical gaps
- Frontend: 5 audit findings; Worker: 3 high findings. Upgrade or formally accept with expiry and compensating controls.
- Add explicit regression tests for disallowed CORS, RPC 429/malformed responses, stale/cache-poisoned authorization, and provider failure states.
- Verify production secret/configuration values, alerting, rate limits, backups, restore, and log redaction.
- Verify deployment workflow execution and production rollback.

## Remaining human/governance gaps
Branch protection and reviewer ownership; access reviews; vendor evidence/contracts; privacy/legal approval; security training; retention/RTO/RPO approval; incident and recovery exercises; auditor scope and testing.

## Prioritized backlog
- **P0:** set server-held OAuth encryption secret; test and monitor authorization failure states; confirm no production wildcard CORS.
- **P1:** remediate/accept dependency vulnerabilities; enable branch protection and required reviews/checks; evidence backups/restore and provider configuration.
- **P2:** complete policies, access/vendor reviews, training, privacy notice, retention/deletion jobs, alert ownership, and evidence retention.
- **P3:** SBOM/provenance enhancements, circuit breakers, broader dynamic route tests, and further hardening.

## Explicit limitation
No SOC 2 compliance, certification, attestation, auditor conclusion, approval, backup success, vendor attestation, or operating effectiveness is claimed. An independent service auditor must perform the examination.
