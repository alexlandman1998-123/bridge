# Arch9 Legal matter foundation

This module belongs to the primary transaction workspace. It provides an independent
non-conveyancing matter service and opt-in workspace. Its routes, tasks and private
files are separate from conveyancing; it adds no emails, signing or transaction adapters.

## Database boundary

The pending migration is `supabase/migrations/20261011145029_arch9_legal_matter_foundation.sql`.
It adds only new tables/functions and foreign keys to existing firm/user identities.
Keep `legal_private` outside PostgREST exposed schemas. Public RPC wrappers run as
invoker; private entrypoints check the current authenticated identity and active
membership on every operation. Direct table access is denied, with RLS enabled as
additional protection. No service-role client is needed.

Legal starts disabled. A current firm administrator/director can configure an existing
active firm using `configure`. Send `enabled`, enabled `disciplines`, a `grants` array,
and `expected_revision` (0 before first configuration). Each grant supplies `user_id`,
`disciplines` and explicit `can_manage`, `can_create`, `can_edit`, `can_review` flags.
The grants array updates listed users; omitted users retain their previous grants.
An empty discipline list with all flags false revokes a user. Management grants
require an existing director/administrator role. Existing conveyancing roles are
neither rewritten nor automatically granted Legal access. Disabled practice areas
also deny access to their records until restored.

## Service contract

Create the service with `createLegalMatterService(authenticatedSupabaseClient)`.
Use `context(firmId)`, `register(firmId, options)`, `clients(firmId, options)` and
`matter(firmId, matterId)` for reads. Registers support page/page_size (1–100),
search and, for matters, discipline/status/scope (`mine` or `all`). Every register
is permission filtered. Matter detail includes party identities, team history and
the latest 100 activity events; all activity remains stored in the database.
Context contains firm settings and the caller's capabilities; only principals
receive the full capability list for configuration.

Writes use `command({ firmId, requestId, action, payload })`. Generate a UUID once
per intended action and retain its exact payload when retrying a lost response.
Commands never automatically retry. Reusing an identity with changed content fails;
a replay rechecks current authority before returning the original result.
Existing-record commands require `expected_revision`; stale saves return `40001`.
Denied access returns `42501`. No failure falls back to transaction APIs.

Actions: `configure`, `create_client`, `update_client`, `create_matter`,
`update_matter`, `review_intake`, `set_team`, `add_party`, `remove_party`.
Creation requires an accessible firm-owned client and active responsible attorney
with explicit discipline edit access. New matters are drafts with separate
`LEG-YYYY-00000001` references. References increment per firm across years.
Atomic commands write the matter, parties, team, activity and retry receipt together.

Record both manual conflict and engagement decisions with reasons. Only `clear`
and `accepted` permit opening; these are recorded human decisions, not automated
clearance. Party changes invalidate intake decisions and put an open matter on hold.
Linked client identity changes are deliberately denied pending a separate reviewed
identity-change workflow. Each status transition requires a reason. Closed/archived
matters cannot change parties, teams or intake until reopened/restored.

Attorneys see matters they lead or belong to, within their explicit disciplines.
A manager may see other ordinary matters only with a Legal management grant.
Restricted matters require actual team membership, including for managers.
Only the responsible attorney or an authorised manager may change teams or
confidentiality. There is no hard-delete command; archive preserves the record.

## Verification and release

Run `npm run test:legal-matter-foundation` and
`npm run check:conveyancing-preservation` from the primary package.
The foundation test executes the actual migration in PGlite PostgreSQL and checks
isolation, rollback, replay, stale revisions, lifecycle, intake, parties, team
removal, suspension/revocation, pagination, ACL/RLS and existing table preservation.
Queued requests test reference uniqueness; PGlite uses a single database connection
and does not prove independent-session concurrency. Before release, run simultaneous
commands against an isolated PostgreSQL/Supabase database, run Supabase advisors,
and verify authenticated RPCs through PostgREST. The per-firm transaction advisory
lock serialises Legal commands only; the unique firm/reference constraint is a
second safeguard. No conveyancing function uses that lock.

