# Arch9 Rentals — Full Phased Build Roadmap

## 1. Delivery model

Arch9 Rentals should be delivered as a sequence of complete vertical slices. Database, backend, frontend and tests progress together; the backend stays approximately one slice ahead of the UI.

Every phase must produce a deployable result. A phase is complete only when its database rules, RLS, backend contract, UI states, mobile behavior, observability, tests, migration evidence and rollback control are complete.

### Parallel workstreams

| Workstream | Responsibility |
|---|---|
| Platform and architecture | Module boundaries, shared contracts, events, jobs, feature flags, observability |
| Data and backend | Schema, migrations, RLS, commands, queries, integrations, reconciliation |
| Product frontend | Routes, pages, workspaces, forms, mobile and accessibility |
| Quality and release | Automation, performance, Sales regression, migration rehearsal, staging and rollout |

### Phase execution pattern

Each phase follows the same order:

1. Confirm domain contract and acceptance examples.
2. Write migration, constraints, indexes and RLS.
3. Implement command/query contracts and telemetry.
4. Implement the smallest complete UI.
5. Add unit, integration, RLS, browser and Sales regression tests.
6. Test with production-sized staging data.
7. Release behind an organisation/module flag.
8. Observe, reconcile and approve the next phase.

## 2. Permanent release gates

These apply to every phase and cannot be deferred.

### Sales isolation gate

- Sales routes, status meanings and default queries are unchanged.
- Rental rows cannot appear in Sales results without an explicit category request.
- No shared-table RLS change ships without Sales and Rentals policy tests.
- Rental route chunks are excluded from the initial Sales bundle.
- Existing Sales listing, lead, document, transaction, portal and permission tests pass.
- Shared components remain backwards-compatible; rental rules live in adapters or rental modules.

### Performance gate

- Route feedback within 100 ms.
- Rental shell p75 within 1.0 seconds after navigation.
- Primary operational content p75 within 1.5 seconds and p95 within 2.5 seconds on the agreed mobile profile.
- Maximum two critical page-data requests after bootstrap.
- No unbounded reads or production `select *`.
- Cursor pagination for operational lists.
- Secondary data, documents, activity and large counts load independently.
- Query plans use indexes for organisation, branch, assignment, status and relationship filters.
- Bundle, payload, query-count and Web Vitals budgets are checked in CI.

### Security and integrity gate

- Organisation and branch RLS matrices pass.
- Public and portal access is relationship-bound, scoped and revocable.
- Sensitive commands are transactional, idempotent and audited.
- State transitions are enforced server-side.
- Financial data is append-only with controlled corrections.
- Migrations are expand-first and have a tested rollback/disable path.

## 3. Phase map

## Programme A — Discovery, architecture and protection

### Phase 0 — Codebase and production baseline

**Outcome:** A verified map of current Sales, rental scaffolding and shared infrastructure.

**Backend/data:** Inventory tables, RLS, functions, storage buckets, scheduled jobs and integration dependencies. Capture current rental-marked listing counts and JSON field usage.

**Frontend:** Inventory rental routes, placeholders, direct Supabase calls, shared components, mobile routes and bundle boundaries.

**Quality:** Record current Sales golden paths, page/query timings, bundle sizes and known performance failures.

**Exit gate:** Approved current-state map, baseline metrics and an explicit list of shared objects that Rentals may reuse.

**Complexity:** Medium.

### Phase 1 — Domain language and ownership contract

**Outcome:** Canonical definitions for Party, Property, Unit, Portfolio, Vacancy, Application, Lease and Tenancy.

**Backend/data:** Define IDs, ownership, invariants, statuses, transition maps and relationships. Decide which module owns each write.

**Frontend:** Define route names, workspace vocabulary and status labels.

**Quality:** Executable domain-contract tests prevent contradictory statuses and imports across module internals.

**Exit gate:** No unresolved ambiguity between property/listing, vacancy/listing, applicant/tenant or lease/tenancy.

**Complexity:** Medium.

### Phase 2 — Rentals module boundary

**Outcome:** A lazy-loaded `src/modules/rentals` bounded module.

**Backend:** Create rental command/query interfaces, repository conventions and error contracts.

**Frontend:** Rental shell, route manifest, module error boundary, skeletons and feature gates.

**Quality:** Import-boundary, lazy-bundle and Sales bundle regression tests.

**Exit gate:** Opening Sales does not load Rentals; opening Rentals renders an isolated empty shell.

**Complexity:** Medium.

### Phase 3 — Rental capabilities and RLS foundation

**Outcome:** Rental-specific authorization replaces long-term reliance on broad Sales permissions.

**Backend/data:** Add capability catalogue, role mappings and reusable organisation/branch/assigned-user RLS helpers.

**Frontend:** Capability gates for navigation, pages, actions and field visibility.

**Quality:** Principal, branch manager, property manager, agent, finance clerk and read-only matrices.

**Exit gate:** UI and database independently reject unauthorized rental access.

**Complexity:** Large.

### Phase 4 — Event, outbox and job foundation

