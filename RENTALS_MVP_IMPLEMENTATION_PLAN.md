# Arch9 Rentals MVP — Implementation Plan

## Executive decision

Build Residential Long-Term Rentals as a bounded module inside the existing Arch9 application. Reuse shared platform services through explicit adapters, but keep rental routes, domain logic, database tables, queries, feature flags, tests, and release controls separate from Sales.

The critical delivery rules are:

1. No rental change may alter the meaning, default query, state machine, or UI behavior of a Sales record.
2. Rentals must load progressively. The route shell and operational summary render first; secondary panels, timelines, files, and counts load independently.
3. Rental features live under domain modules with narrow public interfaces. Pages compose modules; pages do not contain business rules or direct Supabase queries.
4. Every phase is independently deployable behind organisation-level and module-level feature flags.
5. Short-term rentals are accommodated through neutral Property, Unit, Party, Document, Maintenance, Inspection, Charge, and Payment models. Booking and stay logic is not included in this MVP.

## Current codebase mapping

### Existing foundations to retain

| Concern | Existing Arch9 capability | Rental implementation decision |
|---|---|---|
| Workspace isolation | `RentalWorkspaceGuard`, Rentals business workspace selection, `/agent/rentals/*` routes | Keep as the top-level boundary; never infer rental mode from a Sales route |
| Progressive rollout | `RENTAL_MODULES` and `resolveRentalModuleAvailability` | Extend with a flag per delivery slice and organisation allow-list |
| Permissions | Permission registry, navigation permissions, workspace roles | Add rental-specific capabilities instead of permanently aliasing all actions to Sales permissions |
| Listings | `private_listings`, listing media, publication data, portal sync, Property24 and Private Property adapters | Reuse a listing only as the marketing projection of a Vacancy; do not make it the source of truth for a Unit or Tenancy |
| Current rental marker | `listing_category:rental` and `seller_canonical_facts.rentalInfo` | Support during migration; move durable rental facts to structured rental tables |
| Rental UI | Listing index/create/detail pages, Applications and Tenancies pages | Treat as early slices to refactor into the modular target structure, not as the final domain boundary |
| CRM | Existing leads/contacts/clients and activity infrastructure | Add rental classification and rental relationships; do not create a second CRM |
| Documents | Document packs, definitions, requirements, instances, reviews, listing documents | Reuse storage and document services; link through typed rental entity references |
| Activity | Listing activity, lead activity, organisation activity/events | Reuse the event writer through a rental adapter and expose a unified rental timeline |
| Notifications | Definitions, events, templates, delivery attempts, preferences, reminders | Reuse transport and preferences; add rental event types/templates only |
| Scope | `resolveRentalWorkspaceScope` supports organisation, branch, department and assigned-user scope | Make the same scope contract mandatory in rental repositories and RLS |
| Shared UI | Page shell, headers, tables, filters, status badges, drawers, modals and mobile shell | Reuse presentational primitives; keep rental domain components separate |

### Gaps to close

- No durable, complete schema currently represents Portfolio → Property → Unit → Vacancy → Application → Tenancy.
- Rental listing data is temporarily split between `private_listings` and JSON rental facts.
- Rental permissions currently map mostly to broad Sales-era permissions.
- Dashboard, leads and calendar routes include placeholders.
- Application and lease models exist, but need transactional persistence, RLS and end-to-end lifecycle enforcement.
- Collections, arrears, maintenance, inspections, renewals, exits and rental portals are not yet complete domain modules.
- No complete rental performance contract or Sales non-regression release gate exists.

## Target module structure

```text
src/modules/rentals/
  shell/                 routes, navigation, feature gates
  dashboard/             operational projections and widgets
  portfolio/             portfolios, properties, units, landlords
  vacancies/             vacancy lifecycle and listing projection
  applications/          applicant form, screening and decisions
  tenancies/             conversion, lease, move-in and tenancy state
  collections/           charges, allocations and arrears
  maintenance/           requests, quotes, approval and completion
  inspections/           inspection scheduling and reports
  renewals/              expiry, renewal, notice and exit
  portals/               tenant and landlord experiences
  shared/
    domain/              enums, invariants and typed IDs
    api/                 public module interfaces
    data/                repositories and query keys
    events/              activity and automation events
    documents/           document relationship adapter
    permissions/         rental capability checks
    ui/                  rental-only shared UI
```

