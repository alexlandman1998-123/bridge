# Arch9 Legal audit and implementation plan

Date: 11 October 2026
Owner: primary `the-it-guy/` application
Status: proposed implementation plan; no application or database changes authorised by this document

## Recommendation

Build Arch9 Legal alongside the existing conveyancing implementation. Start with an independent legal matter foundation for new non-conveyancing work. Preserve the current conveyancing screens, routes, data, permissions, commands, documents, accounts and integrations.

The existing Attorney Module has substantial reusable firm infrastructure, but its matter identity is a property transaction. Converting that identity into a generic legal matter would affect too many operational paths to meet the request that conveyancing must continue as it is. A new foundation can support multiple practice areas without making conveyancing depend on it.

Later, an optional Arch9 Legal register can show authorised conveyancing matters through a read-only projection. Opening one must navigate to its existing workspace. Conveyancing does not need a new legal matter record, migration or replacement workflow to participate in that view.

The first useful release is a private, firm-scoped legal matter register and workspace: create a matter without a property transaction, record its clients and parties, assign its team, record work and dates, and retain an audit history. Practice-specific automation follows after that foundation is proven.

## Audit scope and confidence

This is a source and focused local verification audit of the current working tree, based on repository HEAD `904d53fad` plus existing uncommitted work. It covers the attorney routes, firm identity, membership and permissions, intake, matter register and detail, workflow, document persistence, calendar, accounts, and client identity dependencies. It is not a legal-process certification or a complete security assessment of the platform.

The public websites and Admin Console are independent products and are outside this implementation scope. Shared database additions will need a later, separately approved release. No hosted database, authenticated browser session, email delivery or production deployment was verified in this audit. The local checks establish a useful regression baseline, not a guarantee of production equivalence.

The previously requested agency/developer logo change and all other existing work remain separate from this plan.

## Existing capabilities and extension boundaries