**Outcome:** Reliable asynchronous work without coupling domain transactions to notifications and integrations.

**Backend/data:** Transactional event outbox, consumer receipts, idempotency keys, retry/dead-letter state and job health.

**Frontend:** Operational failure/retry presentation reserved for later admin use.

**Quality:** Duplicate delivery, retry, poison event and transaction rollback tests.

**Exit gate:** A committed domain event is processed at least once but produces exactly-once business effects.

**Complexity:** Large.

### Phase 5 — Performance and observability foundation

**Outcome:** Speed is measurable before major features are added.

**Backend:** Query duration, payload size, error and job telemetry; correlation IDs and slow-query reporting.

**Frontend:** Route, critical-content and interaction timing; module error reporting.

**Quality:** CI budgets for bundle size, query count, payload and synthetic route performance.

**Exit gate:** Baselines appear in a repeatable report and regressions fail the release gate.

**Complexity:** Medium.

## Programme B — Canonical property platform

### Phase 6 — Canonical Party relationships

**Outcome:** Landlords, applicants, tenants and contractors reuse canonical people/organisation records.

**Backend/data:** Create typed party-role relationships without duplicating the CRM master. Define immutable workflow snapshots.

**Frontend:** Shared party selector/create drawer with role-specific sections.

**Quality:** Deduplication, organisation scoping, role coexistence and snapshot tests.

**Exit gate:** One person can safely be a seller, landlord and tenant without merged workflow data.

**Complexity:** Large.

### Phase 7 — Canonical rental Property model

**Outcome:** Managed physical properties exist independently of listings.

**Backend/data:** `rental_properties`, addresses, types, managers, mandates and document links.

**Frontend:** Property index, create/edit flow and overview workspace.

**Quality:** Address normalization, RLS, pagination, mobile and empty/error states.

**Exit gate:** An agency can create, find and manage a property without creating a listing.

**Complexity:** Medium–Large.

### Phase 8 — Unit model and occupancy invariants

**Outcome:** A Unit is the canonical rentable object.

**Backend/data:** `rental_units`, physical facts, target rent, deposit, availability and status history. Enforce one active tenancy per unit.

**Frontend:** Unit list/cards, create/edit drawer and status history.

**Quality:** Multi-unit and single-house cases, concurrency and index performance.

**Exit gate:** A property can contain one or many independently managed units.

**Complexity:** Medium.

### Phase 9 — Portfolio and management assignment

**Outcome:** Properties can be grouped and assigned operationally.

**Backend/data:** `rental_portfolios`, manager assignments and portfolio summary query.

**Frontend:** Portfolio index/detail, assignment and bulk filters.

**Quality:** Reassignment, branch boundaries, counts and pagination.

**Exit gate:** Portfolio views show accurate property/unit totals without N+1 queries.

**Complexity:** Medium.

### Phase 10 — Landlord relationships and mandates

**Outcome:** Ownership and management authority are explicit.

**Backend/data:** Property-party ownership shares, primary contact, mandate dates/fees and authority status.

**Frontend:** Landlord workspace, property relationships and mandate summary.

**Quality:** Multiple landlords, changed ownership, expired mandates and access rules.

**Exit gate:** No property can be marketed without the required landlord/mandate readiness.

**Complexity:** Medium–Large.

### Phase 11 — Shared rental documents and activity

**Outcome:** Every rental entity can use Arch9 documents and activity without parallel systems.

**Backend/data:** Typed rental document relationships and event-to-activity projection adapter.

**Frontend:** Reusable Documents and Activity tabs that lazy-load.

**Quality:** Access inheritance, deleted/replaced file behavior, audit immutability and payload budgets.

**Exit gate:** Property, unit and landlord workspaces show secure unified evidence and history.

**Complexity:** Medium.

## Programme C — Vacancy and marketing

### Phase 12 — Vacancy domain and state machine

**Outcome:** Availability is managed independently of marketing listings.

**Backend/data:** `rental_vacancies`, status transitions, available date, rent/deposit terms and unit relationship.

**Frontend:** Vacancy index, create flow and overview workspace.

**Quality:** Invalid transitions, duplicate open vacancy prevention, branch scope and concurrency.

**Exit gate:** A unit can enter and progress through the vacancy lifecycle safely.

**Complexity:** Medium.

### Phase 13 — Rental listing projection adapter

**Outcome:** A Vacancy can create/update a rental-marked shared listing without changing Sales semantics.

**Backend/data:** `rental_vacancy_listings`, projection mapping and idempotent synchronization with `private_listings`.

**Frontend:** Marketing tab uses existing listing/media primitives through a rental adapter.

**Quality:** Field mapping, repeated sync, drift detection and full Sales listing regression.

**Exit gate:** Rental projection round-trips correctly and never enters default Sales results.

**Complexity:** Large.

### Phase 14 — Rental media and listing readiness

**Outcome:** Property media and rental copy can be prepared efficiently.

**Backend:** Reuse media storage; calculate rental-specific readiness blockers.

**Frontend:** Media manager, copy, features, visibility and readiness checklist.