No hosted migration or pilot configuration has been applied. A separately authorised
release must review this exact additive migration and pilot grants. To suspend a
pilot, configure `enabled: false`; retain records rather than dropping tables.

## Phase 3 workspace

Implemented routes: `/legal/matters`, `/legal/new` and the single canonical
`/legal/matters/:matterId`. The existing attorney landing page remains the default.
The discipline selector sits beside the existing logo and lists only authorised
areas. Attorneys use My Matters; explicitly granted principals use All Matters.
Firm Overview, accounting and client portals are not menu entries. Phase 4 adds tasks within Work and a Documents tab.

The register supports search, status, scope and pagination through URL parameters.
Switching restores each workspace’s last authorised route within the session.
Its return link preserves filters; scroll position is stored independently per
user/firm/filter. Matter sections are Overview, Work, Parties and Activity. Overview
saves details/confidentiality/team together; Work records manual intake and lifecycle
reasons. Parties can attach accessible identities or atomically create a new identity.
Discipline and firm switching honour unsaved Legal drafts; existing firm switching
runs unchanged outside Legal or when the pilot is disabled. Draft navigation is guarded, and uncertain writes retain the exact request/payload
for retry while editing is locked. Draft content stays in memory, not localStorage.
A browser reload/disconnect is still subject to normal browser unload confirmation;
there is no background autosave. Other unsaved sections survive successful panel saves. Recalled drafts retain their
original revision until reviewed/reloaded, so refreshing cannot bypass stale-save protection.

The additive workspace migration is
`supabase/migrations/20261011145949_arch9_legal_workspace_commands.sql`. It adds
private authenticated directory, atomic creation, Overview and party entrypoints,
with public invoker RPC wrappers. It does not replace Phase 2 or conveyancing functions.
Directory names come from existing active, explicitly granted firm members.

Enable a separately approved pilot with `VITE_ARCH9_LEGAL_ENABLED=true` and a
comma-separated `VITE_ARCH9_LEGAL_FIRM_IDS` allowlist, plus the database settings
and grants described above. The current organisation must resolve to exactly one
allowed active firm; ambiguous selection fails closed. These build settings control
availability only; the database always checks actual authority. With the build gate
off, the shell makes no Legal RPC or additional firm lookup and hides the selector.
No environment files were edited and no hosted migrations or grants were applied.
Selection uses a separate `arch9:legal-workspace:v1:<user>:<firm>` preference.

`npm run test:legal-workspace` checks real database commands, the exact shell
integration and interactive React flows. The preservation guard removes only the
reviewed, exact Legal integration snippets and proves the original App/Sidebar
hashes match; every other shared/protected file must still match directly. The
original baseline is not regenerated. The full existing conveyancing suite still runs.

## Phase 4 — manual wills work and private documents

The additive migration is `supabase/migrations/20261011155632_arch9_legal_work_and_documents.sql`.
No hosted migration or storage change was applied. Work has manual task titles, active
matter-team owners, SAST due dates, completion/reopen notes and history in Activity.
The optional `wills_manual_v1` checklist records instructions, drafting/review, execution
evidence and original custody. It is a manual starting point for the pilot firm to
validate, not evidence of lawful execution. No automatic stage or lifecycle transition
is linked to task completion. Matter dates are date-only SAST values, without timezone
conversion or reminders. Existing calendar and signing services are unchanged.

`work(firmId,matterId)` reads the current work revision, tasks, dates, document
version history and the caller's pending uploads. `workCommand` uses stable request
identities and an exact payload, like the foundation. `start_wills`, `save_task` and
`save_dates` require the loaded **work** revision; they update work and activity
atomically without changing the separate matter revision. Reload and access refresh
do not change a remembered draft's original revision. Completed/archived matters are
read-only until reopened. No task is hard deleted. Completion and reopening require
a note; previous values remain recorded in immutable command events.

Documents use the new private `arch9-legal-matters` bucket. Standard uploads are
bounded at 6 MiB and accept PDF, DOCX, PNG and JPEG. PDF/images have an in-app
preview (PDF.js renders verified bytes with page controls); DOCX is download-only. No signed URL or public URL is generated: each
preview/download performs an authenticated read that checks the exact matter/version
and current access, then checks file size and SHA-256. Browser previews are disposed
when leaving the tab or on a denied request. Already delivered/downloaded bytes cannot
be recalled by any access-control change.

