# Rental onboarding discovery and document contract

Owner: primary Arch9 rental workspace. Prepared 3 October 2026.

Phase 1 deliverable: the discovery questions, conditional evidence matrix and acceptance scenarios for long-term rental onboarding. This is an implementation specification, not active application behaviour or compliance approval. The requester authorised preparation of these rules; agency policy choices below remain proposed until confirmed. Later phases implement and verify them.

## Scope and established decisions

- Reuse the buyer/seller pattern of discovery answers determining visible questions, required answers and document requirements. Extend the existing shared tenant wizard rather than creating another tenant form.
- Agent capture and client onboarding must fulfil the same saved requirements. The agent may upload received evidence; the client may provide it through onboarding.
- Request all tenant supporting evidence during application. Lease preparation must not introduce a routine second collection stage.
- Landlord identity evidence is reusable subject to current verification; disclosure and mandate evidence belong to the particular property and mandate.
- Saving an incomplete draft is allowed. Submission means collection/declarations are complete; approval additionally requires reviewed evidence and the applicable screening/decision outcomes.
- Ongoing portals, payment collection, maintenance, inspections, short-term rentals, deployment and database changes are outside Phase 1. Commercial rentals need an explicit use/compliance extension before this residential baseline is represented as sufficient for them.

## Current code and reuse boundary

| Concern | Current source | Implementation direction |
| --- | --- | --- |
| Buyer branch questions and document triggers | `src/lib/buyerOnboardingFlowContract.js`; `src/lib/buyerOnboardingFlow.js` | Adapt the flow contract and saved rule-version pattern; do not copy cash/bond, OTP or transfer requirements. |
| Seller identity changes and exact document assignment | `src/lib/sellerOnboardingReplacement.js`; `docs/seller-document-experience-p1-7.md`; `docs/seller-document-transaction-continuity-p0-6.md` | Preserve stable subjects, exact requirement links, review history and safe handoff. Do not copy sale-specific spouse or certificate rules. |
| Tenant fields and conditional uploads | `src/services/rentals/rentalApplicationFieldContract.js`; `src/services/rentals/rentalApplicationWizardModel.js` | Keep existing field paths where possible; extend discovery and replace inconsistent requirement selection. |
| Tenant save and upload | `src/services/rentals/rentalApplicationRepository.js`; `server/services/rentalApplicationDocumentUpload.js` | Keep application version guards and shared agent/applicant upload service. |
| Landlord discovery and references | `src/services/rentals/rentalLandlordWorkspaceModel.js`; `src/services/rentals/rentalLandlordWorkspaceService.js` | Preserve existing records; replace reference-only completion with linked, reviewable evidence in later phases. |

The current landlord operational portal is not a landlord onboarding upload journey. The current tenant checklist is a partial matrix. Existing test passes do not establish coverage of the proposed rules.

## Discovery order and required answers

These are required to confirm discovery, not to save a partial draft. Unknown answers remain explicitly unresolved; do not silently select Individual or infer signing authority.

| Step | Landlord discovery | Tenant discovery |
| --- | --- | --- |
| Legal party | Who grants the mandate: individual, joint individuals, company, CC, trust or other legal arrangement? | Who will contract as tenant: individual, joint individuals, company, CC, trust or other legal arrangement? |
| Identity | Individual names, identity type/number, nationality and current address; entity legal name, registration/reference, jurisdiction and address. | The same identity information for the contracting party; identify the primary contact separately from the tenant entity. |
| People and capacity | Identify each owner/co-owner, representative, relevant trustee and beneficial owner; establish each role and basis of authority. | Identify co-tenants, authorised signatories, trustees, relevant beneficial owners, guarantors and sponsors; distinguish occupants from contracting parties. |
| Contact | At least one usable contact method for each person who must act or consent; alternative assisted contact arrangements must be recorded. | Same rule. Digital delivery requires an appropriate delivery destination; manual capture must not require a fictitious email address. |
| Property and rights | Select each property, establish ownership/right to let and co-owner authority; mandate scope, scheme restrictions, existing tenancy and third-party payout account. | Select the vacancy/unit, intended occupation, proposed household, rent/deposit context and relevant property restrictions. |
| Funding | Record relevant landlord relationship/funding information under the RMCP; request enhanced evidence when triggered, not blanket personal payslips. | Who funds rent and deposit? For each contributor: income source/type, amount/frequency, commitments and contribution. Record sponsor and guarantor separately. |
| Review | Show the saved party, people, property and applicable evidence requirements. | Show the saved party, people, funding and applicable evidence requirements. |

Foreign nationality/residency is a separate attribute and does not replace company/trust/individual type. A person may hold multiple roles; one stable person record should carry those roles without duplicating their ID request. Current single-role fields need an explicit adaptation in later phases.

For each person in identity-verification scope, require sufficient identifying attributes, including identity number/type or a recorded supported alternative. Require actual authority evidence when the person binds another party. A contact-only representative is not automatically authorised. Do not demand personal affordability evidence from every signatory, trustee or beneficial owner.

Other entities, partnerships, deceased estates, representatives with exceptional powers and uncertain authority use a manual review route. Do not silently map them to Individual. Marriage alone does not trigger the sales spouse pack; request relationship/consent evidence only when the actual rental authority arrangement requires it.

## Evidence vocabulary and timing

Each matrix key below is a proposed business purpose, not a claim that an existing database column or upload type supports it. Each generated requirement must retain organisation, subject, scope, purpose, applicable rule/version and discovery revision. One file can support multiple purposes only through explicit, reviewed assignments.

- **Legal:** a specific legal obligation; the evidence method may still depend on the applicable law and RMCP.
- **Policy:** recommended agency collection policy, awaiting the decisions below.
- **Conditional:** generated only by the stated scenario, with the reason visible.

Tenant rows are all requested at application. Landlord rows are requested during onboarding, with the disclosure timing specified below. Files that only arise later, such as an executed lease, executed guarantee, payment receipt or incoming inspection, are later event records, not missing application uploads.

## Base document matrix