**Quality:** File security, upload recovery, mobile images and large-media performance.

**Exit gate:** A user can prepare a portal-ready rental listing from a Vacancy.

**Complexity:** Medium.

### Phase 15 — Portal syndication

**Outcome:** Rental listings publish through existing Property24/Private Property adapters.

**Backend:** Rental payload adapters, preview, publish, status sync, reconciliation and failures.

**Frontend:** Syndication preview, blockers, publish action, status and recovery.

**Quality:** Sandbox contracts, duplicate publish prevention, update/withdraw flows and Sales adapter regression.

**Exit gate:** A pilot rental listing can be published, updated and withdrawn with reconciled status.

**Complexity:** Large.

### Phase 16 — Rental operational dashboard v1

**Outcome:** Managers see portfolio and vacancy operations immediately.

**Backend:** One purpose-built summary RPC/projection for managed, occupied, vacant, notice and near-term actions.

**Frontend:** Fast shell, snapshot cards, needs-attention queue and upcoming list.

**Quality:** Query count, production-sized data, scope accuracy and cache invalidation.

**Exit gate:** Dashboard critical content meets the performance contract.

**Complexity:** Medium–Large.

### Phase 17 — Existing rental listing migration

**Outcome:** Existing marked rental listings are linked to structured property/unit/vacancy records.

**Backend/data:** Dry-run classifier, ambiguity report, backfill, link creation and reconciliation.

**Frontend:** Admin review for ambiguous records.

**Quality:** Production snapshot rehearsal, row-count reconciliation and rollback proof.

**Exit gate:** No automatic conversion of ambiguous records and no modified Sales records.

**Complexity:** Large.

## Programme D — Rental CRM and viewings

### Phase 18 — Rental lead classification

**Outcome:** Existing CRM supports rental enquiries without a second CRM.

**Backend/data:** Rental lead type, vacancy/unit links, assigned agent and source metadata.

**Frontend:** Rental lead index and lead context within Vacancy.

**Quality:** Sales lead pipeline regression, classification changes and scoping.

**Exit gate:** Rental and Sales leads coexist without polluting each other's default pipelines.

**Complexity:** Medium–Large.

### Phase 19 — Rental pipeline and lead workspace

**Outcome:** Agents manage New → Contacted → Viewing → Application stages.

**Backend:** Rental transition service and pipeline summary query.

**Frontend:** Pipeline, lead workspace, next actions and quick contact tools.

**Quality:** Transition rules, optimistic updates, filters and mobile usage.

**Exit gate:** A portal enquiry can be qualified and progressed operationally.

**Complexity:** Medium.

### Phase 20 — Viewing scheduling

**Outcome:** Rental viewings use the shared appointment system.

**Backend:** Rental appointment type, participants, vacancy link, reminders and outcomes.

**Frontend:** Schedule/reschedule/cancel actions and rental calendar view.

**Quality:** Timezones, conflicting appointments, reminders and Sales appointment regression.

**Exit gate:** Viewing outcomes update the rental pipeline idempotently.

**Complexity:** Medium.

## Programme E — Applications and screening

### Phase 21 — Application domain and draft persistence

**Outcome:** A structured application belongs to an applicant and vacancy/unit.

**Backend/data:** Applications, household members, versions, completion calculation and autosave.

**Frontend:** Internal create/send action and application index.

**Quality:** Draft concurrency, autosave retry, completion rules and RLS.

**Exit gate:** A recoverable application draft can be created and resumed.

**Complexity:** Large.

### Phase 22 — Secure public applicant access

**Outcome:** Applicants receive revocable, scoped onboarding links.

**Backend:** Hashed tokens, expiry, rotation, rate limits and access auditing.

**Frontend:** Public mobile-first shell, identity/recovery and session-expiry states.

**Quality:** Token leakage, cross-application access, expiry and abuse controls.

**Exit gate:** Public access exposes only the intended application.

**Complexity:** Large.

### Phase 23 — Applicant form journey

**Outcome:** Personal, employment, income and rental information can be completed cleanly.

**Backend:** Section validation, canonical party update rules and immutable submitted snapshot.

**Frontend:** Progressive form sections, autosave indicator, validation summary and mobile keyboard/accessibility behavior.

**Quality:** Partial data, reconnect/retry, accessibility and device/browser matrix.

**Exit gate:** Representative applicants complete the journey without agency assistance.

**Complexity:** Large.

### Phase 24 — Applicant documents

**Outcome:** Required evidence is requested, uploaded, reviewed and tracked.

**Backend:** Dynamic requirements, secure uploads, scanning hook, review state and document events.

**Frontend:** Checklist, upload, replace, preview and missing-document guidance.

**Quality:** File access, malicious files, upload recovery and large-file performance.

**Exit gate:** Document completion and review status are accurate and auditable.

**Complexity:** Medium–Large.

### Phase 25 — Consent and submission

**Outcome:** Privacy, credit and identity/FICA consent is evidenced at submission.

**Backend:** Versioned wording, consent evidence, immutable submission and idempotent submit command.

**Frontend:** Review, declaration, consent and submission receipt.

