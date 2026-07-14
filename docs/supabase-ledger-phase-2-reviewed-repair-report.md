# Supabase Ledger Phase 2 — Reviewed Live-State Repairs

Applied: 2026-07-14
Linked project: `isdowlnollckzvltkasn`
Branch: `codex/db-phase0-reconciliation`

## Outcome

Phase 2 recorded 34 migrations whose declared objects or data outcomes were already present in production. This phase updated `supabase_migrations.schema_migrations` only. It did not execute any migration SQL and did not modify application tables, storage objects, policies, functions or user data.

| Metric | Before | After |
| --- | ---: | ---: |
| Matched versions | 274 | 308 |
| Pure local-only versions | 84 | 50 |
| Pure remote-only versions | 0 | 0 |
| Split versions | 0 | 0 |
| Duplicate local timestamps | 0 | 0 |

## Repaired batches

### Commercial — 6

- `202606160001` signed mandate/private-listing backfill
- `202606170004` commercial invite membership marker
- `202606290006` commercial landlord unassigned visibility
- `202606290019` transaction reservation commercial terms
- `202606300001` commercial import canvassing sales prospects
- `202607090007` private-listing mandate status alignment

### Developer/referral — 2

- `202606240002` Arch9 launch referral clicks
- `202607050006` preferred-partner cancellation attorney

### Lead capture/CRM — 7

- `202606170001` private-listing document member access
- `202606200002` lead structured location
- `202607010003` lead enquiry property fields
- `202607010004` single lead-capture alias
- `202607090006` private-listing external isolation
- `202607130001` private-listing active-member insert policy
- `202607130005` private-listing inline select policy

### Notification alignment — 1

- `202607130003` membership helper email-claim alignment

### Shared foundations — 6

- `202606200001` Google Places location foundation
- `202606200003` area-directory backfill
- `202606200004` area aliases
- `202607090001` agency tasks foundation
- `202607130002` membership helper status alignment
- `202607130004` membership helper accepted status

### Transaction network — 4

- `202606260001` transaction partner invitation acceptance
- `202606300002` transaction partner legal invitations
- `202607080003` partner invitation member-management RPC
- `202607080005` transaction invitation partner-organisation binding

### Workspace platform — 8

- `202606150001` Arch9 HQ founder system role
- `202606190002` admin invited-users summary
- `202606190003` organisation branding storage
- `202606190004` branch entitlement removal
- `202606230001` Arch9 launch event leads
- `202606240001` Arch9 launch follow-up fields
- `202606280003` demo enquiries
- `202607020001` free-trial entitlement-limit removal

## Manual outcome evidence

- Organisation branding bucket exists with all four expected storage policies.
- Signed-mandate backfill columns exist and zero eligible rows remain.
- No plan, subscription or override still enforces `maxBranches`.
- All free-trial plan and subscription rows have the intended unrestricted entitlement object.
- The Phase 5 catalog audit found every statically declared object for the other 30 candidates live.

## Smoke gates

Passed:

- Commercial MVP
- Commercial role formalisation
- Private-listing RLS policy
- Transaction invitation reconciliation
- Workspace entitlements
- Onboarding branding resolver
- Admin mobile dashboard
- Notification automation foundation
- Partner directory Phase 5

`agent-leads-workspace` still has a pre-existing UI assertion failure for actionable seller status chips. The database-specific private-listing RLS test passed, and no Phase 2 repair executes or changes application code.

## Explicit exclusions

Phase 2 did not repair:

- Any partially live migration
- Any migration with missing objects
- `202606290010_commercial_landlord_workspace_schema_cache.sql`, because it grants anonymous writes
- `202607010001_replace_mandate_agency_name_placeholder.sql`, because nine rows still need correction
- `202606290014_development_seller_details_phase1.sql`, because the column is absent
- `202607080007_profile_settings_metadata.sql`, because the columns are absent
- Any uncommitted SA legal-document migration

The remaining 50 versions therefore require a forward migration, a corrective delta, or an explicit product decision; there are no further static all-live repair candidates.
