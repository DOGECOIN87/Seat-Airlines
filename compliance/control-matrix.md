> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Control matrix

Statuses are assessed from repository evidence only: **Implemented**, **Partially implemented**, **Documented but unverified**, **Missing**, or **Human/vendor/auditor action**.

| ID | TSC | Risk | Control statement | Status | Owner | Frequency | Evidence source | Retention | Test method | Exception | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CC6.1 | CC6.1 | unauthorized access | Protected routes validate session, admin, wallet ownership, and cabin boundary server-side | Partially implemented | [ASSIGN OWNER] | Each request | Worker source/tests | [SET PERIOD] | route abuse matrix | RPC/cache availability behavior needs explicit approval | add outage/poisoning tests |
| CC6.6 | CC6.6 | token theft | OAuth tokens are encrypted with a server-held secret and never returned to browser | Implemented in code; production secret unverified | [ASSIGN OWNER] | Each connection/rotation | `worker/src/xshare.ts`, secret inventory | [SET PERIOD] | integration test and secret review | production secret not verified | set and evidence secret |
| CC6.7 | CC6.7 | cross-origin abuse | CORS uses explicit allowlist; disallowed origins receive no allow-origin header | Implemented in code; production config unverified | [ASSIGN OWNER] | Deploy/review | `worker/src/index.ts`, `wrangler.toml` | [SET PERIOD] | header tests | config drift | record deployed value |
| CC7.1 | CC7.1 | operational blind spot | Errors return safe JSON and health distinguishes service/dependency states | Partially implemented | [ASSIGN OWNER] | Worker health/error paths | [SET PERIOD] | failure injection | alert delivery unverified | add monitoring evidence |
| CC8.1 | CC8.1 | unauthorized change | PR review, CI checks, CODEOWNERS, reproducible install, and deployment records are required | Partially implemented | [ASSIGN OWNER] | Every change | `.github/`, lockfiles | [SET PERIOD] | PR sample | branch protection currently unverified/not enabled | enable protection |
| CC8.2 | CC8.2 | unsafe migration | Migrations are reviewed, validated, reversible where practical, and recorded | Documented but unverified | [ASSIGN OWNER] | Every migration | `worker/migrations/`, change record | [SET PERIOD] | migration rehearsal | rollback not evidenced | create rehearsal record |
| CC9.1 | CC9.1 | provider failure | Providers are inventoried and reviewed for security, privacy, availability, and contract obligations | Documented but unverified | [ASSIGN OWNER] | Annual/change | vendor register | [SET PERIOD] | vendor review | contracts/attestations absent | collect provider evidence |
| A1.2 | A1.2 | data loss/outage | Backups, restoration tests, RTO/RPO, and recovery exercises are maintained | Missing/documented | [ASSIGN OWNER] | [SET FREQUENCY] | backup runbook/template | [SET PERIOD] | non-prod restore | provider capabilities unverified | run first exercise |
| C1.2 | C1.2 | excessive disclosure | Data classification, minimization, safe logs, retention, and deletion are defined | Partially implemented | [ASSIGN OWNER] | Quarterly/change | data/retention docs | [SET PERIOD] | log and deletion review | implementation coverage incomplete | implement cleanup jobs |
| P4.1 | P4.1 | privacy noncompliance | Privacy notice and user request process are approved and operated | Human/legal action | [ASSIGN OWNER] | Annual/change | privacy notice/request log | [SET PERIOD] | legal review/sample | legal review not completed | obtain approval |