**Quality:** Wording/version evidence, repeat submission and incomplete blocking.

**Exit gate:** Every submitted application has a verifiable snapshot and consent record.

**Complexity:** Medium.

### Phase 26 — Application review workspace

**Outcome:** Property managers review the full application without loading unnecessary data.

**Backend:** Purpose-built review query with lazy document/activity endpoints.

**Frontend:** Overview, Applicant, Documents, Screening and Activity tabs; information request action.

**Quality:** Query/payload budgets, authorization, mobile review and stale-version handling.

**Exit gate:** Review critical content meets the performance contract.

**Complexity:** Medium–Large.

### Phase 27 — Manual screening

**Outcome:** Identity, FICA, credit, affordability, employment and references are recorded manually.

**Backend/data:** Screening checks, provider-neutral results, evidence, expiry and reviewer decisions.

**Frontend:** Screening panel, affordability calculation and needs-review indicators.

**Quality:** Calculation cases, status transitions, evidence access and no automatic final approval.

**Exit gate:** An application can reach Ready for Review with a complete audit trail.

**Complexity:** Medium–Large.

### Phase 28 — Approve, decline and withdraw

**Outcome:** Authorized humans make and communicate final decisions.

**Backend:** Decision command, reason/evidence, optimistic version check and domain events.

**Frontend:** Review confirmation, decline reason, withdrawal and outcome states.

**Quality:** Double decisions, stale reviewers, capability enforcement and notification retry.

**Exit gate:** Final approval cannot be produced by screening automation alone.

**Complexity:** Medium.

## Programme F — Tenancy and lease

### Phase 29 — Atomic application-to-tenancy conversion

**Outcome:** Approved application becomes a tenancy without duplicated parties or partial records.

**Backend/data:** Tenancy and tenancy-party tables; idempotent transactional conversion command.

**Frontend:** Conversion review and result receipt.

**Quality:** Rollback, retry, concurrent conversion, document/activity preservation and unit conflict.

**Exit gate:** Repeating the same command produces one tenancy and one lease draft.

**Complexity:** Large.

### Phase 30 — Lease record and versions

**Outcome:** Lease terms and documents are canonical and versioned.

**Backend/data:** Leases, dates, rent, deposit, escalation, occupation and superseded versions.

**Frontend:** Lease tab, upload/link, terms editor and status presentation.

**Quality:** Date validation, changes after signature, document linkage and access.

**Exit gate:** The active lease version is unambiguous and auditable.

**Complexity:** Medium–Large.

### Phase 31 — Lease signing integration boundary

**Outcome:** Upload/manual signed state works now; e-signature can be added later.

**Backend:** Provider-neutral signing interface, manual evidence path and signing events.

**Frontend:** Awaiting tenant/landlord, signed and failed/recovery states.

**Quality:** Signer identity, partial signatures, callback duplication and manual override audit.

**Exit gate:** Lease can reach Signed without binding the domain to one signing provider.

**Complexity:** Medium.

### Phase 32 — Deposit and first-rent readiness

**Outcome:** Move-in readiness records obligations without pretending to be trust accounting.

**Backend:** Required amount/status records and evidence links; later ledger integration point.

**Frontend:** Readiness checklist and exception capture.

**Quality:** Partial payment/readiness, waiver permission and audit.

**Exit gate:** Activation blockers are explicit and server-enforced.

**Complexity:** Medium.

### Phase 33 — Incoming inspection and move-in

**Outcome:** Condition, keys and occupation handover are recorded.

**Backend:** Incoming inspection link, move-in checklist and completion event.

**Frontend:** Mobile checklist, photos, notes, signatures/acknowledgement and handover summary.

**Quality:** Offline/retry, media security and incomplete checklist rules.

**Exit gate:** Move-in evidence is complete and linked to the tenancy.

**Complexity:** Medium–Large.

### Phase 34 — Tenancy activation

**Outcome:** A tenancy becomes Active and the unit becomes Occupied atomically.

**Backend:** Activation command checks signed lease and readiness, closes vacancy and updates projections.

**Frontend:** Activation review, blockers and success state.

**Quality:** Concurrent activation, rollback, unit status and vacancy/listing closure.

**Exit gate:** No unit can have two active tenancies or remain marketed incorrectly.

**Complexity:** Large.

### Phase 35 — Tenancy operational workspace

**Outcome:** Managers operate the tenancy from one fast workspace.

**Backend:** Primary summary query; lazy lease, ledger, maintenance, inspection, documents and activity queries.

**Frontend:** Overview, Lease, Payments, Maintenance, Inspections, Documents and Activity tabs.

**Quality:** Query budgets, deep links, mobile, permission-specific actions and error isolation.

**Exit gate:** One slow secondary panel cannot block the tenancy overview.

**Complexity:** Medium–Large.

## Programme G — Collections and arrears

### Phase 36 — Rental financial model

**Outcome:** A bounded subledger model is agreed before money is recorded.

**Backend/data:** Charge, payment, allocation, adjustment and reversal invariants; currency/date rules.