Uploads reserve a unique firm/matter/version path, upload with **upsert false**,
verify the downloaded bytes, then commit the version against the document's current
version. A replacement retains all earlier files. Unknown outcomes retain the exact
reservation and selected file in memory and block switching until retry/cancel. After
a reload, pending reservations are visible to their uploader: finish an existing file,
select its original matching file to resume, or cancel. If a commit succeeded but its
response was lost, retry/cancel recovers its receipt rather than marking a saved file
cancelled. Competing replacements fail with a stale-version error; cancel the pending
replacement and select Replace again after reviewing the current version.

Failed metadata commits never expose a pending file to other team members and never
create a ready version or activity event. Cancellation retains an inaccessible object
and its reservation; there is intentionally no automated deletion worker. An eventual
retention/purge policy requires a separately reviewed operation. The bucket fences
combine exact access predicates with restrictive RLS so unrelated permissive policies
cannot open it. An immutable-object trigger blocks replacing/deleting Legal objects,
including through an RLS-bypassing service identity. Other buckets pass through
unchanged. Review actual Storage API behavior against the pending migration before
hosted activation; the local database fixture validates RLS but is not the Storage API.

A principal with explicit Legal management may independently suspend tasks or
documents through `configure_work` with `tasks_enabled`, `documents_enabled` and the
current feature `expected_revision` (0 initially). Suspending documents hides the document register and denies Storage reads/uploads,
preserving files and audit history. The original Legal
workspace gate and existing database discipline/team grants still apply.

The existing `npm run test:legal-workspace` now covers the actual three migrations,
storage policies with deliberately broad legacy grants, upload/version recovery and
interactive task/date/document flows. Also run `test:legal-matter-foundation`,
`check:conveyancing-preservation` and root `check:app`. Before a separately authorised
release, run real authenticated Storage/PostgREST flows, independent-session races,
Supabase advisors and the firm's manual workflow validation.

## Phase 5 — optional firm reporting

`VITE_ARCH9_LEGAL_OVERVIEW_ENABLED=true` adds **Firm Overview** and upgrades the existing **All Matters** route for explicitly granted firm management. It still requires the Legal enable switch, firm allowlist, active membership and a current director/partner or firm administrator role. Ordinary attorneys retain My Matters. Turning the overview switch off restores the previous navigation and register without a data reversal.

The read-only `arch9_legal_firm_overview` RPC reports only Legal matters passing the register's current matter-access predicate, including restricted-team rules. It separates total, active, pending intake, on-hold and overdue matters; workload counts active matters by responsible attorney. Upcoming dates cover today through 14 days ahead. Dates and interventions show at most 12 entries. Dates use Africa/Johannesburg and respect the tasks feature switch. Practice filtering applies to all Legal figures. The RPC neither reads nor changes conveyancing tables.

All Matters uses one practice selector and search, with separate Legal and Conveyancing source sections. Each section retains its source sort, scope, count and 20-row pagination, using URL parameters `page` / `conveyancing_page`. There is no combined KPI or cross-source status conversion. Legal detail links retain the return URL. Conveyancing identity is `conveyancing:<firm>:<transaction>`; Legal identity is `legal:<matter>`. Conveyancing rows offer only the existing transaction link, never generic Legal commands.

The dynamically loaded conveyancing adapter delegates to the unchanged rollout, canonical v2 snapshot normalizer and operational register reader. Its canonical/property guard matches Attorney Matters; unsuitable snapshots use the same authorized operational reader with its existing `force:true` option, then the unchanged register normalizer. This refreshes role/team scope rather than consuming a stale operational cache. It does not reconstruct transactions, expand role lanes, cache results or elevate conveyancing permissions based on a Legal grant. Counts identify **Firm access** or **Assigned access**. Source failures settle independently and show unavailable, never a false zero; original Conveyancing navigation remains available.

