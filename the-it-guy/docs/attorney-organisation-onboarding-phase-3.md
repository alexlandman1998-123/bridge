# Attorney organisation onboarding — Phase 3

## Outcome

Phase 3 repairs historical attorney firms that predate the atomic Phase 2 onboarding path and prevents canonical Settings edits from leaving older attorney reads stale.

Migration: `supabase/migrations/202607150004_attorney_organisation_reconciliation_phase3.sql`

## Reconciliation policy

`organisations` remains the canonical owner of shared identity.

For every existing attorney firm, the migration:

1. creates or repairs the backing organisation and its memberships;
2. preserves every populated canonical organisation value;
3. fills only missing canonical fields from `attorney_firms` and `attorney_firm_branding`;
4. aligns the legacy firm and branding mirrors from the reconciled organisation;
5. records reconciliation metadata in organisation settings.

This means historical data fills gaps without overwriting identity that was already edited in Organisation Settings.

## Ongoing compatibility

The migration adds a one-way organisation trigger for shared attorney identity fields. Changes made through Organisation Settings are projected to `attorney_firms` and `attorney_firm_branding` so attorney surfaces that have not yet moved to direct organisation reads remain consistent.

There is intentionally no attorney-firm-to-organisation trigger. New onboarding uses the Phase 2 transaction, and subsequent shared identity edits must use the canonical organisation path.

The per-firm RPC `bridge_reconcile_attorney_firm_organisation(uuid)` is safely rerunnable by an authenticated firm admin or director/partner. The migration invokes it once for every existing firm inside the migration transaction.

## Verification

From `the-it-guy/`:

```sh
npm run test:attorney-organisation-phase3
```

After deploying Phase 2 and Phase 3 migrations, run the read-only environment check:

```sh
npm run report:attorney-organisation-drift -- --fail-on-drift
```

Phase 3 is implemented locally but is not automatically deployed to a remote database.