**Frontend:** Financial terminology and permission/action design.

**Quality:** Accounting examples and reconciliation contract tests.

**Exit gate:** Opening balance, overpayment, partial payment, reversal and credit behavior are unambiguous.

**Complexity:** Large.

### Phase 37 — Charges and schedules

**Outcome:** Rent and approved recurring charges are generated idempotently.

**Backend:** Charge tables, lease schedule, monthly generator and duplicate-run protection.

**Frontend:** Charge schedule and tenancy charge list.

**Quality:** Month ends, leap years, timezone, escalation and repeat-job tests.

**Exit gate:** Re-running a period never creates duplicate rent.

**Complexity:** Large.

### Phase 38 — Payment capture

**Outcome:** Authorized users record incoming payments with evidence.

**Backend:** Payment records, references, method, received date and immutable audit.

**Frontend:** Fast payment capture and receipt state.

**Quality:** Duplicate references, precision, permissions and retry.

**Exit gate:** Payment capture is safe and does not silently allocate funds.

**Complexity:** Medium–Large.

### Phase 39 — Allocation and balances

**Outcome:** Payments allocate to charges and produce trustworthy balances.

**Backend:** Allocation command, automatic oldest-due option, unapplied balance and balance projection.

**Frontend:** Allocation review, ledger and paid/part-paid/outstanding states.

**Quality:** Partial, split, overpayment, concurrent allocation and reconciliation.

**Exit gate:** Ledger totals always satisfy payment = allocated + unapplied.

**Complexity:** Large.

### Phase 40 — Corrections and reversals

**Outcome:** Mistakes are corrected without deleting financial history.

**Backend:** Reversal/adjustment commands, reasons, approvals and compensating entries.

**Frontend:** Restricted reversal flow and audit view.

**Quality:** Closed-period behavior, repeat reversal and permission segregation.

**Exit gate:** No financial row requires destructive editing.

**Complexity:** Medium–Large.

### Phase 41 — Arrears and collections dashboard

**Outcome:** Managers know who owes what and what needs action.

**Backend:** Aging projection, collection summary RPC and scope-aware queues.

**Frontend:** Rent roll, collected, outstanding, collection %, aging and next actions.

**Quality:** Totals, large portfolios, caching and query plans.

**Exit gate:** Dashboard reconciles to tenancy ledgers and meets performance targets.

**Complexity:** Large.

### Phase 42 — Financial imports and reconciliation

**Outcome:** Opening balances and external payment data can be imported safely.

**Backend:** Staged import, validation, preview, idempotency and reconciliation report.

**Frontend:** Admin import review and exception resolution.

**Quality:** Dirty input, duplicate files, rollback and totals.

**Exit gate:** No import posts before preview totals and exceptions are approved.

**Complexity:** Large.

### Phase 43 — Collection reminders and escalations

**Outcome:** Reminders reduce manual chasing without harassment or duplicates.

**Backend:** Policy-based triggers, dedupe, suppression, preferences and escalation events.

**Frontend:** Reminder history and manual suppress/resend controls.

**Quality:** Duplicate job runs, paid-after-queue, channel preference and timezone.

**Exit gate:** A paid tenant is not sent an overdue reminder from stale state.

**Complexity:** Medium–Large.

## Programme H — Maintenance and inspections

### Phase 44 — Maintenance request intake

**Outcome:** Staff and tenants can lodge requests against the correct unit/tenancy.

**Backend:** Request, category, priority, description, media and status.

**Frontend:** Internal and mobile tenant intake; urgent guidance.

**Quality:** Access, upload recovery, duplicate requests and mobile.

**Exit gate:** Every request is scoped, acknowledged and visible operationally.

**Complexity:** Medium.

### Phase 45 — Maintenance triage and assignment

**Outcome:** Managers prioritize and assign work.

**Backend:** Triage, assignment, SLA timestamps and contractor party link.

**Frontend:** Maintenance queue, filters, workspace and assignment actions.

**Quality:** Priority changes, reassignment, branch scope and queue performance.

**Exit gate:** Urgent requests surface immediately without loading the full history.

**Complexity:** Medium.

### Phase 46 — Quotes and landlord approval

**Outcome:** Quotes are captured and approval is evidenced.

**Backend:** Quote documents/amounts, selections, expiry and approval command.

**Frontend:** Quote comparison and landlord/internal approval states.

**Quality:** Multiple quotes, changed quote after approval and access.

**Exit gate:** Work requiring approval cannot progress without valid authority.

**Complexity:** Medium–Large.

### Phase 47 — Work execution and completion

**Outcome:** Scheduled work, completion evidence and tenant confirmation are recorded.

**Backend:** Appointment link, work updates, completion evidence and reopen flow.

**Frontend:** Timeline, contractor updates, completion/reopen actions.

**Quality:** Expiring external access, duplicate updates and notification retry.

**Exit gate:** A request has a complete path from intake to verified closure.

**Complexity:** Medium.

### Phase 48 — Inspection templates and scheduling

**Outcome:** Incoming, routine and outgoing inspections share infrastructure but retain type-specific rules.

