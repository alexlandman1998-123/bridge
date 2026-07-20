# Supabase Phase 11 — Staging Certification

Generated: 2026-07-20T17:23:57.326Z

## Outcome

**Status: STAGING_CERTIFIED**

The migration release represented by commit `18d875bee8cdfa14cb51236b0f7cdfe5c3317698` is certified on staging project `vaszuxjeoajeuhlcnzzf`. The Phase 25 recertification adds the reviewed transaction participant least-privilege correction.

Production project `isdowlnollckzvltkasn` was not connected to or mutated during certification.

## Certification checks

| Check | Result |
| --- | --- |
| Manifest migrations | 71 |
| Manifest versions recorded on staging | 71/71 |
| Complete reviewed staging evidence | 71/71 |
| Expanded conditional-master chain | 3/3 applied, verified, and ledgered |
| Phase 25 transaction correction | Applied, verified and ledgered |
| Attorney-integrity rows | 8 healthy across 3 firms |
| Attorney-integrity blocking rows | 0 |
| Attorney-integrity blocking assignments | 0 |
| Phase 10 audit events | 43 across 43 transactions |
| Remediated firm certification | `certified` (`phase9-v1`) |
| Human staging approval | Alexander Landman |
| Production mutations | None |

The manifest and selected evidence set are bound to this certification with SHA-256 digests in `migration-evidence/2026-07-20-staging-phase25/staging-release-certification.json`.

## Meaning of certification

Staging is approved as the tested source state for the 71-row migration manifest. This certification does not authorize a broad database push.

Production promotion must still use the Phase 7 runner one migration at a time, with the production connection and recovery attestation configured outside source control. Each production migration still requires post-application verification before its ledger entry is recorded.