Each feature folder owns `domain`, `data`, `api`, `components`, `pages`, and `tests` as needed. Imports across features go through exported service contracts, not internal files.

## Database architecture

Use new rental-owned tables with UUID primary keys, `organisation_id`, optional `branch_id`, timestamps, creator/updater IDs, and optimistic version fields. Recommended core tables:

- `rental_portfolios`
- `rental_properties`
- `rental_units`
- `rental_property_landlords`
- `rental_vacancies`
- `rental_vacancy_listings` (links a vacancy to `private_listings`)
- `rental_lead_links` (links existing lead/contact records to vacancy/unit)
- `rental_applications`
- `rental_application_household_members`
- `rental_screening_checks`
- `rental_tenancies`
- `rental_tenancy_parties`
- `rental_leases`
- `rental_charges`
- `rental_payments`
- `rental_payment_allocations`
- `rental_maintenance_requests`
- `rental_maintenance_quotes`
- `rental_inspections`
- `rental_renewals`
- `rental_notices`
- `rental_entity_documents` (typed relationship to shared documents)
- `rental_activity_events` or a typed projection into the existing activity store

Do not duplicate people. Landlord, applicant and tenant are rental roles linked to existing canonical contact/client records. Preserve submitted application snapshots for audit without creating another editable contact master.

All lifecycle transitions must use database functions/RPCs or server-side transactional commands. In particular, application approval → tenancy creation and tenancy close → vacancy creation must be atomic and idempotent.

## Sales isolation contract

This is a blocking acceptance gate for every phase.

- No destructive alteration or semantic repurposing of Sales columns or status enums.
- No Sales query receives rental rows unless it already explicitly asks for them.
- `private_listings` remains shared, but a rental listing is only created through `rental_vacancy_listings` and retains `listing_category = rental`.
- New RLS policies target rental tables. Changes to shared-table policies require explicit Sales regression tests.
- Rental feature flags default off and are enabled by organisation in staging before production.
- Rental routes are lazy-loaded and must not add rental bundles to initial Sales navigation.
- Shared components may receive backwards-compatible additions only; rental-specific behavior stays in rental wrappers/adapters.
- Database migrations are expand-first: create nullable/new structures, backfill, verify, switch reads, then retire compatibility paths in a later release.
- Before promotion, run the existing Sales listing, lead, transaction, document, portal and permission suites plus a route/bundle smoke test.

## Performance contract

Targets apply on a representative mid-range mobile device and normal 4G after authentication:

- Rentals route shell visible: p75 ≤ 1.0 s after navigation.
- Primary operational content: p75 ≤ 1.5 s; p95 ≤ 2.5 s.
- Route change feedback: ≤ 100 ms.
- Search/filter response for cached data: ≤ 100 ms; server-backed p95 ≤ 500 ms.
- Mutation acknowledgement: ≤ 300 ms using optimistic UI where safe; background completion may continue visibly.
- No single initial page query may fetch documents, full activity history, portal sync history, or all child rows.
- No unbounded list queries. Cursor pagination is mandatory.
- No `select *` in production rental repositories.
- Dashboard uses purpose-built summary RPCs/materialized projections, not many client-side aggregate queries.
- Query budgets: shell 1 bootstrap request; primary page ≤ 2 critical requests; secondary panels lazy-load independently.
- Add indexes for every RLS tenant key and high-frequency filter/join: organisation, branch, status, assigned manager, property, unit, vacancy, tenancy and due date.
- Instrument route timings, query durations, payload sizes, errors and Web Vitals by module and organisation cohort.

## Delivery phases

### Phase 0 — Foundation and safety rails

**Objective:** Establish the rental domain, module boundaries, isolation contract and performance baseline before adding operational UI.

**Reuse:** Rental workspace guard/routes, module availability flags, permission registry, query scope, Supabase client, shared UI shell, activity/document/notification contracts.

**Database:** Create foundational enums/tables for portfolios, properties, units, parties, vacancies and typed relationships. Add indexes, audit columns and RLS helper functions. Do not migrate Sales data yet.

