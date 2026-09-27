# Rental lead pilot acceptance

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
