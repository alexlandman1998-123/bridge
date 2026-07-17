# Outstanding migrations Phase 7: security reconciliation

Date: 2026-07-17
Historical migration: `202607070001_drop_demo_all_rls_grants`
Successor migration: `202607140018_legacy_demo_rls_scoped_replacement`

## Outcome

The historical migration was reconciled as superseded and recorded applied without executing its SQL. Applying its broad privilege revocations would conflict with the later scoped-replacement architecture, which deliberately retains PostgREST table grants and enforces access through RLS.

| Gate | Result |
| --- | --- |
| Live legacy tables | 47/47 have RLS enabled and policy coverage |
| Scoped successor policies | 28/28 present |
| Unrestricted legacy policies | 0 |
| Successor helper function | Present |
| Successor raw-ledger row | Present |
| Historical raw-ledger row | Present after repair |
| Ledger repair | Applied |
| Historical revocation SQL executed | No |
| Schema fingerprints changed | No |

`client_seller_interest_requests` is the only name from the historical 48-table list that no longer exists. The historical migration itself skips nonexistent relations, so this is not a security or reconciliation blocker.

## Why the historical SQL was not replayed

The older migration would remove 322 anonymous grants and 184 authenticated write grants from the surviving legacy-table set. The later successor migration explicitly preserves grants because Supabase API access requires both a table privilege and a passing RLS policy. Removing the grants now could prevent legitimate requests from reaching the scoped policies.

The safe forward state is therefore:

- retain the current table privileges;
- require RLS on every surviving legacy table;
- require policy coverage on every surviving legacy table;
- remove demo-wide and unrestricted baseline policies;
- record the superseded historical migration so it cannot be replayed by a future migration push.

## Verification evidence

The reusable read-only gate at `sql/outstanding-migrations-phase7-security-gate.sql` returned `safe_to_reconcile_history = true` before and after repair.

Focused passing suites:

- agency RLS/manual intervention audit;
- attorney onboarding RLS classification;
- document request scenario matrix;
- bond partner portal service;
- live canonical-document RLS/grant audit.

Two unrelated pre-existing suite failures were observed and excluded from this gate:

- buyer onboarding flow contract cannot resolve an existing extensionless module import under direct Node ESM;
- seller portal alignment still expects the removed `SellerPropertyPerformance` component.

Neither failure exercises the legacy grant or scoped-policy contract, and no unrelated product code was changed in this phase.

## Schema immutability

The before/after fingerprints were identical:

| Catalogue | Fingerprint |
| --- | --- |
| Columns | `73052c826fabc9222d23fc1bf74d54ad` |
| Constraints | `9628ebcc5e5aa5fcf707df5f0dbf6133` |
| Functions | `1d6d2ccad42c3f892735867ce6964550` |
| Indexes | `71fa6fddfaac1d28e1ada0354d56bc2c` |
| Policies | `c0e3c898dcfb4216d06684b2a050decd` |

## Rollback

The only Phase 7 mutation was migration-ledger metadata. If this reconciliation decision must be reversed, run:

```sh
npx supabase migration repair --linked --status reverted 202607070001
```

That rollback must not be followed by a broad database push until the privilege and portal impact has been reviewed again.

## Decision

`PHASE_7_SECURITY_RECONCILIATION_COMPLETE`

The previously genuine outstanding migration is now resolved. The known 12-digit/14-digit CLI split rows remain display collisions with exact raw-ledger evidence; they are not executable pending migrations.
