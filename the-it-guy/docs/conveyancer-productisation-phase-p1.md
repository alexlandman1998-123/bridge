# Conveyancer productisation P1: persistence and tenancy foundation

P1 turns the approved P0 record catalogue into durable, tenant-scoped database ledgers. It does not yet run workflows or replace the existing A1-F8 in-memory contracts.

## Outcome

- `transactions` remains the matter identity and `organisations` remains the workspace identity.
- `attorney_firms.organisation_id` is required to match the record organisation.
- The authenticated user must be an active member of that exact firm and already pass the existing transaction-spine access check.
- Fifteen P1 ledgers persist plans, action events, exceptions, document artifacts, signing, financial records, coordination, evidence, integration envelopes, assurance and audit history.
- Canonical records use immutable revisions. Decisions, executions and provider envelopes are immutable events.
- Action queue, professional timeline and lodgement readiness remain calculated projections.
- Documents and large provider payloads remain in secure object storage; P1 stores references and hashes only.
- Direct insert/update/delete is unavailable to authenticated clients. Future P2 command handlers may append through the service boundary. Audit events are written by database triggers and cannot be inserted directly, including through the service role.

## Controlled release

1. **Dry run:** apply `202607160001_conveyancer_productisation_p1.sql` to an isolated database restored from the target environment.
2. **Verify:** run `sql/conveyancer-productisation-p1-verify.sql`, RLS negative tests, controlled service-insert/read tests for two firms, immutable-update tests and the P0/P1 contract suites.
3. **Reconcile:** confirm all 15 tables exist, start with zero product rows, and record the schema/catalog fingerprint in release evidence.
4. **Deploy expanded schema:** take the normal pre-migration backup, apply through the guarded Supabase migration workflow, and verify PostgREST schema reload.
5. **Keep dormant:** no application path writes to the tables until P2 orchestration is enabled for a pilot cohort.
6. **Activate gradually:** enable P2 writers firm-by-firm behind a kill switch. Integrations remain manual unless separately activated.

## Recovery

The migration is additive and the tables are dormant after P1. If verification fails, disable the future P2 writer flag and forward-fix the schema. Do not drop immutable legal records or run a destructive down migration. Restore is reserved for a failed deployment before any P1 write is accepted and requires the named database rollback owner.

## P1 acceptance evidence

- Unique migration version and migration safety check pass.
- P0 and P1 contract tests pass.
- All P1 tables have RLS, scoped read policies, service-bound append privileges, immutable triggers and scope indexes.
- Cross-firm, wrong-organisation and inaccessible-transaction operations fail closed.
- No raw file bytes or provider secrets are stored in the ledgers.
- Existing A7, B7, C8, D8, E7 and F8 assurance suites remain green.

## P2 handoff

P2 should add the application orchestration layer and controlled command handlers. It must append revisions/events using idempotency keys, derive the three projections from ledgers, write object references only, and retain manual provider workflows when live integrations are unavailable.
