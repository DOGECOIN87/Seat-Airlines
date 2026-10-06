> **DRAFT — HUMAN APPROVAL REQUIRED**
> This document supports SOC 2 readiness and pre-audit remediation. It does not establish compliance, certification, or attestation.

# Business continuity and disaster recovery

Critical dependencies are GitHub Pages, Cloudflare Worker/KV/R2/D1, DNS, Solana/RPC, wallet providers, X, and GitBook. Until approved, proposed objectives are **RTO [APPROVE]** and **RPO [APPROVE]**. Safe degraded mode denies protected operations when authorization cannot be verified. Recovery exercises must use non-production data and produce actual records.
