# Phase 1: Canonical application interpreter

## Outcome

Phase 1 adds one deterministic interpretation boundary between saved buyer data and downstream document, readiness, and originator rules.

The interpreter:

- resolves applicant structure, purchaser entity, application intent, and employment aliases;
- preserves the raw value used for every unsupported-value blocker;
- normalizes finance values without mutating persisted legacy data;
- records source lineage from the prefill matrix for every decision field;
- calculates a stable decision fingerprint; and
- marks the result `trusted` or `review_blocked`.

## Runtime integration

`buildBondApplicationState` now returns the interpreted state with an `interpretation` object. Document resolution exposes interpretation blockers as diagnostics, and submission readiness converts them into blocking issues.

Drafts may still render while incomplete. They cannot be treated as trusted or submitted until all interpretation blockers are resolved.

## Safety boundary

Unknown values never fall through to a default purchaser or employment branch. They retain their raw value and create an originator-review blocker. The interpreter does not infer lender approval, legal status, or an originator-specific requirement profile.

This phase performs no Supabase schema changes and no live writes.

## Verification

```bash
npm run test:bond-originator-interpreter-phase1
```

The suite verifies deterministic fingerprints, known aliases, source lineage, joint applicants, unsupported-value blocking, non-mutation, and submission-gate integration.
