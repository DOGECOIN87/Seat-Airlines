> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Change management policy

Changes use an issue or change record, pull request, review by appropriate CODEOWNER, passing CI, deployment record, and rollback plan. Database migrations require forward validation and a tested recovery approach. Direct pushes are prohibited once branch protection is enabled. Emergency changes are limited to restoring security/availability and require retrospective review within [SET PERIOD].