**Backend/API:** Introduce repositories and command/query services. Define idempotency keys, event envelope, typed errors, query budgets and performance telemetry.

**Frontend:** Create the lazy-loaded Rentals shell and module route manifests. Replace direct page-level data access with feature APIs as pages are touched.

**Components:** Rental page shell, scope banner, module error boundary, skeleton states and shared status presentation.

**Permissions/RLS:** Define capabilities such as `rentals.portfolio.view/manage`, `rentals.applications.review`, `rentals.tenancies.manage`, `rentals.collections.manage`, and `rentals.maintenance.manage`. Enforce organisation and branch ownership in SQL.

**Automations:** None beyond event/outbox infrastructure.

**Migration:** Expand-only migration; seed no production records. Capture current rental listing counts and compatibility snapshot.

**Tests:** Schema constraints, RLS matrix, capability resolution, module import boundaries, Sales route/query snapshots, lazy-bundle assertion and baseline performance measurements.

**Dependencies:** None.

**Complexity:** Large.

### Phase 1 — Portfolio, properties, units and vacancies

**Objective:** Let an agency build its managed portfolio and market a vacant unit.

**Reuse:** Existing listing create/detail/media/publication/syndication capabilities, canonical contacts/clients, shared document and activity services.

**Database:** Complete portfolio/property/unit/landlord/vacancy tables and `rental_vacancy_listings`. Add unit and vacancy transition constraints.

**Backend/API:** Portfolio CRUD, unit availability query, vacancy commands, listing projection adapter, bulk summary endpoints and dashboard projection v1.

**Frontend routes/pages:** `/agent/rentals/dashboard`, `/portfolio/properties`, `/portfolio/properties/:id`, `/portfolio/landlords`, `/lettings/vacancies`, `/lettings/vacancies/:id`, plus create flow.

**Components:** Operational snapshot, property/unit tables, property workspace tabs, vacancy wizard, vacancy status bar and next-action panel.

**Permissions/RLS:** Portfolio manager assignment and branch visibility; separate view/manage/publish rights.

**Automations:** Vacancy created, availability changed and listing publish events.

**Migration:** Backfill existing marked rental listings into property/unit/vacancy records with a dry-run report and reversible link table. Do not rewrite Sales listings.

**Tests:** CRUD/constraints, listing projection idempotency, portal publish adapters, RLS, mobile flows, dashboard query count, Sales listing regression and real-data migration rehearsal.

**Dependencies:** Phase 0.

**Complexity:** Large.

### Phase 2 — Rental leads, applications and screening

**Objective:** Take a rental enquiry through a submitted, reviewed and approved application.

**Reuse:** Existing CRM/contact records, lead activity, public intake links, document requirements/uploads, consent and notification infrastructure.

**Database:** Rental lead link, applications, household members, consent snapshots and screening checks. Add immutable submission snapshot/version.

**Backend/API:** Extend CRM with `lead_type = rental` and rental stages; secure applicant-link service; autosave drafts; completeness calculation; manual screening; approve/decline commands.

**Frontend routes/pages:** Rental leads, applications index/workspace and public applicant onboarding route.

**Components:** Rental pipeline, applicant form sections, autosave status, document checklist, screening panel, affordability presentation and decision dialog.

**Permissions/RLS:** Applicants see only token-scoped applications; agents see assigned/branch records; final approval is restricted and always human-triggered.

**Automations:** Application invitation, autosave recovery, missing information request, submission, reviewer alert and decision notification.

**Migration:** Adapt current rental application drafts into structured applications where reliable; retain original payload snapshots.

**Tests:** Public-token isolation, consent evidence, document access, autosave/retry, stage transitions, human-approval invariant, CRM Sales pipeline regression, accessibility and mobile completion.

**Dependencies:** Phase 1 vacancy/unit model.

**Complexity:** Large.

### Phase 3 — Conversion, lease, move-in and tenancy

**Objective:** Convert an approved applicant into an active tenancy without duplication or partial state.

**Reuse:** Shared contacts, documents, activity, signing/upload patterns and notification delivery.

**Database:** Tenancies, tenancy parties and leases; unique active-tenancy-per-unit constraint; lease and move-in state fields.