| Capability | Current implementation and evidence | Arch9 Legal treatment |
| --- | --- | --- |
| Firm identity and branding | `attorneyFirms.js` reads a firm and its backing organisation; `attorneyBranding.js` supplies identity and branding. | Reuse the existing firm ID and CI through reads. Do not create a second firm identity or rewrite onboarding. |
| Firm membership | `attorneyFirmMembers.js`, `attorneyTeamService.js`, and `attorneyRoleCatalog.js` distinguish professional profiles, qualifications and firm roles. | Use active existing membership as the prerequisite. Add explicit legal capabilities separately; existing conveyancing roles and qualification values retain their meaning. |
| Matter access and teams | `attorneyMatterScope.js` is limited to transfer, bond and cancellation. `attorneyMatterTeamService.js` passes transaction IDs to team RPCs; `attorney_matter_team_members` has a required transaction foreign key. | Implement legal matter access and teams independently. A legal team assignment must never create authority over a conveyancing lane. |
| Incoming instructions | `attorneyIncomingMatterContract.js` and instruction actions use onboarding, signed OTP and attorney assignment state. Bond/cancellation acceptance has its own actionable states. | Preserve those queues and decisions. New legal intake needs its own conflict/engagement decisions and must not manufacture an OTP or property instruction. |
| Leads and conversion | `attorneyLeadsService.js:388` accepts only transfer/bond/cancellation, requires a property address and validates buyer/seller/borrower/owner roles. Conversion confirms a transaction and assignment. | Keep existing conversion untouched. Start new legal matters directly; add a separate legal enquiry-to-matter path later if needed. |
| Matter register | `attorneyMatterWorkspace.js`, `attorneyMatterListSnapshotService.js` and `attorneyOperations.js` load and present transaction-backed matters, property context and conveyancing KPIs. | Create a new register. Existing lists, saved views, pagination and KPI definitions stay unchanged. |
| Matter number | `attorneyMatterNumberService.js:5` saves `transactions.matter_number`. | Allocate new legal references with a separate firm-scoped sequence and distinguishable prefix. Do not consume or rewrite conveyancing references. |
| Matter detail | `AttorneyTransactionDetail.jsx` is approximately 27,373 lines and connects transaction, finance, party, document and multiple-role workflows. | Treat as a protected boundary. Build a separate, smaller legal matter page; do not generalise this screen during the foundation work. |
| Workflow and progress | `sharedMatterJourneyContract.js` requires a transaction ID and defines three conveyancing lanes. Plans, task contracts and commands enforce matter-specific evidence and milestones. Current contract check covers 89 tasks. | Preserve the existing engine and its three lanes. Legal tasks need their own matter identity and status contract. Practice areas are not new conveyancing lanes. |
| Documents | The canonical document system has broader context concepts, but the attorney request/save/review paths use transaction requirements, lane authority and audience rules. `attorneyDocumentPersistence.js` calls dedicated atomic RPCs. | Reuse unchanged UI/file primitives where safe; use independent legal ownership, versions and private storage access. Do not widen existing storage policies or canonical contexts in the first release. |
| Calendar | Attorney scheduling supports authorised transaction appointments and firm-owned matterless events. Durable invite/save/manage/delivery contracts already exist; the local suite passes 121 tests. | Reuse presentation and date-handling patterns only after compatibility proof. Begin with legal matter dates; introduce linked legal appointments separately. Do not disguise a legal matter appointment as a legacy matterless event. |
| Financial accounts | `matter_financial_accounts` and financial documents require `transaction_id`; `api.js:24736` rejects a missing transaction. Accounts include documents, entries, reversals, requests and statements. | Keep conveyancing accounting intact. Defer generic legal billing/trust accounting to its own scope; no fake transactions or optionalising existing foreign keys. |
| Client identity | `clientIdentityService.js` uses agency-scoped client profiles, identifiers, links and reviewed merges. Conveyancing also uses buyers, sellers and transaction participants. | Build firm-owned legal clients and matter-party links. Existing agency/client information is not automatically accessible or mergeable by the legal firm. |
| Client communication | Shared journey readers project different professional and buyer/seller audiences and use transaction refresh signals. | Start legal activity as private. External messages and client access require a separate recipient, consent, publication and delivery design. |

The role-boundary intent is also recorded in [ADR 001](architecture/adr-001-attorney-role-boundaries.md). The current task navigation contract is in the [Attorney workspace navigation map](attorney-workspace-navigation-map.md). The [3 October process audit](../../docs/attorney-conveyancing-process-audit-2026-10-03.md) remains relevant background; its process recommendations are not bundled into this expansion.

### Findings that govern the architecture

1. **The term matter is broader than the current data model.** Teams, references, accounts, commands and reads still depend on a transaction. A standalone matter cannot safely be implemented by leaving property fields blank on a synthetic transaction.
2. **Existing permissions are conveyancing-specific.** `ATTORNEY_PRACTICE_QUALIFICATIONS` contains transfer, bond and cancellation; a practitioner without those qualifications can receive no permissions from the existing practitioner permission builder. Do not assign a new legal practitioner a conveyancing qualification merely to unlock the workspace.
3. **Ownership crosses organisations.** A conveyancing transaction may belong to an agency/developer while the attorney firm acts through an assignment. New legal matters should belong directly to the firm. The new register must preserve the older assignment-based access on any projected transaction.
4. **Generic names do not establish generic persistence.** Shared journey, matter accounts and attorney documents contain valuable patterns, but their save paths are transaction-specific. Reuse must follow the actual contract, rather than the service name.
5. **The existing module is tightly connected to other roles.** Changing its workflow can change agent, developer, buyer and seller progress, access or notifications. Isolation must include those recipients, not just the attorney screen.
6. **Current baseline evidence is mixed.** Conveyancing, persistence, access and calendar checks passed. The accounting UI source assertion was reconciled during delivery Phase 1; the audit results below retain the original finding for provenance.

## Conveyancing preservation contract