| Purpose key | Subject and scope | Trigger and evidence | Basis |
| --- | --- | --- | --- |
| `identity` | Each relevant natural person; identity revision | Official identity evidence or approved reliable verification evidence. | Legal verification obligation; method under RMCP. |
| `address` | Relevant person/entity; identity revision | Current address evidence or supported alternative. | Proposed policy; verification scope under RMCP. |
| `entity_registration` | Company/CC; entity revision | Current registration/existence evidence. | Entity verification and proposed evidence method. |
| `trust_founding` | Trust; entity revision | Trust deed and relevant amendments. | Conditional verification/authority evidence. |
| `trust_authority` | Trust; entity revision | Current Letters of Authority or appropriate foreign equivalent. | Conditional verification/authority evidence. |
| `beneficial_ownership` | Entity/trust and relevant people; control revision | Ownership/control information and required verification evidence; establish the applicable trust scope. | Legal where applicable under FICA; RMCP governs evidence. |
| `signing_authority` | Represented party and signatory; authority revision | Resolution, delegation, power of attorney or other valid authority covering this mandate/letting/application. | Conditional authority evidence. |
| `privacy_notice` | Relevant data subject; notice version | Record provision/acknowledgement of the privacy notice and applicable processing basis. | Legal privacy duties; acknowledgement is proposed recording policy. |
| `screening_authorisation` | Each person actually screened; application/wording revision | Appropriate credit, identity, employer and reference authorisations. Primary applicant cannot consent for everyone. | Proposed screening policy plus applicable legal/provider requirements. |
| `application_declaration` | Applicant or authorised submitter; application revision | Accuracy and authority declaration; online acceptance or reviewed signed manual evidence. | Proposed policy. |

Privacy acknowledgement is not blanket consent, and consent is not the only possible lawful processing basis. Do not require irrelevant sensitive documents just because the sales module collects them.

## Landlord property and mandate matrix

| Purpose key | Scope | Trigger and evidence | Timing/basis |
| --- | --- | --- | --- |
| `property_disclosure` | Property and mandate | Fully completed, signed prescribed disclosure; provide it to the prospective tenant and attach the completed form to the lease. | Legal: obtain before accepting the mandate, not afterwards. |
| `right_to_let` | Property and legal party | Ownership evidence or other legal right to let; resolve discrepancies. Underlying lease/permission for subletting. | Proposed standard authority check before mandate activation. |
| `co_owner_authority` | Property and represented owners | Co-owner signatures or valid authority for the proposed arrangement. | Conditional; a primary-contact flag is insufficient. |
| `signed_mandate` | Property and mandate revision | Actual signed letting/management mandate with fees, term and scope. | Proposed operational requirement; reference text alone is not file evidence. |
| `payout_account` | Landlord/payee account revision | Account confirmation for managed-rental proceeds; independently validate beneficiary and investigate third-party payees. | Conditional proposed policy for managed rentals. |
| `scheme_rules` | Property and rules revision | Applicable body corporate/HOA rules and letting/pet permissions. | Conditional operational evidence. |
| `management_information` | Property | Relevant service/levy statements, billing responsibility and meter information. | Conditional proposed management policy. |
| `existing_tenancy_pack` | Property and existing tenancy | Current lease, deposit ledger, payment history and inspection records for takeover. | Conditional management takeover. |
| `property_compliance` | Property/installation/use | Evidence required by the applicable installation, use and local rules. | Conditional; no universal copied sales certificate pack. |

## Tenant funding matrix

Require income evidence from every person/entity whose contribution supports affordability. Do not generate personal income evidence for a zero-income applicant funded entirely by an accepted guarantor/sponsor route. A sponsor's funds do not by themselves create an enforceable guarantee.

| Funding route | Income evidence | Statements and additional evidence |
| --- | --- | --- |
| Salaried | Payslips; employment confirmation when needed. | Matching personal bank statements. |
| Contract/commission | Engagement contracts and payment records. | Statements over a representative period; employer/client corroboration where appropriate. |
| Self-employed | Business income records and current accounts. | Relevant business/personal statements; tax evidence only where justified. |
| Entity tenant | Entity financial statements or current management accounts and funding explanation. | Entity statements, assigned to the entity rather than the contact person. |
| Pension/annuity | Pension/annuity payment evidence. | Matching statements or other dependable funding evidence. |
| Savings/investments/other | Evidence of actual available funding and sustainability. | Statements and source evidence appropriate to that route. |
| Guarantor/sponsor | Guarantor/sponsor identity, funding evidence and applicable authorisations. | Establish relationship and commitment; obtain the full relied-upon guarantor pack during application. Executed guarantee is a later agreement record where appropriate. |

Additional purposes: `rental_reference` for applicants with relevant history (agency obtains/records the reference); `rental_payment_history` when corroboration is needed; `third_party_funding` when another party pays; `enhanced_due_diligence` when the RMCP requires additional source-of-funds/wealth evidence; `payment_account` when the selected payment method requires it. Provide a first-time-renter route without inventing rental history. Debit-order authority must reflect the actual agreed arrangement.

## Requirement lifecycle and persistence contract

1. Resolve and confirm discovery from saved answers. Preview unsaved changes separately; do not dispatch requests from them.
2. Persist the checklist with stable requirement IDs, subject IDs and rule/discovery versions. Agent and client use the same instances. Do not fulfil requirements by filename or category alone.
3. Track missing/requested, received, accepted, rejected, expired and superseded separately. Collection progress and approval readiness are separate calculations shared across views.
4. Select one current document version consistently. A rejected current replacement must not fall back to an older accepted file. Keep the older file as history.
5. Changing identity or authority invalidates relevant assignments/reviews. Changing branch or funding reassesses applicability; preserve previous files and decisions without silently transferring them to a different subject.
6. Guard concurrent saves and upload completion against the current revision. Failed saves retain edits; repeated actions do not duplicate requirements, requests or completion records.
7. Record manual signatures/consents as reviewed evidence with signer, wording, date and actor. Agent upload alone is not applicant consent. Digital submission remains an explicit applicant action.
8. Reuse identity evidence only after current subject, scope, freshness and access checks. Affordability, property context, decisions and consents stay specific to the relevant engagement. Handoff preserves provenance and file access without copying files unnecessarily.

The exact storage and migration design belongs to Phase 3. This document does not authorise changes to existing persisted rental or sales records.

## Scenario acceptance matrix

All cases must derive identical requirements from agent capture and client onboarding after save/reopen. Later phases must prove these cases; this table is not a claim that they currently pass.