Verification: `npm run test:legal-workspace` covers reporting authorization/read-only behavior and register/UI parity. `node scripts/check-conveyancing-preservation.mjs` checks protected sources and established attorney suites. Apply the new migration through the repository release guard only after explicit approval. Before enabling a hosted pilot, compare snapshot and fallback rows/counts/search/paging for actual firm management and assigned roles, and record reader latency/query plans against the existing attorney performance baseline. The local browser preview uses actual Legal migrations with fixture data; conveyancing display data is synthetic. It does not prove hosted reader latency or hosted permissions.

Phase 5 local verification (11 October 2026): 5 workspace/database/shell tests, 24 UI tests and 9 foundation tests passed; the full conveyancing preservation suite and `npm run check:app` passed. App lint retains 613 existing warnings (zero errors); build retains existing circular-import and large-chunk warnings. Desktop/mobile fixture preview verified reporting, source counts and independent pagination; the 390px register had no horizontal overflow. Supabase advisors could not run because the local database on port 54322 is stopped; an advisor run against the intended rollout database remains pending.

## Phase 6 — bounded Trusts setup pilot

The first further discipline is **manual Trusts setup**. This is a pilot checklist, not an automated trust registration, amendment, accounting or administration workflow. Debt Collection, deceased estates and Family Law retain manual foundation capabilities; they have no new approved templates in this delivery.

Enable the UI with `VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED=true`, alongside the existing Legal pilot/firm gates. The separate `trust_pilots` setting starts absent/disabled. In a Trusts matter's Work tab, a currently granted firm manager with review capability sees **Review pilot checklist**. Review representative firm matters and confirm parties, intake, evidence, dates, professional approvals and closure before recording a firm approval note. Approval is for the displayed `trust_setup_manual_v1` only. The five manual tasks record instructions, parties/authority, deed/evidence review, professional review, and setup outcome/handover. They do not submit applications, determine validity or close a matter automatically.

Approval and pause commands retain the reviewer, note, timestamp, configuration revision, durable request receipt and audit event. Starting is an explicit matter-team edit command, requires active responsible-attorney edit access and current firm approval, appends tasks without replacing manual work, and pins the version on the matter. Start, task, date and document commands retain existing authorization, optimistic revisions and retry rules. Existing intake/party/team/closure decisions stay manual in the foundation; completed tasks require recorded notes. The firm must verify any external approval or outcome and record the applicable evidence in private Documents before closing.

Trusts dates record instructions, deed review, setup outcome and handover in SAST. Pre-existing execution/custody dates remain stored and editable with explicit existing-record labels. Pausing new starts or turning off the pilot UI retains tasks, recorded version, dates, documents and history. Saved Trusts dates continue through the dedicated authorized date command when the UI switch is off. Disabling Legal/Trusts access or the tasks feature still denies access/mutations as established; no Legal recovery changes conveyancing configuration.

New RPCs: `arch9_legal_trust_pilot_read` and `arch9_legal_trust_pilot_command` (`configure_trusts`, `start_trusts`, `save_trust_dates`). Public wrappers are invokers; private functions check current firm/discipline/team rights and role/review capability. The additive migration is `20261011163733_arch9_legal_trusts_pilot.sql`; previous migrations remain unchanged. No migration, approval, pilot configuration or deployment is applied remotely by implementation work.

`npm run test:legal-workspace` now checks the actual Trusts SQL and UI: review/version gating, pause recovery, restricted access, stale requests, retries, existing Wills preservation and switch-off date recovery. Firm acceptance of representative setup matters, hosted RPC/Storage checks and database advisors are still required before activation. Local fixture approvals are test data and are not a firm's acceptance.

Phase 6 local verification (11 October 2026): 6 database/shell tests, 34 UI tests and 9 foundation tests passed; the full conveyancing preservation suite and app check passed. Focused lint on the final Legal sources is clean. Browser fixtures using all actual Legal migrations verified review/approval, checklist start, Trusts date persistence, pause recovery and a 390px layout without overflow. Approvals in these fixtures are test records. Database advisors remain unavailable because local Supabase on port 54322 is stopped; hosted advisors and firm acceptance remain rollout checks. Approval drafts retain their original configuration revision and intended action; work/date saves preserve unsaved reviews. Recovered saves retain their original completion handler, as well as their frozen request, so another form cannot mis-handle an approval response.
