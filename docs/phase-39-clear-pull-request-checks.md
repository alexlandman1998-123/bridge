# Phase 39 — Clear the Pull-Request Checks

## Outcome

**Status: SOURCE CHECKS REPAIRED; SUPABASE PREVIEW CONFIGURATION CORRECTED**

The four failing repository checks shared one cause: the mandate-generation corrections changed the release branch runtime after production commit `333c08eb` was certified. The old tests required the pull-request runtime to remain byte-for-byte identical to production, so they could not represent a tested but not-yet-promoted release candidate.

Phase 39 keeps the evidence honest by separating two artifacts:

- Production remains on certified commit `333c08eb`; Phase 39 does not deploy or promote anything.
- The PR candidate is the runtime introduced through `b7b9760f`. It passed a fresh Node 22 lockfile install, all nine application test groups, the guarded build, release-manifest verification, and the performance budget.

The Phase 33 scope remains deny-by-default. Exactly eight mandate-generation correction paths are now approved; no migration, unrelated UI module, attorney module, email layout, or onboarding feature was added to the release scope.

## Check repairs

- Phase 20 now proves both that the production baseline remains traceable and that the current PR runtime matches the tested candidate.
- Phase 26 now certifies the current reproducible candidate without claiming it has been promoted.
- Phase 33 now records the explicit eight-path correction amendment.
- Phase 34 continues to verify the real production artifact and explicitly requires the candidate to remain unpromoted.

## External check

Supabase Preview is separate from these source checks. Its first failure occurred because the shared base configuration required production's `SMTP_PASSWORD`, while Supabase secrets are branch-specific. Phase 39 moves the existing Resend configuration and the 1,000-email rate limit into the persistent production remote. Ephemeral previews use Supabase's restricted development mailer and its two-email limit, so no production credential is copied into a preview or committed to Git.

Once configuration succeeded, Preview exposed a second, older inventory defect: the first incremental migration altered `public.profiles`, but no migration created the platform's pre-existing base schema. Phase 39 restores `202605090000_production_schema_baseline.sql` from `the-it-guy/sql/schema.sql` at commit `4ee5387b`, immediately before the first incremental migration was introduced. Forward references to `public.transactions` are expressed as deferred foreign keys so the unchanged final relationship graph can be created in dependency order. The document-packet, signing, and private-listing foundations that were present outside `supabase/migrations` are restored inside the bootstrap before their first dependent objects. Its SHA-256 is pinned in the evidence and CI. This makes an empty preview database reproducible without fabricating schema. Because production already contains this historical schema, its ledger must attest the baseline version before merge; Phase 39 does not execute it against production.

This changes configuration scope, not the production credential. Production project `isdowlnollckzvltkasn` retains the Resend override; the migration inventory and databases are unchanged.

Machine-readable evidence is stored in `deployment-evidence/2026-07-20-phase39/pull-request-check-clearance.json`.
