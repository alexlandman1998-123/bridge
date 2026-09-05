# Phase 8 — Rentals staging and release runbook

## Objective

Move the rentals CRM and tenant/landlord portal candidate from its current
application-ready, database-blocked state to a release decision without
allowing a broad migration push, migration repair, or accidental production
change.

**Current decision:** production promotion is blocked. The designated staging
project is `vaszuxjeoajeuhlcnzzf` (Arch9 Staging); it lacks the rental schema
prerequisites and the managed portal foundation.

## Owners and evidence

| Gate | Required owner | Required evidence | Stop condition |
| --- | --- | --- | --- |
| Migration-ledger decision | Database/release owner | Approved reconciliation decision showing how staging history will be made canonical | Any proposal to use `migration repair`, `db reset`, or broad `db push` as a shortcut. |
| Rental baseline | Database owner | Query results for `rental_properties`, `rental_tenancies`, and `rental_set_updated_at()` in staging | A portal migration cannot safely be applied while any prerequisite is absent. |
| Portal foundation | Database owner | Managed migration record and schema/RLS verification for `20260905120250_rental_portal_foundation.sql` | Any foreign-key, RLS, or catalog mismatch. |
| Portal journey | QA owner | Redacted tenant and landlord non-production journey packets | Missing token guard, application, document, or decision evidence. |
| Release candidate | Engineering/release owner | Fresh PR from the current baseline with current CI and preview evidence | Stale/conflicted PR, failed required check, or unreviewed migration. |
| Production promotion | Release approver | Explicit approval, staging evidence, rollback plan, and production verification packet | No explicit approval or an unresolved staging gate. |

## Ordered execution

### 1. Establish a canonical staging migration baseline

The staging ledger has remote versions absent from the local migration tree.
First choose one reviewed recovery path: restore the matching local history from
known source commits, or create a separately approved non-production baseline.
Record the decision and preserve the original ledger evidence. Do not edit
historical migrations that could already be recorded elsewhere.

Read-only confirmation command:

```sh
supabase migration list --linked --project-ref vaszuxjeoajeuhlcnzzf
```

### 2. Establish rental prerequisites in staging

Before the portal migration is considered, confirm the approved staging
baseline provides:

- `rental_properties`
- `rental_tenancies`
- `rental_set_updated_at()`

The approved rental baseline must be applied through the controlled managed
migration process selected in Gate 1. Record catalog and foreign-key evidence.

### 3. Apply the managed portal foundation

After Gates 1 and 2 pass, apply
`supabase/migrations/20260905120250_rental_portal_foundation.sql` to staging
through the approved, one-migration-at-a-time release process. Verify:

- tenant and landlord portal tables exist;
- RLS is enabled and anonymous/authenticated direct access remains revoked;
- only hashed access tokens are persisted;
- request and decision audit tables, indexes, and update triggers exist.

### 4. Certify non-production tenant and landlord journeys

Create test-only tokens and run the following end-to-end checks:

1. Tokenless routes return `401`.
2. A tenant can access only the linked tenancy, submit an application, supply
   FICA/documents, and receive a recorded decision.
3. A landlord can access only the linked property/mandate, review the mandate,
   submit required details, and receive the correct next action.
4. Expired, revoked, cross-tenant, and cross-landlord tokens are rejected.
5. Staff CRM views display the resulting lead, workflow state, and audit events
   without exposing raw portal tokens.

Store only redacted identifiers, timestamps, response codes, and screenshots in
the evidence packet.

### 5. Prepare a fresh release PR

Once staging certification is green, rebase the current candidate changes onto
the then-current `origin/main` in a fresh branch. Do not reuse PR #11, #16, or
#17. The PR must include the managed migration, focused tests, staging evidence,
and a clear rollback note. Require current CI and a new Vercel Preview before
review.

### 6. Decide production promotion

Production is a separate explicit decision. It requires the complete staging
packet, named approver, backup/rollback plan, and post-apply catalog plus
journey verification. No broad `supabase db push`, ledger repair, or direct
production SQL is authorised by this runbook.

## Phase 8 exit criteria

Phase 8 is complete when the above gates have an accountable owner and the
evidence packet structure is ready. It does **not** claim staging or production
certification; those are subsequent execution decisions.
