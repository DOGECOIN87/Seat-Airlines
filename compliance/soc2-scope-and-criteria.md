> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Scope and Trust Services Criteria

**Proposed scope:** security, availability, confidentiality, and privacy for the GitHub Pages frontend, Cloudflare Worker, KV/R2/D1, CI/CD, and listed providers. Processing integrity is relevant to signed adverts, scores, and flight controls and should be confirmed by the auditor.

| Criteria | In-scope objective | Boundary note |
|---|---|---|
| CC1–CC2 | governance, risk, responsibility, communication | human approval and training evidence required |
| CC3–CC5 | risk assessment, controls, monitoring | control matrix and risk register |
| CC6 | logical access/security | wallet sessions, admin routes, repository/provider access |
| CC7 | system operations | logging, alerts, vulnerability and incident response |
| CC8 | change management | pull requests, CI, deployment, rollback |
| CC9 | risk mitigation | vendors, continuity, backups, recovery |
| A1 | availability | Cloudflare dependency, RTO/RPO, exercises |
| C1 | confidentiality | OAuth tokens, profiles, messages, logs |
| P1–P8 | privacy | notice, retention, requests, subprocessors, legal review |

A qualified service auditor must confirm final criteria, scope, period, control design, operating effectiveness, and exclusions.