**Backend:** Templates, schedules, assignments and appointment integration.

**Frontend:** Inspection queue/calendar and template management.

**Quality:** Recurrence, rescheduling, access and reminder dedupe.

**Exit gate:** Due inspections appear accurately for the correct manager/branch.

**Complexity:** Medium–Large.

### Phase 49 — Mobile inspection execution

**Outcome:** Inspectors complete reports quickly on site.

**Backend:** Draft sections, media links, condition ratings and finalization.

**Frontend:** Mobile-first checklist, camera flow, autosave, reconnect and final review.

**Quality:** Low connectivity, large media, interrupted sessions and accessibility.

**Exit gate:** A full report survives connectivity loss without duplicated uploads.

**Complexity:** Large.

### Phase 50 — Inspection comparison and follow-up

**Outcome:** Condition changes generate actionable follow-up.

**Backend:** Report comparison projection and issue-to-maintenance creation.

**Frontend:** Side-by-side change view and create-request action.

**Quality:** Template version changes, missing areas and idempotent issue creation.

**Exit gate:** Inspection findings can create traceable maintenance work.

**Complexity:** Medium.

## Programme I — Portals

### Phase 51 — Portal identity and relationship access

**Outcome:** Tenant and landlord access is based on verified relationships, not email matching.

**Backend:** Invitation/binding, revocation, access audit and least-privilege portal queries.

**Frontend:** Invite acceptance, recovery, expired/revoked and multi-relationship selection.

**Quality:** Cross-tenant/landlord isolation, revocation and token/session security.

**Exit gate:** Portal users cannot call internal workspace queries.

**Complexity:** Large.

### Phase 52 — Tenant portal read-only release

**Outcome:** Tenant sees home, lease, documents and payment status.

**Backend:** Tenant-specific summary/document/ledger projections.

**Frontend:** Mobile Home, Payments and Documents.

**Quality:** Data minimization, document access, performance and accessibility.

**Exit gate:** Pilot tenants see only their tenancy information.

**Complexity:** Medium–Large.

### Phase 53 — Tenant portal actions

**Outcome:** Tenant submits maintenance, documents, notices and intentions.

**Backend:** Narrow commands with tenancy-bound authorization and rate limits.

**Frontend:** Action forms, receipts and status tracking.

**Quality:** Abuse, duplicate submission, offline/retry and revocation.

**Exit gate:** Portal actions cannot directly override canonical internal state.

**Complexity:** Medium–Large.

### Phase 54 — Landlord portal read-only release

**Outcome:** Landlord sees portfolio, payment status, maintenance, inspections and documents.

**Backend:** Ownership-share-aware projections and sensitive-field filtering.

**Frontend:** Portfolio summary and property workspaces.

**Quality:** Multi-owner access, historic ownership, financial data scope and performance.

**Exit gate:** Landlords see only properties and data authorized by active relationships.

**Complexity:** Large.

### Phase 55 — Landlord approvals and intentions

**Outcome:** Landlords approve maintenance and submit renewal intentions securely.

**Backend:** Approval/intention commands with version checks and evidence.

**Frontend:** Review, approve/decline and confirmation flows.

**Quality:** Stale approvals, changed quote/terms and delegated authority.

**Exit gate:** Every decision is attributable and bound to the reviewed version.

**Complexity:** Medium–Large.

## Programme J — Renewals, notice and exit

### Phase 56 — Lease expiry projection

**Outcome:** Upcoming expiries and deadlines appear operationally.

**Backend:** Expiry projection and 120/90/60/30-day queues.

**Frontend:** Expiry dashboard and tenancy alerts.

**Quality:** Timezones, changed lease versions and large portfolios.

**Exit gate:** Expiry results reconcile exactly to active lease dates.

**Complexity:** Medium.

### Phase 57 — Renewal workflow

**Outcome:** Landlord and tenant intentions become a managed renewal decision.

**Backend:** Renewal record, proposed terms, intentions, decision and task events.

**Frontend:** Renewal workspace and term comparison.

**Quality:** Conflicting intentions, stale terms, deadlines and access.

**Exit gate:** A renewal decision has clear participants, terms and history.

**Complexity:** Medium–Large.

### Phase 58 — Renewal lease version

**Outcome:** An accepted renewal produces a new lease version without closing the tenancy.

**Backend:** New lease generation/linkage and effective-date rules.

**Frontend:** Review/sign renewal and future lease presentation.

**Quality:** Overlap/gap dates, escalation and signing failure.

**Exit gate:** Exactly one lease version is active for any date.

**Complexity:** Medium–Large.

### Phase 59 — Notice capture

**Outcome:** Tenant or landlord notice is recorded with evidence and deadlines.

**Backend:** Notices, source, received/effective dates, acknowledgement and validation.

**Frontend:** Internal/portal capture and notice summary.

**Quality:** Invalid dates, withdrawal/change and permissions.

**Exit gate:** Notice Given status derives from a valid notice record.

**Complexity:** Medium.

### Phase 60 — Move-out workflow

