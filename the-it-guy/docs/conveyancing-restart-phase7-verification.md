# Conveyancing restart — Phase 7 verification

Date: 10 September 2026

Status: **Blocked; not end-to-end verified.** No production deployment or database
migration was performed in this pass.

Follow-up: the subsequent staging reconciliation resolved the missing reader and
catalogue mismatch; see `conveyancing-staging-reconciliation-20260910.md`. The live
scenario matrix below still has not been completed.

## Observed live evidence

- `.env.staging.local` targets Arch9 Staging, `vaszuxjeoajeuhlcnzzf`.
- Ran `node scripts/attorney-mvp-staging-read-check.mjs` using its existing demo
  attorney login and demo matter, with workflow initialization disabled.
- Authentication succeeded.
- The application resolved transfer, bond and cancellation roles; its diagnostic
  reported missing `seller_entity_type`.
- The workflow read failed: `Shared legal journey is unavailable. Refresh before
  updating work.` The command exited 1. Missing seller type is an observation,
  **not an established cause** of the failed reader.
- No task transition, document upload, approval, client message or account reset
  was executed.

## Test environment hazards

The older `workspace-branding-browser-staging-smoke.mjs` runner identifies
`isdowlnollckzvltkasn` as staging and defaults to `https://app.arch9.co.za`.
Current environment documentation identifies both as production. It was inspected,
not executed. Do not use older scripts' names as proof of their target environment.

The available browser session was production, not a signed-in staging session.
`check:attorney-practical-phase1` also returned blocked for missing/stale earlier
approval evidence; this is a preflight result, not a browser test result.

## Unverified acceptance criteria

All UI transition and cross-role cases remain unverified for this candidate:
individual/married/company/trust/mixed parties; cash/bond/hybrid; freehold/HOA/
sectional-title/development; duty/VAT/exempt/unresolved; representative/estate;
expiry, changed facts, rejection and reopening. Drawer, document, scheduling,
reload, permissions and layout checks have not been established by this pass.

## Required next step

Diagnose the staging shared-journey read failure and reconcile any required staging
schema/API prerequisites before running mutating acceptance scenarios. Do not bypass
the unavailable reader or mark generated/provisional tasks as persisted evidence.
Then run the real scenario matrix against designated staging test matters, with
attorney, developer/agent, buyer and seller access. Preserve failure evidence and
verify saved outcomes after reload and in other roles before certifying Phase 7.
