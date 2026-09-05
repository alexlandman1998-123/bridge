# Rentals staging recovery — Phase 2 authoritative-baseline plan

**Recorded:** 2026-09-05  
**Production identity:** `isdowlnollckzvltkasn`  
**Staging identity:** `vaszuxjeoajeuhlcnzzf`  
**Execution posture:** read-only planning; no database or deployment mutation performed

## Finding

The Rentals release is split across two schema-management models:

1. `supabase/migrations/20260905120250_rental_portal_foundation.sql` is a managed migration. It creates the tenant and landlord portal tables, but requires pre-existing `rental_tenancies`, `rental_properties`, and `rental_set_updated_at()`.
2. The prerequisite Rentals CRM foundations live as unmanaged, dependency-ordered SQL files under `sql/20260829_rental_*.sql`.

The managed portal migration cannot establish a usable Rentals environment by itself. It is intentionally blocked on a clean rental-foundation reconciliation.

## Authoritative-source decision

Production is the authoritative environment for existing live schema and application history. However, it has **not** been observed in this phase: the read-only `supabase migration list --linked --project-ref isdowlnollckzvltkasn` request did not return a ledger because the CLI could not initialise its login role.

Accordingly, this plan does not claim that production matches the checkout, and it must not be used to repair the staging ledger. A platform-authorised, read-only production ledger export is required before any staging rebuild.

## Candidate rental foundation chain

The following source files are the candidate clean-environment foundation chain. Their ordering is derived from explicit foreign-key/function dependencies, not from their shared `20260829` prefix.

| Order | Source | Purpose |
| --- | --- | --- |
| 1 | `sql/20260829_rental_property_foundation.sql` | Managed properties, party links, branch-scoped access, and `rental_set_updated_at()`. |
| 2 | `sql/20260829_rental_unit_foundation.sql` | Rentable units, dependent on properties. |
| 3 | `sql/20260829_rental_portfolio_foundation.sql` | Portfolios and property assignments. |
| 4 | `sql/20260829_rental_landlord_mandate_foundation.sql` | Landlord ownership and property mandates. |
| 5 | `sql/20260829_rental_vacancy_foundation.sql` | Vacancies, dependent on property/unit/mandate foundations. |
| 6 | `sql/20260829_rental_evidence_foundation.sql` | Rental evidence and activity records. |
| 7 | `sql/20260829_rental_vacancy_marketing_foundation.sql` | Vacancy copy/media records. |
| 8 | `sql/20260829_rental_internal_marketing_operations.sql` | Internal marketing lifecycle. |
| 9 | `sql/20260829_rental_applications_and_applicant_access.sql` | Canonical applications and applicant access. |
| 10 | `sql/20260829_rental_application_submission.sql` | Application submission/consent fields. |
| 11 | `sql/20260829_rental_application_documents.sql` | Application-document records and storage bucket. |
| 12 | `sql/20260829_rental_application_review_workspace.sql` | Staff review summary view. |
| 13 | `sql/20260829_rental_application_screening.sql` | FICA and screening checks. |
| 14 | `sql/20260829_rental_application_screening_reviewer_actor.sql` | Reviewer attribution correction. |
| 15 | `sql/20260829_rental_application_decisions.sql` | Decisions, events, and notification outbox. |
| 16 | `sql/20260829_rental_application_tenancy_conversion.sql` | Approved application → tenancy conversion. |
| 17 | `supabase/migrations/20260905120250_rental_portal_foundation.sql` | Tenant and landlord portal foundation. |

The source chain is a **candidate**, not an approved migration history. Before it becomes deployable, each file needs an immutable managed migration identity and a review of idempotence, dependency order, RLS, triggers, views, and required extensions.

## Required evidence before Phase 3

1. A read-only production migration-ledger export, captured by a platform-authorised operator, with its project reference and timestamp.
2. A read-only production catalog report for the candidate rental tables, functions, views, policies, triggers, indexes, and storage bucket.
3. The Phase 1 staging backup/snapshot reference, or written confirmation that the staging project is disposable.
4. Confirmation that staging deployments and outgoing side effects are frozen for the recovery window.

The production ledger must be compared with the local managed-migration inventory. Any production-only item is evidence to investigate, never a migration identifier to mark as applied in staging.

## Reversible staging-rebuild runbook (prepared, not executed)

1. Create a fresh, isolated staging project or obtain explicit approval to replace the current staging project. Do not reset the existing project merely to make its ledger look clean.
2. Configure only staging secrets and disable/repoint email, webhooks, payment integrations, scheduled jobs, and external publication.
3. Convert the reviewed rental foundation chain into one managed, timestamped migration sequence. Do not retrospectively alter an already-applied migration.
4. On an empty staging database, apply the approved managed migrations in order, ending with the portal foundation migration.
5. Run catalog, RLS/policy, trigger, and canonical lead → application → tenancy → portal smoke checks with disposable test data.
6. Capture the resulting staging migration ledger and schema report. Retain it as the rollback reference.
7. Repoint the staging application only after the checks pass; keep the previous staging project available until sign-off.

## Explicit prohibitions

- Do not use `migration repair`, `db push`, or direct SQL against the current broken staging project.
- Do not infer production state from this repository, commit timestamps, or Vercel deployment state.
- Do not copy production credentials or production customer data into staging.
- Do not apply the unmanaged rental files directly to production or to the current staging project.

## Phase 2 result and next boundary

Phase 2 establishes the source-of-truth rule, identifies the managed/unmanaged split, and prepares a reversible rebuild sequence. It remains blocked on the four evidence items above. Phase 3 may create the managed-foundation migration plan only once that evidence is available; it must still be a no-apply phase.