Apply these constraints to every implementation phase:

- Keep `/attorney/dashboard`, existing matter lists, `/transactions/:id`, default landing choices, deep links and current navigation behaviour. New legal routes are additive and available only to explicitly enabled firms/users. No global rename or replacement sidebar in the foundation release.
- Keep conveyancing task keys, order, applicable-plan rules, statuses, progress calculations, readiness gates, overrides, milestones and three-lane coordination unchanged.
- Keep existing transaction/assignment/team IDs, matter numbers, document links and versions, financial entries, appointment recipients, audit history and refresh signals unchanged.
- Do not change existing mutation RPC signatures, RLS helpers/policies, grants, database triggers, storage policies, role meanings or worker payloads to support generic matters.
- Do not backfill or migrate conveyancing matters into new tables. The existing workflow must operate when the legal feature is disabled, unavailable or has never been configured.
- Keep the current client portals, agent/developer visibility and communications unchanged. No new legal event may reach a conveyancing worker or recipient channel.
- No Legal query, import, polling subscription or new network dependency runs on existing conveyancing routes while Legal is disabled. Lazy-load new screens; keep new caches and invalidation separate.
- Any change that requires crossing a protected boundary is outside this foundation plan and needs a new review of its concrete impact. Stop that phase rather than weakening these constraints.

“No impact” is the required behaviour, not a promise that shared infrastructure cannot fail. New code still shares a build, database and resource capacity. Before release, prove the protected behaviours and check query cost, locks and bundle impact. If independent operational failure domains are required, assess a separate runtime/database before implementation; do not claim that a feature switch provides physical isolation.

## Agreed workspace and navigation direction

Arch9 Legal is the product umbrella. Conveyancing, Wills & Estates, Trusts and Debt Collection are discipline workspaces. Family Law can follow later. Expose a discipline only when it is usable and the firm has enabled it; Wills & Estates initially supports wills, not a complete deceased-estate workflow.

The existing Sales/Rentals dropdown is implemented in `Sidebar.jsx:314`, with branding-area placement at line 750 and agency-specific state in `businessWorkspaceAccess.js` and `WorkspaceContext.jsx`. Reuse its visual pattern, not the agency role resolver: legal discipline access needs an independent contract. Existing `AttorneyDashboardPage.jsx` already sends users without firm-dashboard authority to operations; a role distinction exists, but the proposed cross-discipline executive overview does not.

Use one compact selector beside the firm logo. Keep the firm/account identity unchanged. Directors and partners see Firm Overview followed by enabled disciplines. Attorneys see only their authorised, enabled disciplines. With one available discipline, display its name without an unnecessary dropdown. Remember the last authorised workspace/location per user and firm, and guard unsaved changes before switching.

| Context | Landing page | Primary navigation |
| --- | --- | --- |
| Director/partner in Firm Overview | Firm Overview | Overview, All Matters, Team & Workload, Reports |
| Attorney in a new discipline | My Matters | My Matters, Calendar, Clients |
| Director/partner in a new discipline | Matters | Matters, Calendar, Clients; use a My Matters filter for personally assigned work |
| Conveyancing | Current landing page | Existing navigation and functionality unchanged |

New pages appear only as their capabilities ship. Firm settings are a single permission-controlled footer destination, not repeated under every discipline. Reports and Calendar remain absent until usable. Clients shows only identities the user may access through their authorised work; it is not a firm-wide address book for every staff member.

Each new legal matter has one canonical detail route and five tabs: Overview, Work, Parties, Documents, Activity. Tasks and dated actions belong in Work; files belong in Documents. Avoid separate Documents, Workflow, Progress and Activity sidebar destinations that duplicate the matter workspace. Practice stages appear inside Work, not as another global menu.

My Matters defaults to the selected discipline and assigned/team scope. The same register can offer an All my disciplines scope for attorneys authorised in multiple disciplines; this is a filter, not another page or access grant. The executive All Matters register combines authorised work, with discipline/team/owner/status filters and source-qualified links. Opening a conveyancing entry always returns to the existing screen.