**Backend/API:** Atomic idempotent `create_tenancy_from_application`; lease upload/link; deposit/first-rent readiness; activate tenancy; preserve all application relationships.

**Frontend routes/pages:** Tenancies index/workspace and lease/move-in tabs.

**Components:** Conversion review, tenancy header, party panel, lease summary, move-in checklist and lifecycle timeline.

**Permissions/RLS:** Separate application approval, lease management and tenancy activation capabilities.

**Automations:** Lease action reminders, move-in readiness notifications and activation event.

**Migration:** Reconcile current lease workflow models; do not infer active tenancies without explicit verification.

**Tests:** Atomic conversion rollback, repeat-command idempotency, uniqueness constraints, document preservation, unit/vacancy state synchronization and concurrency tests.

**Dependencies:** Phase 2.

**Complexity:** Large.

### Phase 4 — Collections and basic arrears

**Objective:** Generate rent charges, record and allocate payments, and identify overdue balances. Trust accounting remains excluded.

**Reuse:** Currency formatting, audit/activity, notifications and existing financial UI primitives only; do not reuse Sales transaction accounting semantics.

**Database:** Charges, payments and allocations with append-only financial events, reversal support, due dates and allocation constraints.

**Backend/API:** Idempotent monthly charge generation, payment capture/allocation, balance and arrears projections, collections summary RPC.

**Frontend routes/pages:** Collections dashboard, tenancy ledger and payment capture flow.

**Components:** Collection KPIs, arrears queue, ledger, allocation/reversal dialogs and audit trail.

**Permissions/RLS:** View finance, capture payment, reverse payment and export are distinct capabilities; tenant portal access is tenancy-bound.

**Automations:** Monthly charge job, due reminder, overdue event and manager escalation with deduplication.

**Migration:** No trust/bank-ledger migration. Import opening balances only via an auditable one-time tool.

**Tests:** Monetary precision, allocation invariants, reversals, duplicate cron runs, timezone boundaries, RLS and reconciliation totals.

**Dependencies:** Active tenancy from Phase 3.

**Complexity:** Large.

### Phase 5 — Maintenance and inspections

**Objective:** Run the daily property-management workflows from request to completion and schedule tenancy inspections.

**Reuse:** Contacts/partners, uploads/documents, appointments/calendar, activity and notification channels.

**Database:** Maintenance requests/quotes and inspections with typed property/unit/tenancy relationships.

**Backend/API:** Request triage, assignment, quote/approval flow, status transitions, appointment scheduling and inspection report submission.

**Frontend routes/pages:** Maintenance and inspections indexes/workspaces; tenant request submission.

**Components:** Priority queue, request workspace, quote comparison, landlord approval, inspection checklist and photo uploader.

**Permissions/RLS:** Tenant submission is tenancy-bound; landlord approval is property-role-bound; contractors get narrow expiring access where required.

**Automations:** New request, urgent escalation, quote approval, appointment and overdue-work notifications.

**Migration:** Map only verified existing listing inspection evidence; retain files through shared document links.

**Tests:** Role/token isolation, workflow transitions, file access, urgent escalation, mobile photo capture, offline/retry behavior and list performance.

**Dependencies:** Phase 3; collections not required.

**Complexity:** Medium–Large.

### Phase 6 — Tenant and landlord portals

**Objective:** Provide secure self-service visibility without expanding internal workspace permissions.

**Reuse:** Existing client portal access patterns, secure token routes, notification preferences, documents and shared portal shell.

**Database:** Portal access bindings and audit events only where existing generic tables cannot safely represent rental roles.

**Backend/API:** Purpose-built least-privilege portal queries; no direct reuse of broad internal list endpoints.

**Frontend routes/pages:** Tenant Home/Payments/Maintenance/Documents and Landlord Portfolio/Payment Status/Maintenance/Inspections/Documents.

**Components:** Mobile-first portal cards, balance summary, document centre and status timelines.

**Permissions/RLS:** Explicit party-to-tenancy/property relationships; deny-by-default portal policies; revoked access takes effect immediately.

**Automations:** Invitation, access recovery and relevant workflow notifications.

**Migration:** Link verified current portal users; never infer landlord access from a matching email alone.

