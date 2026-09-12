# Conveyancing restart — Phase 8 release status

10 September 2026. **Not released.**

Follow-up: see `conveyancing-staging-reconciliation-20260910.md` for the applied and
verified staging corrections. The findings below describe the earlier preflight;
production release and full live acceptance remain outstanding.

## Verified release blockers

- Connected Supabase inventory confirms Arch9 Staging is
  `vaszuxjeoajeuhlcnzzf` and Arch9 SaaS production is `isdowlnollckzvltkasn`.
- Staging has the shared and seller journey RPCs, but not
  `public.bridge_read_professional_matter_journey(uuid)`, which the application
  now calls for professional audiences. The missing function is defined in local
  migration `20260910094209_transfer_tax_cross_role_safe_reader_phase7.sql`.
- Staging's queried migration ledger after `20260908140000` ends at
  `20260908183116`. This is not a full schema-equivalence audit.
- Production's ledger contains `20260909213009`, but none of the four queried
  local tax migrations `20260910080011`, `20260910080705`, `20260910092527`,
  `20260910094209`.
- The already-recorded `20260909213009` migration has local modifications.
  Replaying its version is not a valid way to deliver those changes. Review its
  deployed definition and introduce a forward corrective migration if necessary.
- Re-ran `node scripts/shared-matter-journey-atomic.test.mjs`. PostgreSQL mutation,
  reload, rollback, outcome, revision, ACL and retry assertions passed, but the
  suite exited 1 on SQL/application catalogue parity. Differences include tax
  descriptions, client metadata and a default visibility. Do not suppress this
  assertion or treat its partial pass as release approval.
- Phase 7 real scenario and cross-role acceptance remains incomplete.
- The checkout includes unrelated rental, marketing and listing changes. A broad
  checkout deployment would include work outside this release's scope.

## Required release order

1. Reconcile the relevant migration dependency chain and task catalogue, including
   a forward migration for changes to already-applied SQL. Preserve privacy rules.
2. Apply and verify the reviewed chain on staging; confirm professional and portal
   RPCs and grants, then rerun the authenticated workflow read.
3. Finish Phase 7 using designated staging matters and all participant roles.
4. Isolate and record the exact conveyancing release commit and migration manifest.
5. With recovery available, apply compatible database changes before the frontend
   that depends on them; verify the ledger and RPCs before promotion.
6. Repeat critical journeys on designated deployed test matters, including reload,
   reopen, permissions and participant synchronization. Record actual evidence.

No remote schema, migration history, permissions or matter data was modified by
this Phase 8 check. No commit, push or deployment was performed. This document is
a release-blocker record, not implementation or acceptance evidence.