Directors/partners receive explicit legal management grants covering enabled disciplines and firm matters, with restricted-file rules where configured. Attorney access requires both a discipline grant and matter/team authority. Support staff get specific capabilities. Switching menus never grants permission, and no new role mapping alters conveyancing access.

Keep the UI compact: a single page title, one primary action, concise status labels, shared filters, and one clear matter-opening action. Avoid explanatory subtitles on every card, duplicate KPIs, nested discipline menus and empty future-workspace shells. Preserve register filters and scroll position when returning from a matter; make phone navigation follow the same information structure.

## Proposed shared matter foundation

This is a logical model for design review, not migration SQL or settled table names.

| Proposed record | Minimum responsibility |
| --- | --- |
| `legal_matters` | Firm ID, stable ID, unique firm reference, title, practice-area key, lifecycle, responsible user, opened/closed dates, revision and audit attribution. No mandatory transaction, property, finance or OTP fields. |
| `legal_clients` | Firm-owned individual/organisation identity and contact details. No automatic import, global deduplication or cross-firm search. |
| `legal_matter_parties` | Stable link to a legal client or recorded other party, relationship and role. Distinguish the client from the opponent, witness, representative and other participants. |
| `legal_matter_team` | Active member assignments, responsibilities, explicit capabilities, removal history and access revocation. |
| Legal practice-area configuration | Firm-enabled areas for new legal work; independent of existing conveyancing module settings, departments and qualifications. |
| Legal capability grants | Explicit new permissions for active existing firm members. Later support new legal staff through a dedicated enrolment path without altering old qualifications or role mirrors. |
| `legal_matter_events` | Append-only attributable activity and decisions. Internal by default; no shared transaction refresh or notification effects. |
| Legal tasks and dates | Owned by the legal matter, with responsible user, due date, priority, state and history. A due-date reminder is distinct from a verified legal deadline. |
| Legal documents and versions | Exact matter ownership, storage object, immutable version lineage, access and publication decisions. Added after the core foundation. |

Use one established firm identity: reference `attorney_firms.id` and validate its backing organisation and active membership. Do not infer that a transaction's agency organisation owns the legal matter. Where both firm and organisation IDs are stored, enforce their consistency in the database.

Create and assign a matter atomically, allocate its reference safely under concurrent requests, and use a durable request identity to recover uncertain saves without duplicating the matter. Updates should validate an expected revision and retain attribution. Cross-firm party/team/document links must fail in the database, not only the UI.

Use a modest common lifecycle such as draft, open, on hold, closed and archived for new matters. Keep intake acceptance and practice-specific outcomes separate. Existing conveyancing statuses retain their existing meanings. A practice-area change after work begins requires a deliberate decision with history rather than silently replacing tasks.

For implementation organisation, follow the repository's existing `src/modules/` pattern with a separate Legal module and focused service boundary. Do not make this project depend on extracting the large legacy API facade. The [domain boundary README](../src/domains/README.md) already limits imports into domains that have not been extracted.

## Phased implementation

### Phase 1 — Freeze the preservation baseline

**Outcome:** agree and record exactly what conveyancing must retain before implementation begins.

Capture the applicable source revision and existing changes; map protected routes, tables, commands, roles, workers and storage paths. Reuse existing checks and add only missing behavioural checks needed for the new boundary. Reconcile the accounting import assertion in a separate approved maintenance change, retaining its check that the panel renders and is attorney-scoped. Do not repair substantive conveyancing audit findings as part of Legal.

Record representative authorised examples: cash transfer, financed transfer, cash purchase with seller-bond cancellation, mixed funding, multiple parties, partial document save/retry, restricted staff, and registration/closure history. Run them locally with feature disabled and later enabled. Browser comparisons must cover desktop and phone, saved task selection, dirty-draft guards, permissions and save/reload.

