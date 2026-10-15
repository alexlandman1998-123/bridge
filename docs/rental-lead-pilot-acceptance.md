# Rental lead pilot acceptance

**Production update — 15 October 2026:** The approved release applied the four
remaining landlord migrations and promoted the primary app, admin and public
websites. See the [verified production release record](arch9-production-release-20261015.md).
The local-phase results below are retained as historical evidence; hosted Auth,
private Storage and named agency canary verification remain outstanding.

## Landlord profile acceptance — 15 October 2026

The latest primary-app profile implementation now has a repeatable local matrix
across individual, company, trust, close corporation and multiple owners, plus
foreign and other classifications resolved to each of those five structures.
All 15 resolved combinations traverse saving, reopening, clearing, concurrent
edit rejection, requested corrections, evidence upload/review and listing handoff.
Two unresolved cases verify retained drafts and blocked submission/readiness.

Each case starts with a distinct synthetic Client/contact, lead, property and unit.
No signed mandate, accepted evidence or completed journey is seeded. The same
current schema chain now runs in the existing joined landlord-to-tenancy check.
The listing save service and authorised Client update run against the actual API
and PostgreSQL projections, preserving exact IDs, legal structures, private data,
selected signatories, historical evidence and unrelated listing capture answers.

The checks cover declaration locks, agent-only correction/review, stale versions
and stale discovery, invalid captured values, explicit empty contact/tax answers,
public/private projection, signed disclosure gating, replacement receipts and
retired evidence generations. Wrong-property handoff and repeated listing/vacancy
links are checked. Autosave recovery and field applicability run for all resolved
combinations across the agent profile, invited form and listing editor.

The expanded landlord document matrix remains a policy preview. These checks
verify saved uploads and staff review without activating its compliance approval
status. The existing completed/signed prescribed disclosure gate remains enforced.

Run from `the-it-guy/`:

```sh
npm run test:rentals-application-handoff
```

Local results: the focused handoff command passed **79 tests in 5 suites**,
including the existing structural handoff check. The broader profile/Client/UI/API
regression passed **338 tests in 27 suites**. The existing multi-property handoff,
listing document matrix/workflow and vacancy checks passed **14 more tests in
4 suites** (352 distinct tests across 31 suites). Migration reference integrity passed
with 42 test files scanned; scoped ESLint reported no issues. These are automated
local acceptance results, not a hosted release or compliance approval.
The primary `check:app` also passed: lint had 0 errors and 614 existing warnings,
all nine baseline checks passed, and the production build completed. The running
local development server returned HTTP 200 on port 5173.

The acceptance work changes tests, local fixtures, the existing focused command
and this documentation. It adds no new schema migration or product behaviour.
The previous consistent-saving, shared-rule and selected-signatory migrations
remain release dependencies. No remote migration, record write, hosted upload,
email, listing publication or deployment has been performed. Hosted Auth, private
Storage and approved agency canary checks remain part of the subsequent release
verification in the database runbook; this synthetic fixture does not certify them.

## Rental repair acceptance — 15 October 2026

The six rental repair phases are implemented locally in the primary Arch9
workspace and shared database layer. Production release and hosted account,
Storage and agency acceptance remain pending. The September pilot record below
is retained as historical evidence; these new results do not certify that pilot.

The current joined acceptance check starts with separate new landlord and tenant
leads and an existing managed property/unit. It runs actual saved appraisal,
landlord discovery, public uploads, declaration and staff review; records the
uploaded mandate; saves and links a monthly listing and one vacancy; records a
saved viewing and its attended outcome; prepares and submits the linked tenant
application; reviews current evidence and screening; requires Placement ready;
creates one tenancy; uploads the agency agreement and every signed copy; verifies
payment uploads; completes incoming handover and activates the tenancy. Actual
portal invitations are accepted by their invited users, both portals read the
saved state, maintenance retries reuse one request, and revocation denies access.
The saved sales lead remains unchanged throughout.

The joined check covers individual, joint, company, close-corporation and trust
tenants. Entity changes retain historical checklist rows, while uploads and
approval use active current requirements. No completed application or signed
mandate is seeded into this joined scenario, and no guard is disabled for it.
Older compatibility suites retain their explicitly marked historical fixtures.