**Outcome:** Tasks, balances, keys and outgoing inspection are coordinated.

**Backend:** Move-out checklist, dependencies and completion rules.

**Frontend:** Move-out workspace and next-action sequence.

**Quality:** Incomplete balances/evidence, rescheduling and mobile.

**Exit gate:** Closure blockers are explicit and enforced.

**Complexity:** Medium–Large.

### Phase 61 — Tenancy closure and new vacancy

**Outcome:** Closing a tenancy returns the unit to an appropriate state and optionally creates a Vacancy.

**Backend:** Atomic close command, final status, unit state and idempotent vacancy creation.

**Frontend:** Closure review and result receipt.

**Quality:** Repeat command, concurrent new tenancy, rollback and historical access.

**Exit gate:** Closed tenancy history remains immutable and the unit state is correct.

**Complexity:** Large.

## Programme K — Automation and integration expansion

### Phase 62 — Rental notification catalogue

**Outcome:** Versioned templates cover invitations, applications, leases, collections, maintenance, inspections and renewals.

**Backend:** Rental event-to-template policy and channel preference handling.

**Frontend:** Template preview and delivery history for authorized staff.

**Quality:** Wording versions, preferences, suppression and fallback channels.

**Exit gate:** Each notification is traceable to an event, policy and template version.

**Complexity:** Medium.

### Phase 63 — Reminder orchestration

**Outcome:** Missing documents, rent, inspections and renewals are chased reliably.

**Backend:** Scheduled policy evaluation, dedupe, cancellation and escalation.

**Frontend:** Reminder policy/status and manual intervention.

**Quality:** Stale-state cancellation, duplicate schedulers and timezone.

**Exit gate:** Repeated scheduler runs produce no duplicate business notification.

**Complexity:** Large.

### Phase 64 — Screening provider adapters

**Outcome:** External identity, FICA and credit providers plug into the manual screening model.

**Backend:** Provider registry, request/callback, normalized results, consent gate and retry.

**Frontend:** Provider progress, evidence and manual fallback.

**Quality:** Webhook authentication, duplicate callbacks, outages and provider switching.

**Exit gate:** Provider failure never auto-declines or auto-approves an applicant.

**Complexity:** Large.

### Phase 65 — Payment feed integration

**Outcome:** Bank/payment imports create staged candidate payments for review or safe matching.

**Backend:** Provider adapter, matching rules, confidence and reconciliation.

**Frontend:** Match/review queue and exception resolution.

**Quality:** Duplicates, ambiguous references, refunds and replay.

**Exit gate:** Low-confidence matches cannot post automatically.

**Complexity:** Large.

### Phase 66 — E-signature integration

**Outcome:** Lease signing uses a provider through the existing signing boundary.

**Backend:** Envelope creation, signer sessions, callback validation and final artifact linking.

**Frontend:** Send, track, remind and recover actions.

**Quality:** Signer security, partial signing, callback replay and final PDF evidence.

**Exit gate:** Manual upload remains a safe fallback.

**Complexity:** Large.

## Programme L — Reporting, hardening and scale

### Phase 67 — Operational reporting

**Outcome:** Portfolio, occupancy, vacancy aging, applications, arrears, maintenance and expiry reporting.

**Backend:** Read-optimized projections with controlled refresh and export jobs.

**Frontend:** Filters, reports and asynchronous exports.

**Quality:** Source reconciliation, large exports, scope and performance.

**Exit gate:** Report totals reconcile to operational source records.

**Complexity:** Large.

### Phase 68 — Landlord statements

**Outcome:** Clear property/tenancy statements without claiming trust accounting functionality.

**Backend:** Statement projection, versioned generation and document archive.

**Frontend:** Internal preview and landlord portal delivery.

**Quality:** Financial reconciliation, versioning, privacy and layout.

**Exit gate:** Statement totals reconcile to the rental subledger.

**Complexity:** Large.

### Phase 69 — Bulk operations

**Outcome:** Larger agencies can assign managers, update statuses and schedule work efficiently.

**Backend:** Validated bulk commands, partial failure receipts and rate limits.

**Frontend:** Selection, preview, confirmation and result report.

**Quality:** Mixed permissions, partial failure, idempotency and load.

**Exit gate:** Bulk actions are auditable and never bypass row-level rules.

**Complexity:** Medium–Large.

### Phase 70 — Search and command palette

**Outcome:** Users quickly locate properties, units, vacancies, applications and tenancies.

**Backend:** Scope-aware search projection and ranked results.

**Frontend:** Rental command palette, recent records and quick actions.

**Quality:** Information leakage, stale results, keyboard/accessibility and latency.

**Exit gate:** Search meets the 500 ms p95 server target on production-sized data.

**Complexity:** Medium–Large.

### Phase 71 — Scale and concurrency hardening

**Outcome:** Large portfolios and simultaneous users remain correct and fast.

**Backend:** Query-plan tuning, partition/archive decisions based on measured data, contention review and rate controls.

**Frontend:** Virtualized large lists only where needed and resilient mutations.

**Quality:** Load, soak, concurrency, retry storms and large-tenant tests.