**Exit:** a recorded baseline with failures explained, agreed preservation scenarios, protected boundaries and a rollback/disable strategy. Known product failures affecting a touched path block that path; unrelated known issues are documented separately.

### Phase 2 — Add the shared legal matter data and access foundation

**Depends on:** Phase 1. **Outcome:** a firm can own a genuine non-conveyancing matter independently of a property transaction.

Introduce additive legal matter, client, party, team, event, practice-area and capability records. Limit the first pilot to existing active firms and existing users. Create dedicated commands for create/read/update/assign/close/archive and a paginated firm-scoped register. Decide and implement manual conflict-review and engagement decisions for new legal matters; unresolved intake remains a draft. Treat those decisions as recorded firm review, not automatic legal clearance.

Every exposed new table needs appropriate grants and RLS. Commands and storage access must enforce actual matter authority; a route gate or authenticated user alone is insufficient. Explicitly test suspended/removed members, restricted matters, cross-firm IDs, capability revocation and ID guessing. Do not inherit broad legal-file visibility from an old conveyancing management permission without an explicit legal grant. Supabase documents the distinct roles of grants and row policies in its [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Exit:** local database tests prove isolation, atomic creation, concurrent reference allocation, replay without duplication, revision conflicts, team changes and durable audit history. Database object comparison shows no changes to protected conveyancing objects and no writes to transaction tables.

**Recovery:** new API/UI disabled; retain new records for recovery. Do not drop populated tables as rollback.

### Phase 3 — Add the switcher and legal matter workspace

**Depends on:** Phase 2. **Outcome:** authorised pilot users can create, find and manage their new legal matters.

Add dedicated lazy-loaded legal routes and the logo-area discipline selector for opted-in users. Keep one canonical `/legal/matters/:id` detail route; discipline selection controls the register/menu context, not duplicate matter pages. Keep the existing attorney landing page and conveyancing navigation. Use existing firm CI through a read adapter, and keep new workspace preferences independent of Sales/Rentals settings.

Provide a short creation flow: client/parties, title and practice area, intake review, responsible attorney and team. The workspace starts with Overview, Work, Parties and Activity; team assignment belongs in Overview. Add Documents in Phase 4. Search and filters retain firm and permission scope; refresh/history preserve the selected matter. Implement the role-based menus described above without exposing unbuilt destinations. No legal accounting or external-client portal appears as a working feature yet.

**Exit:** desktop/mobile create, save, reload, edit, assign, close and archive work without a property, buyer or OTP; denied users cannot open the records directly. Switching preserves authorised context, guards drafts, hides unapproved disciplines and recovers safely after access revocation. Legal disabled leaves existing navigation/screens unchanged and issues no Legal requests.

**Recovery:** disable the new routes/entry point for the pilot; existing attorney routes remain operational.

### Phase 4 — Launch the wills workspace

**Depends on:** Phase 3. **Outcome:** pilot attorneys can handle wills through a useful matter workspace. Validate the instructions, drafting/review, execution and custody steps with the firm; do not treat electronic signing or task completion as proof of valid execution.

Add manual tasks, owners, due dates and completion/reopen history. Start documents with private upload, exact matter linking, preview/download and immutable replacements. Use a separate private storage namespace/bucket and access rules; verify uncertain upload recovery, stale versions and denied reads. Add tailored document requests only when their recipient and access paths are implemented.

Record matter dates in SAST using the established calendar presentation patterns. Add reminders or legal appointments only through a new, explicitly scoped command/outbox contract. Reuse unchanged rendering or date utilities where suitable, but leave existing appointment records, workers, recipients and RSVP tokens untouched. Existing firm appointments remain available in the existing calendar.

**Exit:** tasks, date changes and documents survive reload; removed users lose reads/downloads; files cannot cross matters; failed multi-record saves roll back; retries do not duplicate versions or events. Existing document and calendar suites still pass.

**Recovery:** independently disable new document/notification capabilities; preserve files and saved history. Private records stay private.

### Phase 5 — Offer an optional firm overview with read-only conveyancing entries

**Depends on:** Phases 3–4 and explicit agreement to expose the new overview. **Outcome:** enabled firms can see their authorised work across practice areas without altering conveyancing.

Build the director/partner Firm Overview and All Matters register, with separate summaries for new legal matters and conveyancing. Focus the overview on workload, intake, upcoming dates and matters requiring intervention. Practice area is a filter and reporting dimension; do not duplicate its register under several menu entries. Read conveyancing through its established permission-aware readers. Use a source-qualified identity (`legal` plus matter ID, or `conveyancing` plus firm/transaction identity) and deduplicate by the existing register semantics; transfer/bond/cancellation rows must not silently become three new generic matters.

Opening a conveyancing entry uses the existing transaction URL. No generic edit, status, assignment, archive, document or accounting command acts on that entry. Label counts clearly; new Legal records do not enter old dashboard KPI queries or redefine progress.

**Exit:** displayed conveyancing rows, permissions and counts match the existing source under pagination/search and representative roles. Existing transaction owners and restricted team access remain authoritative. New overview failures cannot prevent direct entry to the old workspace. Query plans and performance stay within the baseline's agreed limits.

**Recovery:** hide the optional overview and adapter. No data reversal or conveyancing repair is needed.

### Phase 6 — Expand to further disciplines

**Depends on:** the wills pilot and selection of the next practice area. **Outcome:** each additional discipline has a validated workflow within the shared foundation.

After the Wills & Estates pilot, expand based on pilot-firm demand. Review anonymised examples and agree its parties, intake, stages, required evidence, important dates, professional approvals and closure conditions. Version the template; existing matters retain their recorded version and history. Start with one deliberately bounded workflow and explicit manual review where needed. Add Trusts, then pre-litigation Debt Collection as separately enabled workspaces after validation; move Debt Collection earlier if pilot demand warrants it. Deceased-estate administration and Family Law require later scoped designs.

Add a dedicated legal enquiry/conversion path only if the pilot needs it; existing property lead conversion remains unchanged. General billing, fee arrangements, trust accounting, external client portals, messaging, new-staff onboarding and a workflow designer each need their own scope and approval. Existing transaction accounting does not automatically satisfy those needs.

**Exit:** the firm can open, execute and close representative pilot matters without invented property data or misleading completions; users confirm the flow; access and data recovery are proven; conveyancing preservation checks remain unchanged.

**Recovery:** stop new template use and return to manual legal tasks while retaining saved matters/history. Do not change conveyancing configuration.

### Phase 7 — Extend firm operations

Add reporting, new-staff onboarding, client communications and separately scoped legal accounting after the pilots. Deceased estates and Family Law need their own validated designs. Keep new destinations hidden until usable, and retain each discipline's independent access and recovery boundary.

## Phase 1 delivery record

The local preservation baseline is stored in [conveyancing-preservation-baseline.json](conveyancing-preservation-baseline.json). It records SHA-256 fingerprints for 37 protected sources and seven shared surfaces, including existing uncommitted work. It is not a production snapshot. Protected sources cover lane/task definitions, permissions, matter scope, teams/references, intake, atomic commands/readers, readiness decisions, document persistence, accounting, calendar and selected existing SQL/worker boundaries. Shared surfaces cover routing, sidebar, workspace context, API facade, dashboard, transaction detail and operations.

Run `npm run check:conveyancing-preservation` from the primary package before progressing the Legal implementation. This executes the guard's failure-path test and the existing local behavioural suites. For a source-only comparison use `npm run check:conveyancing-preservation -- --sources-only`. Both changed protected code and changed shared surfaces stop the check. Shared routing additions require preservation review before an explicitly reviewed baseline update; hashes must never be regenerated just to make the suite green. The guard detects source drift, not runtime/schema identity or legal correctness.

The accounting UI check now recognises the actual direct or lazy module import, retains its rendering and attorney scope assertions, and additionally verifies its current-transaction binding. No production component or save path was modified.

Verification on 11 October: the full preservation runner passed all 15 established check groups, including all eight conveyancing components, 33 reported persistence/atomic tests, three team-service tests and 121 calendar tests. The isolated guard test also passed changed-source, shared-surface, missing-file and escaped-path cases. These results supersede the accounting import failure in the earlier audit table; no authenticated browser or hosted release was tested.

### Required preservation scenarios

| Behaviour to retain | Established evidence |
| --- | --- |
| Cash, bond/mixed funding, seller cancellation independent of buyer finance, and party/scenario applicability | Conveyancing acceptance, plan, party-capacity and funding checks |
| Instruction acceptance/decline, firm assignment and private team access | Instruction-action, matter scope/team and workbench-permission checks |
| Stage/task deep links, phone task selection, dirty drafts and partial-save recovery | Transfer navigation check using local components/fixtures |
| Current evidence, tax/clearance, specialist holds, lodgement/registration and reopening | Readiness, specialist, tax/clearance and registration checks |
| Three-lane task saves, durable retry receipts, revisions, fresh reads and rollback | Shared journey atomic PostgreSQL fixture |
| Exact request/document links, version history, private downloads and rejected cross-matter access | Document persistence PostgreSQL fixture and permission contracts |
| Appointments, recipient/privacy state, concurrent changes and delivery-job contracts | 121-test local calendar suite; real delivery remains unverified |
| Transaction-linked accounts panel and statement generation | Accounting UI and statement contracts; live accounts still require browser verification |

Later releases also require authenticated desktop/phone walkthroughs for the relevant roles, unchanged client/professional projections, and approved deployment/schema identity checks. Disable new Legal entry points/services to recover; existing conveyancing must not depend on Legal availability. Preserve any new saved data rather than dropping populated tables. No feature flag, database migration, deployment or browser certification was introduced in Phase 1.

## Verification baseline from this audit

Commands ran from `the-it-guy/` using local fixtures; no broad release/staging suite was run.

| Check | Result | Evidence scope |
| --- | --- | --- |
| `npm run check:attorney-conveyancing` | Passed all eight component checks | Plan, readiness, party capacity, funding, tax/clearance, specialist routing, seven detailed acceptance scenarios, 1,152 applicability combinations and registration reader. |
| `node scripts/attorney-task-operational-contract.test.mjs` | Passed | Coverage for 89 current tasks. |
| `node scripts/verify-attorney-bond-lane-phase9.mjs` and cancellation equivalent | Both passed | Local lane action/release contracts; not bank or production acceptance. |
| `node scripts/attorney-workbench-permission-contract.test.mjs` | Passed | Three-lane editing, private access, teams, scoped comments, receipts/retries and unchanged gates in fixtures. |
| `node --test scripts/attorney-document-persistence.test.mjs scripts/shared-matter-journey-atomic.test.mjs` | Passed, 33 reported tests | Isolated PostgreSQL document versions, exact links, privacy, rollback, atomic commands, revisions and retry recovery. |
| `npx vitest run --config vitest.attorney-calendar.config.js --maxWorkers=1` | Passed, 12 files and 121 tests | UI/service/model and isolated database calendar contracts; no real email/provider delivery. |
| `npx vitest run src/services/__tests__/attorneyMatterTeamService.test.js --maxWorkers=1` | Passed, 3 tests | Team service requests and response/error behaviour. |
| Matter-number test using Node, and scope/snapshot/instruction-action files using their Node runners | Passed | Number save/confirmation, matter scope, snapshot presenter and instruction actions. |
| `node scripts/attorney-accounting-phase4-statement-download.test.mjs` | Passed | Statement download contract. |
| `node scripts/attorney-accounting-phase2-matter-ui.test.mjs` | Failed | Expects `/import AttorneyMatterAccountsPanel/`; current source uses a lazy import at line 278 and renders the panel at line 19416. Evidence supports a source-assertion mismatch, not a conclusion that the panel is broken or fully working in a browser. |

An initial combined Vitest invocation included four files written for Node runners and reported “No test suite found”. All four were subsequently run successfully with their correct runners. That invocation is not an application regression or a passing suite.

Before each implementation release, use these established checks plus tests for the exact new behaviours. Re-run the full application check when the change reaches routing or shared UI. Before activation, verify the approved deployment/schema identities and perform designated browser acceptance without writing to unrelated live matters. Existing task navigation and document/finance flows require authenticated end-to-end evidence; this audit does not supply it.

## Release and decision gates

The roadmap is not authority to apply migrations, deploy, send messages or import client data. Each requested release must name its environment, exact migration/deployment scope and recovery plan, follow the repository's database guard and release runbook, and verify the resulting state. Migrations remain append-only.

Start with a new firm-level Legal entitlement disabled by default and checked server-side. Enabling Legal must not rewrite the existing `attorneyModules` settings. Protect read access independently of navigation. Measure permission denials, save errors, duplicate-create recovery and new-query costs without logging document contents or client identifiers.

Decisions needed before implementation reaches the relevant phase:

- Confirm the first pilot firm and existing users, and which members may administer or see restricted new legal matters.
- Agree the new matter reference format and common lifecycle/intake decisions in Phase 2.
- Select the first additional practice area before Phase 6; the foundation can be designed before that choice.
- Approve the optional combined overview separately. There is no requirement to replace the conveyancing dashboard.
- Decide separately when new staff enrolment, client-facing communications and legal accounting enter scope.

Phase 1 preservation checks are implemented. Phase 2 now has an additive, disabled-by-default database foundation and an isolated authenticated service, with local database and service tests. The migration has not been applied to a hosted environment. Independent-session concurrency, Supabase advisors and authenticated PostgREST verification remain release checks. Phase 3 now adds gated Legal routes, the logo-area selector, a permission-scoped register and the matter workspace. Local database, UI and preservation checks cover the implementation; hosted rollout remains separately authorised. The optional firm overview remains Phase 5. See [the foundation contract](../src/modules/legal/README.md).

## Phase 4 delivery record

Implemented locally: manual wills checklist, matter-team task owners, SAST due/matter
dates, completion/reopen notes and Activity history, plus private documents with
preview/download, immutable version replacements and pending-upload recovery. The
work/document API and bucket are isolated from conveyancing, appointments and signing.
Tasks and documents can be independently suspended without deleting records. Pilot
workflow validation and authenticated hosted Storage/PostgREST checks remain release
gates; no migration, pilot configuration or deployment was applied in this phase.

### Phase 5 delivery record

Implemented optional Firm Overview and a single All Matters screen for granted firm management, gated separately from the Legal pilot. A new read-only Legal RPC supports workload, intake, upcoming dates and interventions, excluding inaccessible restricted matters. Conveyancing delegates to unchanged permission-aware register readers and retains original transaction links. Source counts and pagination stay separate, with no generic Legal actions on conveyancing entries.

The additive overview route is covered by exact shell reconstruction. Reporting migration and pilot activation are prepared locally, not applied or enabled remotely. Hosted source parity and performance remain pilot activation checks documented in the Legal module README.

### Phase 6 delivery record — Trusts setup

Implemented the first additional discipline as a bounded manual Trusts setup pilot. The existing Trusts workspace gains a separately gated, versioned checklist and appropriate dates. A granted firm reviewer must approve its displayed version and record a note before attorneys can start it. New starts can be paused while existing tasks, dates, version history and private documents remain usable. No new navigation destination, conveyancing changes or external submissions were added.

The implementation is prepared locally. Representative pilot-firm workflow validation and hosted activation remain pending; Debt Collection is a separately selected follow-on rather than an implicit release. See the Legal module README for approval, recovery and verification contracts.