This acceptance found and repaired a portal activation retry failure. A signed-in
person can acknowledge their already accepted invitation while its exact
membership remains active. The retry preserves the membership and original
acceptance timestamps. Wrong users, expired/revoked invitations and revoked or
replaced memberships remain denied; restoring access requires a new invitation.
The public command delegates to a private helper and retains the original
email-bound creation path. Browser roles cannot invoke the old privileged helper.

Repeat from the primary package:

```sh
npm run test:rentals-application-handoff
npm run test:rentals-tenancy-move-in
npm run test:rentals-lease-signing
npm run test:rentals-migration-reference-integrity
```

The existing handoff command now executes the current joined journey and
activation retry SQL tests in addition to its established checks. The combined
repair regression run passed **89 tests in 11 suites**. The isolated browser
verified first acceptance with a deliberately lost response, retry into the
actual portal hub/property screen, preservation of one membership and its
timestamps, and denial when the old invitation is reused after revocation.
This browser uses synthetic Auth sessions and isolated PostgreSQL. It does not
prove hosted signup, email confirmation, delivery or actual Storage downloads.
Application build and lint results are recorded in the local verification packet
at `tmp/rentals-phase6-20261015/verification.json`.

### Exact repair migration order

1. `20261014185302_rental_lead_journey_guards.sql`
2. `20261014200329_rental_listing_vacancy_handoff.sql`
3. `20261014203952_rental_tenant_application_connections.sql`
4. `20261014210353_rental_tenancy_handoff_uploaded_agreements.sql`
5. `20261014214622_rental_portal_journey_parity.sql`
6. `20261014221411_rental_client_portal_activation_retry.sql`

Apply the reviewed database scope before the matching primary app/API. No remote
migration, upload, invitation, email, publication or deployment was performed by
this acceptance work. The release packet records current source hashes; this
active checkout is not an immutable deployment candidate. Preserve unrelated
work and prepare a scoped candidate for the separately requested release.

Before an approved release, follow the [database release runbook](database-release-runbook.md):
verify target identity, recovery evidence, exact migration dry-run scope and the
current prerequisite objects. The lead migration checks the existing seller-link
function; stop and review a failed precondition rather than changing its history
or bypassing it. Keep the six repairs separate from unrelated pending migrations.
The temporary direct-production pilot policy remains applicable to an explicitly
requested push; staging drift alone is not a blocker under that policy.

After release, record real target/project, app revision, user and branch scope,
record IDs, timestamps and evidence for:

- Tenant and landlord intake staying out of Sales, including PP/P24/website source classification.
- Staff save/reopen, one vacancy/application/tenancy on retry, and wrong organisation/branch/agent denial.
- Landlord upload/review, mandate and listing links; tenant confirmation, submission, active evidence and review gates.
- Actual private Storage uploads/downloads, agreement versions and all signatures, verified payments, handover and activation.
- Real signup/email confirmation, activation response recovery, both portal audiences, maintenance and revoked/expired access.
- Preservation of historical signed evidence and related genuine sales records.

Use only explicitly approved canary records and contacts. Publishing adverts or
sending provider updates requires its separately approved controlled action.
Keep uploaded documents and audit receipts during recovery. Restore a captured
compatible application bundle or pause affected access under the reviewed
recovery plan; do not reset data or remove memberships, signatures or evidence.

---


Status on 26 September 2026: **prepared for a controlled pilot; no agency journey has been run or approved in this task.** This packet covers lead intake and processing for tenant and landlord leads in the primary Arch9 workspace, plus the public website enquiry entry points. It does not authorize a migration, feature flag change, email, listing publication, or deployment.

## Pilot boundary

| Item | Value |
| --- | --- |
| Agency/workspace and staff cohort | Pending selection |
| Target environment and app URL | Pending selection |
| Candidate commit and database migration receipt | Pending; the working tree is active |
| Rental feature flag and allowlist evidence | Pending target-environment verification |
| Pilot reviewer and observation window | Pending selection |