**Tests:** Cross-tenant and cross-landlord isolation, revoked links, document leakage, mobile/accessibility, low-bandwidth payload tests and portal audit logs.

**Dependencies:** Phases 3–5 for useful data.

**Complexity:** Large.

### Phase 7 — Renewal, notice and exit

**Objective:** Complete the lifecycle from lease expiry through renewal or move-out back to vacancy.

**Reuse:** Tasks/appointments, notifications, documents, inspections and activity.

**Database:** Renewals and notices; exit fields/checklists; new lease version linkage.

**Backend/API:** Expiry queue, intent capture, renewal decision, new lease linkage, notice, close tenancy and atomic unit-to-vacancy transition.

**Frontend routes/pages:** Expiry/renewal queue and renewal/exit tabs within tenancy.

**Components:** Deadline queue, intention capture, renewal terms, move-out checklist and close confirmation.

**Permissions/RLS:** Manager-only tenancy closure; portal users may submit intent/notice but cannot alter canonical lifecycle state directly.

**Automations:** 120/90/60/30-day expiry reminders, renewal follow-ups, notice acknowledgements and move-out tasks.

**Migration:** Generate expiry candidates from verified active leases; require review before automation starts.

**Tests:** Date/timezone rules, duplicate reminders, renewal vs exit exclusivity, atomic close/vacancy creation and full lifecycle E2E.

**Dependencies:** Phases 3 and 5.

**Complexity:** Medium–Large.

### Phase 8 — Operational hardening and refinement

**Objective:** Make the complete module fast, observable, resilient and safe for wider production rollout.

**Reuse:** Existing observability, deployment checks, error boundaries and notification monitoring.

**Database:** Tune indexes from production-like query plans; add summary projections/queues where measured data supports them.

**Backend/API:** Retry/dead-letter handling, reconciliation jobs, cache policy, rate limits and operational health endpoints.

**Frontend:** Finish empty/error/recovery states, command palette actions, keyboard/accessibility support and mobile polish.

**Components:** Operational health panel and failed-job recovery tools.

**Permissions/RLS:** Final penetration-style RLS matrix and privileged-action audit review.

**Automations:** Turn on cohorts gradually with delivery health, dedupe and suppression monitoring.

**Migration:** Remove temporary JSON read fallbacks only after parity evidence and a full rollback window.

**Tests:** End-to-end golden path, load/concurrency, query plans, payload/bundle budgets, chaos/retry, accessibility, browser/mobile matrix, complete Sales regression and production rollback rehearsal.

**Dependencies:** All required MVP phases.

**Complexity:** Medium–Large.

## Recommended release sequence

Do not release the eight phases as one large launch. Use vertical slices and cohorts:

1. Internal/demo organisation.
2. One sandbox rental agency with no production collections.
3. One production pilot agency: portfolio through tenancy.
4. Enable collections only after ledger reconciliation passes for two consecutive cycles.
5. Enable portals for a small landlord/tenant cohort.
6. Broaden rollout only while performance and error budgets remain green.

Each slice must support rollback by disabling its feature flag without corrupting records already written.

## Definition of done

The MVP is done only when the complete golden path in the product mapping passes in staging and a pilot cohort: property → unit → vacancy → rental lead → application/documents → screening/human approval → tenancy/lease/move-in → monthly charge/payment/arrears → maintenance → inspection → renewal or notice → closed tenancy → new vacancy.

In addition:

- Sales regression suite is green with no changed Sales record counts or route behavior.
- Rental RLS isolation passes organisation, branch, assigned-user, tenant and landlord matrices.
- Performance targets pass against production-sized seed data.
- All write commands are idempotent and audited.
- Mobile golden paths pass for applicant, tenant, landlord and property manager.
- Runbooks exist for failed automations, payment corrections, access revocation and rollback.

## First implementation milestone

The first coding milestone should be Phase 0 plus a narrow Phase 1 vertical slice:

`Create portfolio → property → unit → vacancy → rental listing projection → see vacancy on Rentals dashboard`

That slice proves the new domain model, shared-listing adapter, Sales isolation, RLS, performance approach and modular folder structure before the more sensitive applicant and financial workflows are introduced.
