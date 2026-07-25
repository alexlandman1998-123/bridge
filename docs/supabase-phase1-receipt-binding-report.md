# Supabase Phase 1 Receipt Binding

Generated: 2026-07-25T19:13:45.548Z

## Decision

| Field | Value |
| --- | --- |
| Status | `PHASE1_RECEIPT_BOUND_FOR_PUSH_GATE` |
| Write mode | Yes |
| Receipt path | `the-it-guy/config/legal-document-rollout-phase1-staging.json` |
| Manifest digest | `sha256:08917a8cd139538cdf40f4f2eafd60acf351ba6efd6d0ea7c14fc21206581303` |
| Migration bindings | 12 |
| Evidence source bindings | 9 |
| Push gate ready | Yes |
| Official rollout policy status | `HOLD` |
| Official rollout blockers | 3 |

## Official Policy Blockers

| Code | Detail |
| --- | --- |
| `P1_PHASE0_NOT_FROZEN` | A current, clean Phase 0 FROZEN report is required before staging work is planned or evidenced. |
| `P1_LEGAL_MIGRATION_MANIFEST_COVERAGE_MISSING` | The existing migration ledger has not classified every legal rollout migration. |
| `P1_DATABASE_RUNNER_TARGET_GUARD_INVALID` | The staging runner must parse and exactly bind a direct Supabase database host before any mutation is considered. |
| `P1_STAGING_EXECUTION_PENDING` | Controlled deployment and evidence capture have not yet been recorded. |

This binding makes the Phase 1 receipt digest and migration list concrete for the Supabase push evidence gate. It does not apply SQL, record staging ledgers, or override the stricter legal rollout policy.