Record the exact workspace ID, staff user IDs, target project identity, application version, and the status of `20260926172852_rental_lead_intake_classification.sql` before creating pilot records. Keep production access on the existing workspace or user allowlist. Do not use a global enablement for this cohort.

## Automated evidence collected locally

| Check | Result |
| --- | --- |
| Rental lead classification, import, access, pipeline, handoff, viewing, application, mandate, follow-up, outcome, and evidence models | 16 tests passed |
| Rental lead route and Sales lead separation integration check | Passed |
| Website lead intent test and website typecheck | Passed |
| Business workspace access, rental scope, and module availability | Passed |
| Applicant journey and lead-to-application handoff | Passed |
| Landlord mandate foundation, listing creation, and listing release gate | Passed |
| Staging environment safety audit | Ready; staging and preview both point to the non-production staging project; rental flags default off |
| Controlled pilot launch and execution-monitor contracts | Passed |

These are local code checks. They do not prove that the migration, website route, database policies, or end-to-end journeys work in the chosen pilot environment.

## Agency pilot journeys

For every row, record the actor, workspace, timestamp, lead ID, linked record IDs, the observed stage, and a screenshot or read-only query reference. Mark a row passed only after observing it in the chosen environment.

| Journey | Expected evidence | Pilot result |
| --- | --- | --- |
| Tenant rental listing enquiry and general Rent enquiry | Both enter the tenant rental queue; neither appears in Sales | Pending |
| Landlord “List your rental” enquiry | Enters the landlord rental queue with property address; does not appear in Sales | Pending |
| Staff capture and CSV import for both roles | Correct role, source, duplicate handling, and assignment | Pending |
| Organisation, branch, and assigned-agent views | Unassigned and branch leads appear only to authorised staff; wrong-scope access is denied | Pending |
| Tenant processing | Contact, qualification, owner, follow-up, and outcome persist on the same lead | Pending |
| Viewing handoff and retry | Scheduling saves a viewing before the lead advances; only an attended outcome reaches Viewing completed; retry reuses the record | Pending |
| Applicant invitation and submission | Creating the link leaves Application pending; a submitted linked application is required for Application submitted | Pending |
| Landlord processing | Contact, qualification, owner, follow-up, and outcome persist on the same lead | Pending |
| Mandate and listing handoffs | Signed mandate evidence advances the lead; a saved listing in the same organisation is linked before Listing created; retries do not create another lead milestone | Pending |
| Failure cases | Draft application, missing viewing, unsigned mandate, missing listing, and wrong-organisation records cannot advance a lead | Pending |

Stop the pilot and record the incident if a rental lead enters Sales, a staff member sees an out-of-scope lead, or a lead stage gets ahead of its saved records. Record how a partial handoff was recovered before resuming.

For the rental end-to-end certification receipt, attach referenced, timestamped results for `tenant_and_landlord_enquiries_excluded_from_sales`, `lead_branch_and_agent_access`, `application_link_pending_until_submission`, and `landlord_lead_signed_mandate_and_linked_listing`. These four checks join the existing eight rental scenarios; local test output cannot stand in for agency pilot evidence.

## Release readiness

The read-only rental release receipts checked on 26 September 2026 are **blocked**:

- Staging rebuild gate: source baseline is locked, but local verification is not bound to the source chain and the configured rebuild target is not approved. Its target differs from the project identified by the staging safety audit.
- End-to-end certification: no matching rebuilt-staging receipt or passing referenced evidence for the twelve required rental scenarios, including the four lead-specific pilot checks in this packet.
- Production preflight: no certified staging receipt or immutable release candidate; the shared working tree is not clean.

The temporary direct-production pilot policy in [the database release runbook](database-release-runbook.md) can supersede the staging prerequisite for a **separately requested production push** through 26 December 2026. The older rental release gate still reports the staged route as blocked. Before any release, choose the target and reconcile that gate with the selected release path, review the exact migration and deployment scope, and obtain the required approval in that task.

The pilot is complete only when the chosen cohort has run every applicable journey above, failures are resolved, record references are attached, and a reviewer records the decision. No pilot result or release approval has been recorded here.