**Exit gate:** Agreed high-water portfolio/user scenario stays inside SLOs.

**Complexity:** Large.

### Phase 72 — Security and privacy hardening

**Outcome:** Sensitive applicant, identity and financial information has defensible controls.

**Backend:** Retention, deletion/anonymization rules, field minimization, secrets review and privileged audit.

**Frontend:** Sensitive-field masking, export warnings and session controls.

**Quality:** RLS adversarial tests, public-route abuse, storage access and privacy workflow tests.

**Exit gate:** Security/privacy review findings are resolved or explicitly accepted.

**Complexity:** Large.

### Phase 73 — Disaster recovery and operational runbooks

**Outcome:** The team can recover failed jobs, bad imports, integration outages and deployments.

**Backend:** Reconciliation/repair tools, backup restore rehearsal and safe replay controls.

**Frontend:** Restricted operational health and recovery views.

**Quality:** Tabletop and practical recovery drills.

**Exit gate:** Recovery targets and ownership are documented and rehearsed.

**Complexity:** Medium–Large.

### Phase 74 — Production rollout and cohort expansion

**Outcome:** Rentals progresses from pilot to general availability safely.

**Backend:** Organisation cohort flags, health metrics and rollback switches.

**Frontend:** Controlled availability and user-facing recovery/support paths.

**Quality:** Pilot reconciliation, performance/error budgets and support readiness.

**Exit gate:** Two stable operating cycles for the pilot, including collections, before broad rollout.

**Complexity:** Medium.

### Phase 75 — Legacy compatibility retirement

**Outcome:** Temporary JSON facts and old rental page/service paths are removed after proven parity.

**Backend/data:** Switch reads, verify, freeze compatibility writes, archive evidence and later remove fallbacks.

**Frontend:** Remove obsolete routes/components and redirect supported deep links.

**Quality:** Data parity, no live callers, rollback window and Sales regression.

**Exit gate:** Observability proves zero compatibility-path usage for the agreed period.

**Complexity:** Medium–Large.

## Programme M — Future short-term residential foundation

These phases begin only after the long-term MVP is stable. The earlier model must accommodate them, but no booking logic belongs in the long-term build.

### Phase 76 — Short-term domain discovery

Define Availability, Rate Plan, Booking, Guest, Stay, Turnover and Owner Payout without modifying long-term Tenancy semantics.

### Phase 77 — Availability and rate architecture

Add short-term availability/rates as separate domain objects linked to canonical Property and Unit.

### Phase 78 — Booking and guest journey

Build booking, guest access, payment and check-in/out through new bounded workflows.

### Phase 79 — Turnover and owner payout

Extend shared maintenance/inspection/finance infrastructure through short-term adapters, not long-term table repurposing.

## 4. Recommended release milestones

The 80 phases are engineering increments, not 80 public launches. Group them into controlled milestones:

| Milestone | Included phases | Usable outcome |
|---|---:|---|
| Architecture ready | 0–5 | Safe, measurable Rentals shell |
| Portfolio pilot | 6–11 | Properties, units, portfolios and landlords |
| Lettings pilot | 12–20 | Vacancy marketing, dashboard, leads and viewings |
| Application pilot | 21–28 | Applicant onboarding through human decision |
| Tenancy pilot | 29–35 | Lease, move-in and active tenancy |
| Collections pilot | 36–43 | Charges, payments, balances and arrears |
| Operations pilot | 44–50 | Maintenance and inspections |
| Portal pilot | 51–55 | Tenant and landlord self-service |
| Lifecycle complete | 56–61 | Renewal, notice, exit and re-vacancy |
| Automation/integrations | 62–66 | Reliable reminders and provider adapters |
| General availability | 67–75 | Reporting, scale, security and rollout |
| Short-term future | 76–79 | Separate booking/stay domain |

## 5. Suggested initial team cadence

With one backend-focused engineer and one frontend-focused engineer, quality shared across the team:

- Backend/data implements phase N+1 contracts while frontend completes phase N.
- Both pair on transitions, RLS, error behavior and acceptance examples.
- No more than two unfinished phases per workstream.
- Integrate continuously; do not maintain a long-lived Rentals branch.
- Demonstrate a working vertical slice at least every one to two weeks.

With only one engineer, retain the same order but complete one phase end to end before starting the next. Do not batch all migrations or all screens.

## 6. Recommended immediate start

Start with Phases 0–5, then implement Phases 6–8 as the first real vertical slice:

`Canonical Party → Property → Unit`

Follow immediately with:

`Portfolio → Landlord/Mandate → Documents/Activity → Vacancy → Rental Listing Projection`

Do not start Collections, portals or third-party screening until the core Property/Unit/Vacancy/Application/Tenancy boundaries have passed staging and Sales isolation gates.

## 7. MVP completion boundary

The Residential Long-Term MVP is operationally complete at Phase 61, provided all permanent gates pass. Phases 62–75 turn that working lifecycle into a scalable, integrated and generally available product. Phases 76–79 are future short-term work and are intentionally outside the long-term MVP.