| Scenario | Required outcome |
| --- | --- |
| Individual landlord with one property | Person base pack plus property disclosure, right to let and signed mandate; no company/trust evidence. |
| Joint owners | Each relevant owner identified; property authority explicitly established; no assumed authority from primary contact. |
| Company/CC landlord | Entity, control and signatory evidence plus the property pack; personal income only if separately relevant. |
| Trust landlord | Founding/authority/control evidence and relevant people plus property pack; uncertain trust arrangements enter review. |
| Landlord with several properties | Reusable person/entity evidence; separate disclosures and mandates for each property. |
| Individual employed tenant | Person base pack, declarations/authorisations, salary evidence and applicable statement/reference requests. |
| Joint tenants | Stable identities for all contracting people; affordability evidence only for relied-upon contributors; separate authorisations. |
| Company/CC tenant | Entity income assigned to entity; contact/signatory identity and authority assigned to the right subjects. |
| Trust tenant | Trust documents and relevant people; funds and authority resolve to the correct subjects. |
| Student/unemployed tenant funded by guarantor | No impossible primary-income request; full guarantor evidence and separate consent; guarantee status explicit. |
| Contractor/self-employed/retired/savings-funded tenant | Evidence follows actual funding route; salaried payslips are not universally required. |
| Foreign individual or foreign entity | Legal type retained; supported official identity/entity evidence and any applicable conditional review. |
| Same person is signatory and beneficial owner | One person identity requirement with both roles; no duplicate ID request. |
| First-time renter | Supported history alternative; nonexistent landlord reference does not make discovery impossible. |
| Other entity/exceptional representative | Explicit manual review; cannot appear fully verified through an Individual fallback. |
| Identity/signatory replacement | Old files remain history; new person cannot inherit accepted identity/authority/consent. |
| Rejected replacement | Agent, applicant, collection and review all select current rejected version; submission cannot fall back to old acceptance. |
| Failed save, failed refresh, concurrent edits and upload retry | Accurate feedback, retained edits, no silent overwrite, duplicate requirement or false upload completion. |
| Lead/property/application handoff | Evidence remains accessible and correctly scoped; no routine repeat request for fulfilled current evidence. |

## Policy decisions awaiting confirmation

These are recommended defaults for review, not activated requirements or statutory thresholds. Implementation may prepare configurable rules, but rollout must not present unconfirmed values as approved agency policy.

| Decision | Proposed starting point | Decision owner |
| --- | --- | --- |
| Income/statement periods | Three latest payslips and three complete statement months for salaried applicants; representative longer period for variable income. | Rental operations and compliance. |
| Address evidence/freshness | Recent evidence with recorded acceptable alternatives; define actual age limit under RMCP. | Compliance. |
| Entity/trust scope | Identify relevant natural persons and controls; verification method and enhanced evidence follow the actual RMCP. | Compliance. |
| Affordability standard | Assess contributions and commitments; do not represent a fixed rent multiple as legislation. | Rental operations. |
| Manual declarations and screening | Record approved wording and signed evidence; verify provider requirements and permissible processing basis. | Compliance and rental operations. |
| Reuse, access and retention | Check current identity and evidence currency; restrict personal financial access; specify retention for unsuccessful applications separately. | Compliance/privacy owner. |
| Exceptional and commercial routes | Explicit review and use-specific extension before enabling complete self-service approval. | Rental operations and legal/compliance. |

Phase 1 is complete as a documented specification when the questions, trigger matrix, evidence scopes and acceptance scenarios are reviewable. Policy approval remains outstanding; do not label the agency's RMCP reviewed or the matrix operationally approved without that decision. Phase 2 can fix the confirmed existing contradictions without deploying these proposed policy values.

## Sources and verification boundary

