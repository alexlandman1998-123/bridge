# Attorney Pipeline Database Deployment — 2026-07-14

## Outcome

The seller-mandate preferred transfer attorney allocation and attorney incoming-matter pipeline are live on linked Supabase project `isdowlnollckzvltkasn`.

## Applied and recorded migrations

- `202607090002_attorney_incoming_instruction_sync.sql`
- `202607090003_attorney_incoming_acceptance_metadata.sql`
- `202607090004_attorney_incoming_decline_metadata.sql`
- `202607140009_private_listing_transfer_attorney_allocation_phase1.sql`
- `202607140010_attorney_pre_instruction_pipeline_phase2.sql`
- `202607140011_buyer_onboarding_originator_handoff_phase3.sql`
- `202607140012_signed_otp_transfer_instruction_activation_phase4.sql`
- `202607140013_attorney_instruction_response_phase5.sql`
- `202607140014_declined_transfer_attorney_reassignment_phase6.sql`
- `202607140015_transfer_instruction_lifecycle_assurance_phase7.sql`

Two older attorney migrations whose objects were already live were reconciled in migration history without replaying their SQL:

- `202607080009_attorney_firm_branding_metadata_persistence.sql`
- `202607090005_attorney_incoming_decision_events.sql`

## Preflight corrections

Before deployment, live-catalog checks found that `private_listings.assigned_agent_email` is not present. The Phase 2 projection now reads this optional legacy field through `to_jsonb(listing)`, while continuing to use the linked profile as the primary source.

The expanded `transaction_role_players.selection_source` constraints also preserve the existing `routing_rule` value so deployment does not narrow the previous contract.

## Verification evidence

- 10 target migration versions are recorded in `supabase_migrations.schema_migrations`.
- `private_listing_role_players` has RLS enabled.
- Eight targeted RLS policies are present.
- Four workflow triggers are present.
- Four mandate attorney placeholders are registered.
- Existing lifecycle projection: 8 `on_track`, 0 attention/blocked rows at verification time.
- Rollback-only database smoke test passed and left no allocation rows behind.
- PostgREST exposes both new RPCs and rejects unauthenticated probes through their expected guards.
- Targeted application tests for incoming matters, mandate allocation, OTP activation, attorney decisions, reassignment, and lifecycle assurance passed.

## Backup and rollback notes

The project reports WAL-G backup support, but PITR is not enabled and the CLI returned no enumerated physical backup snapshots. A full CLI schema dump was not available because Docker Desktop is not installed locally.

The deployment therefore used transaction-wrapped migrations, pre-change catalog evidence, and a scoped non-destructive rollback script. The rollback deliberately retains additive columns and allocation history rather than deleting production data.

## Remaining migration debt

The refreshed Phase 5 audit currently reports 85 pure local-only migrations and 17 split ledger versions. These span multiple modules and must be reconciled in reviewed module batches. They must not be applied with `db push --include-all`.

One attorney migration remains genuinely absent and outside this workflow deployment:

- `202607080008_attorney_firm_branding_storage_rls.sql`

See `docs/supabase-migration-phase-5-module-drift-report.md` for the current backlog.
