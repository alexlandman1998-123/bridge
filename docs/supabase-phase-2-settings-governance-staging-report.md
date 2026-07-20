# Supabase Phase 2 — Settings Governance

## Outcome

Phase 2 has been implemented and verified on the dedicated Supabase staging project `vaszuxjeoajeuhlcnzzf`.

- Target: staging only
- Production project `isdowlnollckzvltkasn`: not changed
- Settings-governance migrations: 3
- Staging ledger entries confirmed: 3/3
- Migration evidence files: 3/3
- Settings governance contract tests: passed
- Staging execution safety test: passed

## Applied migrations

| Version | Capability | Result |
| --- | --- | --- |
| `202607170026` | Controlled job titles | Applied and verified |
| `202607170027` | Role and permission governance | Applied and verified |
| `202607170028` | Atomic ownership transfer | Applied and verified |

Each migration was applied in dependency order. Its ledger entry was recorded only after catalogue, behaviour, privilege, and no-residue checks passed. Evidence is stored under `migration-evidence/2026-07-20-staging-phase2/`.

## Job-title governance

The `organisation_users.job_title` column, constraint, label function, owner-only setter, guard triggers, profile synchronisation trigger, and partial lookup index are live.

- Existing memberships checked: 58
- Recognised job titles backfilled: 50
- Unmapped memberships: 8 `viewer` records, intentionally left without a job title
- Invalid governed job-title labels: 0
- Unauthenticated setter calls: denied
- Direct unauthenticated job-title updates: denied

## Role and permission governance

The authority-level function, guarded role setter, and role-change trigger are live. The hierarchy is enforced at the database boundary.

- Owner authority: 500
- Principal/director/partner authority: 400
- Branch manager authority: 300
- Agent authority: 100
- Unknown role authority: 0

Rollback-only checks confirmed that unauthenticated setter calls, self-role changes, and changes to a peer or higher-authority member are denied without leaving data changes.

## Ownership transfer

The ownership-transfer RPC is live and contains:

- an organisation-scoped advisory transaction lock;
- row locks for the actor and target memberships;
- active-owner and eligible-target validation;
- a transaction-local bypass used only for the paired owner-role changes;
- demotion rules based on organisation type;
- a durable `ownership_transferred` organisation event.

Expected-error checks confirmed that unauthenticated transfers, transfers to the current owner, and transfers to an existing owner are rejected without residue.

## Function privilege correction

Staging rehearsal showed that the three `CREATE OR REPLACE FUNCTION` statements could preserve a historical direct `anon` grant. Revoking privileges from `PUBLIC` alone does not remove a grant made directly to `anon`.

The canonical migrations were hardened to revoke `anon` explicitly before granting `authenticated` execution:

- `bridge_set_organisation_user_job_title(uuid, text)`
- `bridge_set_organisation_user_role(uuid, text)`
- `bridge_transfer_organisation_ownership(uuid)`

Final staging verification confirms all three functions are executable by `authenticated` and not executable by `anon` or `PUBLIC`.

## Preserved ownership-integrity issue

Two existing organisations contain multiple active owners and multiple `is_primary_owner` memberships. This data pre-dates Phase 2. The migration did not silently select or demote owners because doing so requires an explicit business decision about the legitimate owner.

The ownership-transfer API prevents creating a new transfer to a target already marked as an owner, but the historical duplicates should be resolved through a separate reviewed cleanup before relying on ownership transfer for those two organisations.

## Production promotion requirements

Phase 2 is ready for controlled production rehearsal/promotion but has not been promoted by this implementation.

Before production:

1. Confirm a recoverable production backup and rollback owner.
2. Audit production for multiple active or primary owners and decide the legitimate owner for each exception.
3. Apply the patched canonical migrations in version order.
4. Verify that all three RPCs deny `anon` and grant only the intended roles.
5. Run rollback-only role and ownership behaviour probes.
6. Record each ledger entry only after its evidence passes.