- [Property Practitioners Act section 67](https://www.gov.za/sites/default/files/gcis_document/201910/42746gon1295.pdf): prescribed disclosure timing and attachment to lease.
- [FIC Guidance Note 7B](https://www.fic.gov.za/wp-content/uploads/2026/08/Guidance-Note-7B-%E2%80%93-Implementation-of-various-aspects-of-the-FIC-Act.pdf): risk-based verification, reliable documentary/electronic sources, entity/trust scope and timing. It does not prescribe the proposed payslip/statement periods.
- [POPIA sections 10, 14 and 19](https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf): relevant/non-excessive collection, retention and security.

The discovery audit reproduced conflicting current/replacement selection, retained evidence after primary identity edits, guarantor funding versus primary-income requirements, and incomplete additional-person validation. Phase 1 added no runtime, database, deployment or live acceptance evidence. The Phase 2 local implementation below addresses these defects.

## Phase 2 implementation and release boundary

The primary transaction workspace now uses one current-document selector for collection, submission, review and required-document progress. A rejected replacement blocks completion instead of reviving an older acceptance. Saved identity, applicant type and representative/authority changes invalidate affected assignments while retaining the original files and assignment history; reverting an answer cannot revive stale evidence. A fresh explicit upload can satisfy that subject again. Additional people need an ID/passport number and an email or phone before full application submission.

Guarantor/contributor-funded zero-income individuals request income evidence and financial screening from the funding person. Entity income evidence belongs to the entity. Existing entity-income files assigned to `primary` need a fresh entity upload through the current flow; this change does not silently relabel historic personal evidence. The workspace loads document records through the existing organisation-scoped, security-invoker review summary rather than cached `application_data.documents`.

The append-only migration `20261003071610_rental_application_evidence_consistency.sql` mirrors the slots, screening subjects, assignment invalidation, current-file selection and v2 submission guards in PostgreSQL. It also exposes document creation timestamps for consistent replacement ordering. Existing submitted answers remain locked and existing reviewer permissions remain unchanged. Pure helper functions respect the caller's table access; applicant access remains through the server endpoint.

Local regression coverage includes save/reopen, identity reversal, removed and changed representatives, stale link retention, rejected replacement, entity evidence ownership, funded-student submission, document progress, SQL/application parity, database submission guards, reviewer access and tenancy handoff. No remote migration, deployment or live acceptance has been performed. Release requires applying this migration together with the application update and checking an existing entity application and a fresh guarantor-funded application. Unconfirmed policy periods, address-evidence thresholds and the expanded landlord matrix remain for later phases.

Focused verification on 3 October 2026: 82 checks passed across 16 Vitest files; `test:rentals-lead-application-linkage` and the existing `test:rentals-phase21` checks passed. Focused ESLint completed with no errors and one existing JSX `Icon` warning in the application workspace page. The SQL checks execute the new migration in an isolated PGlite database; they are not evidence of a migration applied to Supabase or of a live browser flow.

`npm run build` also passed, including the existing post-build login probe. Vite reported existing mixed-import/chunk warnings and an outdated Browserslist dataset. No dependency update was made.

## Phase 3 saved requirement foundation

Phase 3 adds the shared requirement definitions and read repository in `src/services/rentals/rentalOnboardingRequirementModel.js` and `rentalOnboardingRequirementRepository.js`, together with the append-only migration `20261003072828_rental_onboarding_requirement_foundation.sql`.

After this migration is released, tenant application saves and saved rental-landlord discovery create/reconcile checklist records in the same database transaction as the parent save. Tenant definitions reflect the existing Phase 2 matrix, including optional statements/reference slots. Landlord definitions are a **preview**, not an activated compliance gate. Unresolved/exceptional landlord types generate no implied Individual pack. Existing landlord reference strings cannot fulfil any requirement. No requests, emails or new portal journeys are introduced in this phase.

- `rental_onboarding_checklists` ties each checklist to exactly one application or landlord lead and its actual organisation. It records the rule version and saved discovery revision. These records are separate from reusable profile data.
- `rental_onboarding_requirements` assigns a stable ID to each subject/scope/purpose tuple. Changes to identity/authority or a requirement becoming applicable again increment its generation; removed requirements remain superseded history. Income and employment answers are included in the discovery snapshot, but unconfirmed funding evidence policies are not activated.
- `rental_onboarding_checklist_revisions` preserves the saved discovery and requirement snapshot for each revision. Repeated identical saves and document-only saves do not create new discovery revisions.
- `rental_onboarding_evidence_assignments` records exact application-document IDs, requirement generation, discovery revision and agent/applicant/legacy provenance. Files from another application cannot be assigned, and an old assignment cannot silently satisfy a new generation. Existing document review/history remains the authority for acceptance; the new ledger does not create acceptance from upload or filename.
- The security-invoker summary derives missing, requested, received, accepted, rejected, expired and superseded states from the current requirement and document. Fresh replacements clear the previous file's expiry. No default freshness period is set. Collection and acceptance progress remain distinct, and preview requirements cannot count as completed operational requirements.

The new tables are read-only to authenticated clients and unavailable to anonymous clients. Internal save triggers and helper functions live in the private `rental_private` schema. Read access follows the current parent organisation/branch and existing parent-row permissions, including later branch moves. Application concurrency remains guarded by the existing versioned save. Landlord reconciliation reflects the canonical saved CRM payload; it does not add a concurrency guarantee to the older landlord editor.

This phase prepares the durable ledger and shared engine; existing Phase 2 UI/submission/approval calculations remain in place. Later workflow work must consume the saved requirement IDs/generations when switching to the expanded matrix, rather than mixing generated previews with persisted completion. There is no bulk rewrite/backfill: existing records acquire a checklist on their next legitimate save/review update. Locked historical/final applications remain untouched, and submitted snapshots remain locked. The landlord preview does not replace current landlord workflow gates or constitute policy approval.

The migration depends on the Phase 2 migration. Neither has been applied remotely in this task. Release the migrations in order with the application changes, then manually check agent/applicant save and reopen, a replacement upload, a saved landlord profile with two properties, and current organisation/branch access before activating later request flows.

Phase 3 focused verification on 3 October 2026: 109 distinct checks passed across 19 Vitest files, including the Phase 2 tenant flows, the current landlord editor, SQL/shared-definition parity, stable IDs/revisions, generation changes, replacement and expiry handling, referenced-file cleanup, cross-application evidence rejection, scoped RLS, private helper privileges and atomic rollback. The existing `test:rentals-lead-application-linkage` and `test:rentals-phase21` checks also passed. Focused ESLint passed with no warnings or errors. Database tests execute both migrations in an isolated PGlite database; they are not evidence of live Supabase changes or a live portal rollout.

Upload cleanup now retains stored bytes when deletion of the evidence row fails or is uncertain. This protects a committed requirement assignment if the save acknowledgement was lost; it does not treat an uncertain upload as successfully completed.

The production Vite build and existing post-build login probe passed on a retry with a 4 GB Node heap limit. The normal 8 GB build process was killed before reporting a compiler error. The successful retry reported existing mixed-import/chunk and Browserslist warnings; no dependency or build configuration was changed.

## Phase 4 saved checklist workflow

Phase 4 connects the primary rental application journey to the Phase 3 ledger. Agent capture, applicant onboarding, document review, the application list and approval readiness now consume saved requirement IDs, generations and current document assignments. The expanded landlord matrix appears in the agent's Documents tab as a saved **preview**. Its policy decisions and verified landlord file collection remain outstanding; saving a document reference does not fulfil a requirement.

The shared tenant wizard continues to capture discovery. Unsaved answers display a document preview and prevent submission. Saving reconciles the checklist; selecting a file saves first and resolves the returned requirement generation before preparing its upload. Primary applicants, entities, additional applicants, representatives and guarantors retain their own evidence slots. Requirements remain at application stage; no routine second leasing collection stage is added.

- Signed upload receipts bind the application, organisation, application version, named subject, purpose, saved requirement ID and generation. Both upload entry points resolve the checklist through the permitted parent scope. A stale or forged generation is rejected before file completion. Older versioned upload clients may resolve their subject/purpose to the current saved instance during preparation; signed completion still requires the bound instance.
- The application review summary includes saved requirement rows in the same database read as application answers and evidence. Missing, rejected, superseded-generation or expired evidence cannot be replaced in progress calculations by an older accepted file. Received evidence and accepted evidence remain separate measures.
- Public responses project only checklist presentation metadata, without private discovery fingerprints or storage paths. Failed checklist readback after an acknowledged public save/upload returns the committed application version with an unavailable checklist; submission stays disabled until a successful read. Agent capture likewise caches the acknowledged save before loading its checklist, so a failed subsequent read cannot make the editor retry an obsolete version.
- The new append-only migration `20261003075136_rental_saved_checklist_workflow.sql` extends the security-invoker review view and adds a private post-save gate. It executes after checklist reconciliation in the same transaction. New explicit assignments must match the current saved instance and selected document; submission requires every active required row received/accepted, while approval requires acceptance. A failure rolls back the application transition, checklist changes and related review events. Existing review, consent, permission and snapshot locks still apply.
- All public submissions require the current application version, including legacy drafts. No bulk backfill, remote writes, emails or release action is included. Existing drafts acquire a checklist on their next legitimate save. Final historical applications stay locked.

Release the Phase 2, Phase 3 and Phase 4 migrations in order together with the primary app/API update. These migrations have been exercised locally only. Before live acceptance, verify an existing draft can save and reopen, both agent and applicant replacement uploads, changing a person or funding branch during an upload, failed save/readback recovery, rejected/expired evidence, a two-property landlord preview, and organisation/branch restrictions. Landlord policy activation and landlord portal collection are separate follow-up work.

Phase 4 focused verification on 3 October 2026: 123 distinct Vitest checks passed across 21 files. Coverage includes both save-before-upload journeys, reopening a new assignment, generation-bound receipts for both upload sources, forged assignment rollback, expired evidence blocking submission and approval, unchanged review-event counts after a rejected approval, safe public projections and the saved landlord preview. The existing `test:rentals-lead-application-linkage`, `test:rentals-phase21` and `rentalApplicantPortalModel.test.js` Node checks passed. Focused ESLint passed without warnings or errors. SQL tests use an isolated PGlite database; UI tests use mocked transports, not live Supabase or a deployed browser journey.

The Vite production build and existing post-build login probe passed with a 4 GB Node heap limit. Existing Browserslist, mixed-import and chunk-size warnings remain; no dependencies or build configuration were changed.

The repository-wide `check:app` completed lint (zero errors, existing warnings) and its nine baseline Node suites. Its build encountered a transient unexpected-end-of-file error in the unrelated, concurrently modified `MarketingEventRsvpPage.jsx`. That page subsequently parsed successfully without changes by this task. A final Vite production build and login-probe rerun passed against the current workspace, with the existing build warnings noted above. The combined command's original failure is retained as verification history, not reported as a clean `check:app` run.

## Phase 5 landlord onboarding collection

Phase 5 adds the landlord journey to the primary transaction workspace. The agent's landlord Documents tab now creates seven-day secure onboarding links, revokes current or earlier links, uploads actual files against the saved matrix, and records evidence review. The public route is `/rental-landlord-onboarding/:token`. Both entry points use the same saved requirement ID, generation, document pointer and onboarding version. Identity/person evidence belongs to the landlord; disclosure, right-to-let, authority and mandate evidence remain separate for every portfolio property.

The append-only migration `20261003080507_rental_landlord_onboarding_collection.sql` adds versioned landlord state, private file assignments, hashed access tokens and command history. Server-only commands lock the current lead, verify the authorised organisation/branch/assignment scope and expected version, and reconcile discovery and current files atomically. Server-only snapshots hold the same parent lock while reading discovery, version and evidence. Agent editor saves also compare the discovery originally opened, so fetching a newer version cannot authorise overwriting another user's edits. The portfolio-to-listing handoff uses this path and reloads the saved portfolio before updating listing relationships.

Files use a private `rental-landlord-onboarding` bucket and the existing 8 MB/type policy. Signed upload receipts bind the lead, organisation, source, saved version, requirement and generation. Completion verifies stored size and MIME, then inserts the file and its assignment in one transaction. Repeating a committed receipt does not create another version or event. Failed completion deletes bytes only when absence of the evidence row is confirmed; uncertain/committed evidence stays intact. Acknowledged saves/uploads return their committed version even when readback fails. No filename, reference string or upload automatically constitutes acceptance. Replacement rejection cannot restore an older accepted file.

Public responses exclude internal notes, managed-property/listing/mandate links, current tenant details, storage paths, token hashes and requirement fingerprints. Public saves preserve those protected values, and only agents can add/remove portfolio properties, manage links, review evidence or request corrections. Submitted discovery/files lock until an agent supplies a correction message. Submission records the landlord's declaration wording version, timestamp and discovery snapshot; reopening preserves that declaration in history. Existing access links expose only expiry/revocation metadata to agents, and a raw token is returned once when created.

New active mandates require agent acceptance of the current property's completed and signed prescribed disclosure. The database gate checks the saved property link, current generation, reviewer and expiry; omitting a lead reference cannot bypass it. Existing active mandates with unchanged organisation, property and metadata are not retroactively reopened. Linking a generated mandate ID does not invalidate the signed mandate evidence; changing owner identity, a property address or signing authority supersedes the relevant evidence generation.

The broader landlord matrix retains preview policy mode. Landlords may send saved details for review while evidence remains outstanding; this does not mark compliance complete. Unconfirmed evidence periods, freshness rules and agency RMCP decisions are not activated. Foreign/exceptional owner types require resolution with the agent rather than an inferred Individual checklist. Ongoing landlord portal operations, payment management and live rollout remain outside this phase.

Release the Phase 2–5 migrations in timestamp order together with the compatible primary app/API changes. The summary now includes the landlord document pointer, so the final app requires the Phase 5 migration too. No migration, remote test write, email or deployment has been performed in this task. Phase 6 must verify the hosted agent/landlord continuity, actual Supabase signed uploads/downloads, revoked/expired links, access after branch reassignment, two-property disclosure gates and the reviewed release/recovery procedure before live sign-off.

Local verification: the focused rental regression suite passed 155 tests across 26 Vitest files, including isolated PostgreSQL migration/permission/gate tests and mocked API/component journeys. Two additional agent-panel checks passed for revocation after reopening and upload blocking during unsaved discovery, A further API check passed for current rental-branch access in addition to parent lead permissions, bringing the focused coverage to 158 distinct checks across 27 files. A final isolated SQL rerun passed all 27 checks; a prior concurrent rerun timed out during database setup under local resource pressure. Focused ESLint passed without warnings or errors. The existing linkage, rental application model, applicant portal model and lazy-route export Node checks passed. These checks are not evidence of live Supabase or deployed browser verification.

The app-wide lint check passed with zero errors and 553 existing workspace warnings; all nine baseline Node suites passed. The normal 8 GB build was stopped after prolonged local resource pressure. The Vite production build then passed with a 4 GB heap, and the existing post-build login probe exited successfully. The combined original `check:app` is therefore not reported as a clean full-command pass. Existing Browserslist, mixed-import and chunk-size warnings remain. No dependency or heap configuration was changed in source.

## Phase 6 continuity verification and release preparation

Phase 6 belongs to the primary transaction workspace. It closes two continuity gaps found during acceptance:

- Both public rental journeys now remount when their onboarding token changes. Navigating from a valid link to an unavailable link clears the previous person's form and pending journey state.
- A submitted landlord can proceed to mandate/listing handoff without reopening their legal discovery. The new server-only `rental_landlord_onboarding_link_property` command changes only the portfolio's mandate/listing IDs. It checks the current lead scope, managed property, active mandate and permitted listing, locks the parent and version, preserves declaration/status and current evidence generations, and treats an already committed link as an idempotent retry. Normal discovery/file changes remain locked until corrections are requested. Agent mandate creation and listing handoff now use this command.

The new migration is `20261003090506_rental_onboarding_handoff_continuity.sql`. The prior Phase 2–5 migrations are unchanged by this phase. No new routine document request or leasing-stage collection is introduced. The broader landlord matrix remains in preview policy mode; unconfirmed freshness, income-period and RMCP decisions are still inactive.

### Local acceptance evidence

On 3 October 2026, 163 distinct checks passed across the existing 27 focused Vitest files. The isolated PostgreSQL checks include permission restrictions, transactional rejection, unchanged tenant assignments across initial/retried tenancy conversion, and submitted landlord mandate/listing linking with the signed declaration retained. Component checks cover token changes to an invalid link. API checks cover public handoff denial and scoped listing denial before privileged access.

A real Chromium journey also exercised the product components, API handlers, migration functions and stored file bytes against an isolated local database. The fixture does not intercept HTTP responses or provide precomputed API snapshots. These journeys passed:

- Landlord save, file upload, reopening, agent rejection and agent replacement.
- A disclosure awaiting acceptance blocks a new active mandate; agent acceptance permits its own property and cannot satisfy the second property's mandate.
- Landlord submission, agent correction request, address correction superseding that property's old disclosure, and unchanged landlord identity evidence remaining available.
- Tenant identity/income upload, save/reopen, submission, requested correction, save and resubmission. All original requirement IDs, generations and document pointers remain unchanged for the unaffected evidence. Agent signed download returns stored bytes.
- Landlord link revocation followed by public access denial, and tenant/landlord mobile layouts at 390 × 844 without horizontal overflow.

The local harness starts with `GOMAXPROCS=2 node scripts/rental-onboarding-browser-fixture.mjs` from this package and prints its loopback URL (default port 4186). Open `/rental-landlord-onboarding/fixture-landlord`, `/rental-application/fixture-tenant` and `/__fixture/agent`. Each run uses fresh fictional records in memory and loses them when stopped. The shared database/client fixtures live under `server/tests/fixtures/`; the browser entry lives under `test-fixtures/` and is not imported by the production app. Its fake agent session and local signed-file adapter cannot authenticate against a hosted project. Production handlers retain their normal Supabase client; the optional server-side client factory is never supplied by an HTTP payload.

This is local integration evidence, not hosted Supabase acceptance: real Auth sessions, deployed parent-row policies, Storage infrastructure, target identity and live migration history remain unverified in this task. Existing isolated SQL/API checks cover expiry and branch/organisation restrictions; the browser did not change a hosted user's branch. Browser images were saved under `output/playwright/rental-phase6-*.png`. Early CLI selector mistakes and a concurrent database-setup timeout were corrected; the final focused suite passed with one worker.

Final local verification: focused ESLint passed without warnings or errors. App-wide lint passed with zero errors and 554 existing workspace warnings; all nine baseline Node suites passed. The established rental linkage, application model, applicant portal model and 64-page lazy-route export checks passed. After the retry guard was tightened, all 39 checks in the affected API/SQL files passed again, including stale/null-version rejection and committed handoff retries. The read-only preflight also exposed deliberately missing fixture history/baseline bucket while confirming the new catalog objects. The Vite production build passed with a 4 GB Node heap and the existing login probe exited successfully. Existing Browserslist and mixed-import/chunk warnings remain. These are the `check:app` component checks with a smaller build heap; the combined default 8 GB command was not rerun and is not claimed as a clean run. No dependency or build configuration was changed.

### Reviewed release scope

Release requires explicit approval under the repository's [AGENTS.md](../../AGENTS.md) and [database release runbook](../../docs/database-release-runbook.md). This task has not pushed migrations, deployed, sent email, or written hosted test records. A cached Supabase project reference is not proof of the intended environment. Target identity, recovery evidence and exact remote pending history must be checked after release is authorised.

The rental migration manifest is ordered below. Its dependencies include the existing application document/review/screening/decision/tenancy/approval schema, the private tenant Storage bucket and storage-policy hardening, current rental branch access, CRM leads, managed properties, mandates and private listings. Missing or partially applied baseline objects require reconciliation before release.

| Migration | SHA-256 |
| --- | --- |
| `20261003071610_rental_application_evidence_consistency.sql` | `3ab721e0c3b83f48c4d2181700c5d9491cd1106fc9948e3ab627e272b778acb6` |
| `20261003072828_rental_onboarding_requirement_foundation.sql` | `d0526fc2b5a2399e80f1a5f50798606d961c2adcc48495a0f483b31ddb118b07` |
| `20261003075136_rental_saved_checklist_workflow.sql` | `da5dc72d6666214e34bcf9c61085b7ce4dca6a255337101d27055a6c63f782e9` |
| `20261003080507_rental_landlord_onboarding_collection.sql` | `77e193305cd6a3eb4b00f777afb5e77ce212448cd112a1d3818f284f1a3eb9d5` |
| `20261003090506_rental_onboarding_handoff_continuity.sql` | `879d2ed03ebc5055096e48c8a8aa9f9edf2d9ebe5e623f0a782610e82d92c0b6` |

Prepare an isolated release checkout with only the reviewed primary app/API rental changes and the required migration history. Preserve the unrelated seller, listing, marketing and release work in this active tree. Review the diff before selecting its application commit; a broad deployment of the current working tree is not part of this scope.

For the authorised release:

1. Name and verify the target project/environment using the runbook; run `npm run supabase:guard` and `npm run supabase:push:lock-recovery`. Capture recovery evidence and the current definitions of replaced views/functions/triggers.
2. Run the read-only `scripts/rental-onboarding-release-preflight.sql` against that target. It reports missing migration history, RLS tables, server-only commands, invoker views, private buckets, required parent columns and enabled triggers. Before release missing new objects are expected; after release the reviewed dependencies must be present. The script calls no save, review, upload or transition command. Its syntax and new-object catalog expectations have been exercised in the isolated fixture; that reduced baseline intentionally lacks the existing hosted tenant Storage bucket.
3. Inspect the exact `supabase db push --linked --dry-run --skip-vault` scope from the isolated checkout. Stop on any migration outside the reviewed set; older-version handling must follow the runbook. Apply only approved pending rental migrations in timestamp order, then verify their history/catalog before deploying the compatible app/API commit. Do not activate unconfirmed landlord policies or seed data.
4. With authorised disposable records, verify real agent/landlord/applicant sessions, signed uploads and downloads, stale-version denial, revoked/expired tokens, a denied other-branch user, access after branch reassignment, two-property disclosure, landlord submitted handoff and tenant conversion. Record IDs and assignment/event counts before/after to prove no duplicate collection. Live sign-off requires this evidence and the available security advisor check.
5. If catalog or acceptance fails, stop the rollout. Keep committed documents, declarations, assignments and history. Restrict the affected onboarding/handoff entry points while preparing an append-only repair; do not drop evidence tables or delete bucket objects. Restore captured compatible definitions only through a separately reviewed recovery migration, and restore the matching application version only if it is compatible with the released schema. Partial release state must be reported explicitly.

Local continuity implementation and release preparation are complete; deployment and hosted acceptance remain pending approval. Policy sign-off and ongoing rental portals remain outside this release scope.

## Listing document matrix connection — 8 October 2026

Phase 1 of the listing matrix work connects the primary rental listing's Documents
tab to saved onboarding requirements. Landlord identity evidence is reusable;
property rows are selected by the portfolio property's listing link or a unique
unlisted portfolio entry's canonical property link. Explicit listing links take
precedence; ambiguous canonical property matches need a portfolio link. Requirements for another linked listing
and superseded requirements are excluded. Each linked tenant application has its
own section with named-person/entity requirements and the files in its current
pack. Missing files remain visible as saved requirements.

The application read uses the existing security-invoker review summary with explicit
organisation and listing filters and pagination. Landlord reads use the existing
authenticated, scoped onboarding snapshot endpoint. These are read-only operations;
opening the tab does not generate a checklist, assign evidence or activate policy.
Empty checklists explain the required discovery/link setup; failed reads report
unavailable requirements. Generic listing attachments remain in a separate Listing
files group and do not fulfil the saved matrix. Landlord preview rules are labelled
as pending policy confirmation, while tenant rows retain saved required/optional
status. Upload, download, review, replacement and collection-link controls in this
listing panel remain Phase 2 work.

Focused checks: 49 tests passed across six files, including the actual listing
Documents route, separate tenant packs, property scope, missing/superseded evidence,
partial read failures and a real isolated PostgreSQL view read with the existing
application RLS policy. Denied actors and other organisation/listing reads are
excluded, and reads preserve evidence assignment counts. The existing
`test:rental-listing-workspace-phase4` check passed. Focused lint has no errors;
the existing listing detail component retains six unused-variable warnings.
Two nearby checks outside this change fail in an overview fixture missing
`mediaProgress` and a landlord-lead action selector. No migration, hosted data write
or deployment is part of this implementation.

The new panel's browser bundle check passed. The normal full app build was stopped
while another app build was running; an isolated-output retry was also stopped
after prolonged concurrent build contention. Full production build verification
remains outstanding. No other build process was stopped or changed.

## Listing document matrix workflow — 8 October 2026

Phase 2 of the listing matrix work adds actions to the saved requirement rows in
the primary rental workspace. Agents can upload or replace landlord files and
tenant packs, open and download private evidence, record acceptance or rejection
with a note, and create, copy or revoke secure collection links. Tenant links can
target the primary applicant or a named additional person. Link creation does not
send email. Submitted landlord details have a versioned correction request that
reopens uploads after the refreshed snapshot confirms draft status.

The controls reuse existing authenticated APIs, signed storage uploads and saved
requirement commands. Files bind to the exact requirement, generation, person and
parent version. Multi-file packs upload sequentially using each acknowledged
version; a failed or uncertain save stops the sequence and requires a matrix
refresh before further changes. Partial success reports how many files were
acknowledged. Successful reads cannot clear this recovery lock. A committed save
with failed readback is reported as saved with completion counts unavailable,
rather than silently retried. Listing/workspace changes discard stale snapshots.

Each current file has its own review. Every file must be accepted before a tenant
pack is accepted, and replacing a pack preserves its earlier evidence as history.
Accepted submitted tenant evidence remains locked until rejection or expiry;
final applications retain private viewing and downloading but no intake, review
or collection-link controls. Landlord disclosure acceptance requires an explicit
confirmation that the prescribed disclosure is completed and signed. These
controls do not activate proposed landlord policy or change conditional rules.

Completion now counts accepted, active required rows, excludes optional rows and
landlord policy previews, and treats expired evidence as outstanding. The listing
overview uses the same saved matrix counts. Failed matrix reads make progress
unavailable; failed generic listing-file reads do not hide a working matrix.

Focused verification: 85 tests passed across 14 suites, including a real isolated
PostgreSQL workflow through signed upload preparation/completion, scoped review,
pack acceptance/replacement, stale-version rejection and denied actor access.
Component checks cover duplicate submission prevention, recovery after failed
readback, landlord corrections, signed disclosure confirmation, private previews,
downloads and collection-link creation/copy/revocation. The existing
`test:rental-listing-workspace-phase4` check passed. Focused lint has no errors and
only the six pre-existing unused-variable warnings in the listing detail page.

One existing upload-transport assertion still expects the old request shape and
fails on the already-present `appendToPack: false` field; that implementation and
test were not changed by the listing matrix work. The final listing-page browser
bundle and full app production build passed. The final build used an isolated
output directory in `/tmp` and completed in 1 minute 51 seconds; its listing chunk
was checked for the final private-preview changes. No migration, remote data
write, email delivery or deployment is part of this implementation.

## Listing document matrix conditional rules — 8 October 2026

Phase 3 of the listing matrix work adds explicit landlord discovery choices for
letting versus management, scheme membership and the rental proceeds beneficiary.
Agent portfolio capture and landlord onboarding preserve the same saved answers.
Management-only account and billing questions appear when management is selected;
switching branches keeps those answers without applying their document rows to a
letting-only arrangement. Unknown answers do not silently select management.

The additive saved preview matrix now includes:

- `payout_account` and `management_information` for managed rentals.
- `third_party_payee_authority` when managed-rental proceeds go to a third party.
- `existing_tenancy_pack` when management takes over a tenanted property.
- `scheme_rules` for sectional-title properties, body corporates and HOAs.

The prepared migration is
`supabase/migrations/20261008120849_rental_landlord_conditional_document_requirements.sql`.
It adds private rule helpers and records the conditional rule revision on the next
explicit discovery save. It performs no backfill, does not activate landlord
policy, and preserves the base rule fingerprints and current evidence. Account
changes supersede only account-related generations; a changed current tenancy
supersedes its takeover pack. Inapplicable branches become superseded rows with
their earlier evidence retained. Repeating a save does not duplicate rows or
revisions. Existing scoped parent commands, version guards and review authority
remain responsible for writes; private helpers have no anonymous/authenticated
execution access.

Tenant document previews now include the current version 4 address, entity-control,
trust-authority and named-signatory/trustee rules. The saved checklist remains
authoritative after saving, including older policy snapshots: a browser preview
cannot invent an active requirement or change required/optional status. The
existing optional address and ownership/control policy is retained. No new fixed
income period, age threshold, affordability multiple or RMCP approval is implied.

The listing matrix explains why each saved requirement applies. Exceptional
landlord types and non-residential properties carry a manual review notice rather
than appearing resolved through an Individual or residential fallback. All new
landlord policy rows stay labelled as preview and excluded from completion counts.
Property rows remain scoped to their own linked listing; general files still do
not satisfy requirements by filename.

Focused local verification: 128 checks passed across 18 Vitest suites, including
isolated PostgreSQL parity for landlord/legal-party and tenant version 4 scenarios,
generation changes, preserved accepted evidence, save/repeat-save revisions,
retired branches, denied helper access and listing scope. Component checks cover
conditional discovery visibility, public projection, agent/public answer parity,
tenant preview versus saved rows and manual review explanations. The existing
listing workspace and migration-reference checks passed. The additional landlord
workspace suite passed seven checks, bringing the total to 135 checks across 19
Vitest suites. A strengthened final SQL rerun also passed, including preservation
of accepted disclosure/identity evidence and retention of a superseded payout
file. Focused ESLint passed with no warnings or errors. Browser bundles for the
listing detail, landlord workspace and tenant wizard all passed. The full app
build was stopped after more than ten minutes in transformation while two other
builds were active; full production build verification remains outstanding. Only
this task’s verified isolated-output build process was stopped.

One nearby older wizard assertion still expects missing evidence to block details
submission. The current deferred-document submission helper intentionally checks
details and consent, allowing later evidence collection; neither that helper nor
the assertion was changed in this phase. Its one failure is not counted as a
passing check. No hosted migration, data write, email or deployment was performed.
The new saved landlord rows require the prepared migration and compatible app
release before hosted use; agency policy activation remains a separate decision.

## Listing document matrix acceptance and scoped release — 8 October 2026

Phase 4 verifies the primary transaction workspace's listing matrix. It updates
four stale regression fixtures to match the current upload-pack contract,
deferred details submission, media overview data and initial tenant-leads tab.
The person-assignment regression still proves that another person's evidence
does not fulfil a named person's checklist, even when details may be submitted.

The existing loopback onboarding fixture now serves the real listing document
panel at `/__fixture/agent/matrix`. It uses the real document APIs, isolated
PostgreSQL, the production application/access-link scope policies, and ephemeral
private bytes. Repository review and access-link calls use a restricted local
transport. The conditional migration runs in this fixture only. File watching
is disabled during acceptance so other work in this shared checkout cannot
restart or replace the fixture's loaded modules. Start it from the primary app
with `node scripts/rental-onboarding-browser-fixture.mjs`; the default origin is
`http://127.0.0.1:4186`. Save landlord discovery explicitly to add the conditional
preview rows, matching the migration's no-backfill behavior.

Fresh focused verification passed 101 tests across 19 Vitest suites, plus the
existing rental listing workspace and migration-reference checks. The fast app
baseline also passed all nine established service checks. Focused lint
passed without warnings or errors. A full Vite production build passed in 1m17s
with an isolated output directory; its listing-detail chunk includes the matrix
and action controls. The build login diagnostic remained off, as configured.
Earlier build attempts encountered an unrelated file mid-edit and severe memory
contention on the shared host; only this task's own builds were stopped.
The initial aggregate `check:app` stopped on a recruitment test mid-edit. That
file subsequently passed its own lint check, and the final global lint rerun
passed with zero errors and 563 existing warnings. The normal lint, fast-test
and production-build handoff stages therefore passed separately; the first
aggregate command itself is not recorded as a pass.

Browser acceptance exercised signed landlord disclosure upload and the explicit
completed/signed review guard; tenant two-file upload, per-file acceptance,
accepted-pack locking, rejection and replacement; and immediate matrix refresh.
The replacement shows only its new file while the earlier private files remain
in history. Downloaded bytes matched the uploaded file. A newly created tenant
collection link opened its application, was revoked through the panel and then
returned 401. Desktop (1440px) and mobile (390px) screenshots were inspected;
the mobile document width equals its viewport, with the table scrolling inside
its panel. These are local acceptance results, not hosted Storage acceptance.

Read-only production preparation confirmed the linked target is Arch9 SaaS
(`isdowlnollckzvltkasn`), the recovery gate is `RECOVERY_LOCKED`, prerequisite
cost/deferred-document/pack/readiness migrations are present, and the application
review view uses `security_invoker=true`. The existing private helpers deny
anonymous and authenticated execution. The new conditional migration remains
unapplied. Its SHA-256 is
`9aa24c749ca7e175a5bd83098865990e248445b6bbea4433cbdcc182376ef6c1`.

The linked dry run also listed three unrelated pending migrations: listing
channel statistics, recruitment joining records and agent-card rental enquiries.
This task's proposed database release includes only
`20261008120849_rental_landlord_conditional_document_requirements.sql`, followed
by the compatible primary app/API changes. Do not use the broad dry-run list as
approval to apply those other files. Capture the final app source from a clean
release checkout containing the matrix changes and required rental-pack code;
exclude unrelated shared-tree work and rerun checks if that source differs.

Pre-change production definitions and permissions were captured read-only. The
prepared scoped rollback restores the original private entry points by removing
only the new wrappers and renaming their preserved originals back. A local
PostgreSQL rehearsal restored both exact definitions and ACLs. It deletes no
saved requirement, assignment, file or review history. After an approved release,
verify the exact migration ledger entry, four private functions, denied helper
access, live matrix route and a permitted hosted upload/review/readback.

The local review packet is `/tmp/arch9-rental-matrix-phase4-release/manifest.json`.
It binds 25 matrix/runtime dependency snapshots and includes the dry run,
production pre-change definitions, prerequisites, scoped rollback and browser
evidence. The snapshots matched the working tree after verification. Recheck
target identity, recovery and source binding immediately before an approved
release; these captures are evidence from this acceptance run, not permanent
permission to release later changes.

No production SQL, backfill, policy activation, email or deployment occurred in
phase 4. Applying the migration and deploying the matching app require explicit
release approval under the repository's production rule. Landlord agency-policy
activation remains a separate decision; preview rows stay outside completion.

## Approved production release — 8 October 2026

The user approved the scoped production release in this task. Only migration
`20261008120849_rental_landlord_conditional_document_requirements.sql` was applied
to Arch9 SaaS (`isdowlnollckzvltkasn`), then recorded with its exact version and
name. The release-time dry run also contained two new recruitment migrations;
all five unrelated pending migrations were excluded from this release. No
backfill, policy activation, evidence writes or email send was performed.

The primary app was isolated on the then-current production commit
`95f0d6ca0dba6522faec6ce64accd225f842dcc3`, preserving its Property24 phone fix.
The seven rental dependency snapshots already matched that production base.
The approved runtime snapshots remained SHA-bound in release commit
`d7c59329d93696dbc598a93e7b30edbd596358fe`; 101 focused tests in 19 suites passed
on the isolated source. Focused lint passed with six inherited listing-page
warnings and no errors. The production build, bundle budget, operational-script
deployment audit and schema compatibility contract passed.

Deployment `dpl_CTf93nMtSdvLXh9hmwfJvFvXi5MT` was promoted to
<https://app.arch9.co.za>. Its temporary URL is
<https://bridge-jjf89ujus-alexs-projects-f5496a21.vercel.app>. The first staged
build lacked an explicit source marker and was left unpromoted; the rebuilt
HTML and release manifest match the approved commit and production Supabase
origin. All 828 critical live assets passed the established deployed-asset
check. Earlier concurrent fetch attempts timed out; the final run used four
connections, passed without retries, and found no missing assets. The live
rental route and matrix bundle returned 200; both document APIs correctly
returned 401 without application authentication.

Production database readback confirmed the five additive conditional purposes,
the exact preserved base function definitions, four private helpers with
postgres-only execution, and the security-invoker review view. The security
advisor ran successfully and reported no findings on the changed helpers;
unrelated existing findings remain outside this release. Target guard and
recovery lock passed immediately before applying the single SQL file; the
prepared rollback remains in the release packet.

A signed-in production readback under the available Home Seekers session
verified the matrix renders, landlord/tenant empty states explain missing saved
links, and Refresh matrix completes without an alert. No live evidence was
uploaded or reviewed. Hosted upload/review acceptance with permitted evidence
and the original Kingdom listing remain manual checks. Landlord policy stays
in preview, excluded from completion totals; existing discoveries receive the
conditional rows on their next explicit save.

The completed evidence packet is
`/tmp/arch9-rental-matrix-phase4-release/manifest.json`.
