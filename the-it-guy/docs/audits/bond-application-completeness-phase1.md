# Bond application completeness — Phase 1

Date: 2026-09-13. Owner: primary transaction workspace (`the-it-guy/`).

## Outcome and scope

The capture, document and submission foundations exist, but application completeness is not yet established for every applicant type. This audit defines the implementation baseline and prioritises verified gaps. It changes documentation only; no deployment, database changes, email, or customer application access occurred.

The [field and document inventory](bond-application-completeness-inventory.md) maps all 63 questions, seven repeatable record groups and 53 document-rule templates in the guided contract. It preserves stored paths, required/visible conditions, validation, document timing and satisfaction rules. It is not an exhaustive inventory of every legacy portal field.

Status: engineering audit complete; originator acceptance pending. The checklist below is the proposed Arch9 product baseline derived from the repository, not a certified lender form or a claim about statutory requirements. An originator must confirm their required fields, document periods and declaration wording before originator-specific acceptance can be claimed. No external bank forms were supplied or certified in this task.

## Proposed completeness checklist

“Not applicable” must be an explicit answer where relevant, not indistinguishable from missing information. Draft saving must remain possible before completion.

| Area | Required outcome | Current capture / validation / export assessment |
|---|---|---|
| Application identity | Transaction/application reference, intent, purchaser type, participant structure, assigned originator; selected banks when submitting a purchase application | Stored model and bank-selection validation exist; final pack readiness is weaker than submission readiness. |
| Property and finance | Property identity, purchase price, deposit or explicit zero, requested loan and finance type; property/OTP requirements depend on pre-approval versus purchase | Guided finance fields and shared property data exist. Deposit is optional in the question contract; originator must confirm loan term, rate preferences and property detail requirements. PDF has a property/finance summary. |
| Each person's identity | Full names, identity/passport reference, email, phone, residential address and marital status; applicable marital regime and dependants | Guided identity, street, city, marital status and dependants are optional. Require appropriate completion at final submission; PDF shows selected identity/contact fields, not the full captured record. |
| Employment and income | Income category, employer/business/source, relevant dates, gross/net income as applicable, additional income or explicit none | Conditional salaried, contract, self-employed, commission, retired and other branches exist. Net income is optional; repeatable numeric validation needs hardening. PDF primarily shows totals. |
| Monthly commitments | Living expenses, maintenance, credit commitments and debt information; explicit none/zero where relevant | Repeatable capture exists. Required record fields are checked for presence, not their scalar formats/ranges. PDF summarises rather than enumerating every record. |
| Accounts, assets and properties | Account details, assets, liabilities and existing properties with related balances/repayments as applicable | Seven repeatable groups cover income, expenses, credit commitments, bank accounts, assets, liabilities and properties. Export needs full record-level coverage. |
| Credit disclosures | Debt review, judgments, arrears, insolvency and conditional explanations | Guided questions exist; selected-option validation and cross-field consistency need review. |
| Supporting evidence | Applicable documents for the correct participant, current version, readable/downloadable files; rejected evidence cannot satisfy a requirement | Dynamic matching and status machinery exist. A rejected document with an ID can currently be counted as uploaded. Evidence-period metadata is not proof of file contents. |
| Declarations and signatures | Approved declaration version, each required person's acceptance/signature, identity and timestamps tied to the reviewed answers | Submission snapshot and signer machinery exist. Surety wording approval is explicitly false. Company/trust authority must be linked to the actual authorised signer. |
| Final pack | All required answers, complete supporting files/index, declaration/signature evidence and the exact submitted version | Current Application download is a live workspace summary, not a complete immutable signed bundle. |

## Applicant-type acceptance matrix

All types inherit the common checklist and applicable document conditions; the document inventory is the authoritative description of current rule timing and applicability, not this abbreviated list.

| Scenario | Additional capture to confirm | Supporting evidence represented in current rules | Current verdict / acceptance example |
|---|---|---|---|
| Sole salaried | Employer, occupation, tenure, gross/net income, affordability and bank details | ID, address, salary evidence, three-month bank evidence; marital/deposit/OTP evidence when applicable | Foundation present. Empty identity/address must not become final-ready; test missing and rejected payslip. |
| Joint | Complete independent records for primary and co-applicant; both declarations/signatures | Participant-scoped identity, address and income/bank evidence | Participant model/tests exist. Prove separate save/resume, document ownership and both signatures; one applicant's file must not satisfy the other's requirement. |
| Surety | All sureties' identity, contact, income, financial details and authority/undertaking | Surety identity, financial and signed undertaking rules | Not complete: approved surety declaration wording unavailable. Signing must stay blocked until approved wording is configured. |
| Self-employed | Business identity, ownership, drawings/income, age of financial statements | Personal/business bank statements, registration, accountant evidence, annual financials, management accounts and tax evidence conditionally | Rules exist. Prove business and personal income are not double-counted and correct evidence is requested for each applicant. |
| Company purchaser | Entity name/registration, directors, ownership, authorised signatories and borrowing resolution | Company registration, director IDs, resolution, financials, tax and beneficial ownership | Domain/checks exist, but guided question contract only exposes entity type/name/registration. End-to-end editing of authority lists is not established; it must be demonstrated or added. |
| Trust purchaser | Trust name/number, trustees, authorised signatories, deed, letters of authority and resolution | Trust deed, letters, trustee IDs, resolution and beneficial ownership | Same capture gap as company. Boolean confirmation cannot substitute for accessible authority evidence at final submission. |
| Contract / commission / retired / other income | Contract dates, commission history or named recurring income records | Employment contract, commission, pension and additional-income evidence conditionally | Branches exist; test invalid dates/amounts, multiple income sources and branch changes. |
| Pre-approval | Intent explicitly identified; do not require purchase-only property/OTP evidence prematurely | Conditional pre-approval rules exist | Must test separately from purchase; conversion to purchase must recalculate requirements and invalidate stale final readiness. |

## Verified gaps and implementation order

| ID | Finding and source | Next phase / acceptance condition |
|---|---|---|
| BOND-01 | `documents/bondApplicationDocumentStatus.js`: `isDocumentUploaded` accepts any document with an ID/path even when rejected. Direct probe returns `satisfied` for a rejected file under uploaded-mode satisfaction. | Phase 2, first: rejected/superseded evidence must never satisfy an active requirement; replacement file restores readiness only under the applicable review policy. |
| BOND-02 | `exports/bondApplicationOriginatorPack.js` checks brand, transaction, participant array and entity issues, not full answers/documents/signatures. `pages/AttorneyTransactionDetail.jsx` supplies current view-model participants. Empty sole participant/entity completeness returns true because that helper does not validate primary applicants. This helper is not a full submission verdict. | Phase 2: one stage-aware assessment for portal, workspace and export. A draft may download, but must not be labelled submission-ready. |
| BOND-03 | `flow/bondApplicationFlowContract.js` makes primary identity, address and marital status optional. `flow/bondApplicationScreenValidation.js` checks repeatable required values for presence only; it does not apply scalar number/date rules to item fields or enforce select options. | Phase 2: agree final-required fields and validate each participant/record consistently, preserving draft saves. Test missing identity, malformed/negative amounts and unknown option values. |
| BOND-04 | `submission/bondApplicationDeclarations.js` sets `BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED = false`. | Human wording approval, then signing work: configure versioned approved text and prove all sureties sign the same revision. Do not remove the blocker merely to pass readiness. |
| BOND-05 | `originatorRequirements/bondOriginatorRequirementProfiles.js` has an empty default registry and falls back to the repository's SA baseline. Runtime-injected profiles are possible; none were verified here. | Confirm originator checklist/profile before claiming acceptance. Record originator, version and effective date; test overrides. |
| BOND-06 | `participants/bondApplicationParticipantEntityCompleteness.js` permits boolean/status confirmation of authority evidence; director/trustee string entries bypass identity checks applied to object entries. Guided question contract contains no director/trustee/authority editor fields. Other portal capture routes are not certified by this audit. | Phase 2/capture follow-up: demonstrate or add full entity editing and link actual documents/signatories. Test name-only authority entries and missing files. |
| BOND-07 | `documents/buildBondApplicationDocumentChecklist.js` marks missing pre-signature documents as blocking; pre-bank documents may be supplied later. | Phase 2: preserve this timing distinction. Ready-to-sign and ready-to-submit must be separate assessments, with pre-bank requirements enforced at submission. |
| BOND-08 | `utils/bondApplicationViewModel.js` renders selected applicant fields, totals, checklist and internal review information. `pages/AttorneyTransactionDetail.jsx` generates PDF from the current view model. | Phase 3: full answer-level PDF from signed snapshot plus supporting-file bundle/index. Verify all populated inventory fields are exported or intentionally excluded with a recorded reason. |

Source paths in this section are relative to `src/modules/bond/application/` unless prefixed with `pages/` (relative to `src/`) or `utils/` (relative to `src/modules/bond/`).

## Verification performed

Twelve existing focused test files passed on 2026-09-13: originator requirement profiles; conditional sole-applicant flow; dynamic documents; participant/entity completeness; downloadable pack; review/signing; co-applicants; sureties/revisions; portal editing; document continuity; submission readiness; external submission recording.

Reproduce from `the-it-guy/` with:

```sh
node --test src/modules/bond/application/__tests__/phase{2OriginatorRequirementProfiles,3ConditionalSoleApplicantFlow,4DynamicDocuments,4ParticipantEntityCompleteness,5DownloadableOriginatorPack,5ReviewSignSubmission,6ParticipantsCoApplicants,7SuretiesRevisionsChangeRequests}.test.js scripts/bond-application-portal-phase{3-editing,6-document-continuity,7-submission-readiness,8-external-submission}.test.mjs
```

Additional read-only local probes reproduced BOND-01 and the limited completeness scope in BOND-02. Existing passing tests do not cover away those findings. Portal script checks include source-contract assertions; they are not browser or database execution tests. No live signing, file retrieval, PDF rendering, migration state or bank acceptance was verified.

## Decisions still required

1. Originator confirms the proposed final-required fields, accepted document periods and any recipient-specific form requirements. This is the outstanding agreement needed to turn the engineering baseline into an accepted originator checklist.
2. Approved surety declaration wording and entity signing authority rules must be supplied/confirmed by the responsible business owner.
3. Confirm whether every supporting document requires originator acceptance before external submission or whether selected uploaded evidence may proceed pending review. Current rules distinguish uploaded and accepted; Phase 2 must not silently change that policy.

Phase 2 can start with rejected-document handling and common readiness assessment while these business decisions remain explicit. This audit does not authorise deployment or automatic bank integration.

## Phase 2 implementation — 2026-09-13

Implemented in the primary transaction workspace, with an accompanying unapplied database migration:

- Shared stage-aware assessment: `signature` allows documents expressly due later; `bank_submission` requires current answers, applicable pre-bank documents, declaration evidence and a signed version matching current application data. Status labels are Draft, Awaiting documents / signatures, Ready to sign, and Ready for submission.
- Originator Application view and PDF manifest use the shared assessment, not the old 85% completion threshold. Draft downloads remain available. The action centre combines the same assessment with server-side originator review requirements and lists individual blockers.
- Rejected, superseded, cancelled and archived evidence cannot count as supplied. Review rejection takes precedence over an uploaded status. A valid replacement no longer becomes ambiguous solely because the rejected version remains in history.
- Final readiness resolves requirements for all applicants and sureties. Unassigned primary-applicant evidence cannot satisfy another participant's requirement; linked requirement records and participant metadata identify applicable evidence.
- Repeatable records now receive scalar format/range checks, including invalid options, malformed amounts, negative monetary values and fractional integers. Existing optional field policies and draft-save paths remain unchanged pending the Phase 1 business decisions.
- The originator loads the active signed submission through existing access controls. Missing/inaccessible signing evidence blocks final readiness. Snapshot comparison covers transaction, intent, property, entity, finance, banks and participant answers. This does not create the complete signed download bundle scheduled for Phase 3.
- `20260913122717_bond_application_submission_readiness_hardening.sql` requires signed/completed participants and a signed submission on the current application revision, marks revision-stale assessments blocked, and reassesses within the external-recording transaction. It preserves assignment-based authorization and does not submit to banks.

Verification: `npm run check:app` passed (lint with existing warnings, baseline tests, build). All 28 application-domain/portal test files passed. `npm --prefix the-it-guy run test:bond-submission-readiness` passed, including in-memory PostgreSQL execution of the migration and signature, revision, document timing, successful recording and unauthorized-assignment cases. Targeted lint passed with one existing unused-variable warning; the final build passed. No live browser/signature service or bank delivery was exercised.

Additional legacy finance/workspace checks exposed four unrelated baseline failures: finance phase 4 expects the older `handleFocus` implementation; finance phase 5/6 reference missing `202608280001_agent_bond_application_identity.sql`; workspace phase 2 references missing `20260828195452_agent_bond_application_workspace_view.sql`. Their inputs were not changed by Phase 2.

Rollout: the migration has been created and tested locally, not applied remotely. Explicit environment approval, the repository's database guard and deployment are still required. Originator-specific requirement profiles, approved surety wording, additional final-required fields and entity-authority capture remain the decisions/work identified in Phase 1; they are not silently bypassed by readiness. Final signed PDF/supporting-file bundling remains Phase 3.

## Phase 3 implementation — 2026-09-13

The Application actions now offer **Download draft PDF** and **Download final pack (.zip)**. Final download is gated by the Phase 2 assessment and rechecked against freshly read application/document records before the browser saves the pack.

The final ZIP contains:

- `application.pdf`: a paginated, branded rendering of the immutable signing snapshot, including every participant answer group, financial records, entity information, declaration wording/acceptance and a supporting-file index.
- `signed-evidence/original-signed-application.pdf`: the original linked signed PDF, included without modification. The readable PDF clearly distinguishes itself from this signed instrument.
- `supporting-documents/`: the referenced files with unique, safe names and usable extensions. Documents collected after signing are labelled separately rather than being presented as part of the original signing snapshot.
- `application-data.json`, `document-index.json` and `READ-ME.txt`: the saved answers, document references, source/version information and SHA-256 checksums. Temporary signed URLs are not included.

New sole/joint snapshots preserve all attachments for a requirement, not just the first file. Joint snapshots also preserve purchaser-entity information and intent. Existing snapshots remain unchanged. When older submissions link evidence through a signing packet, download resolves only the exact recorded packet/version and its final document ID; it never selects a newer packet revision as a substitute.

Downloads use the existing authenticated transaction, document and storage permissions. Missing/rejected evidence, empty files, changed document versions, unavailable original signed PDFs, failed downloads or an unverifiable snapshot stop final export. Limits are 100 files, 25 MB per file and 100 MB per pack. Draft PDF capture remains available without signed evidence. A bundled licensed DejaVu font preserves supported accented characters; unsupported glyphs produce an explicit error instead of silently omitting text.

Validation: `npm run test:bond-application-download` passes; all 29 application/portal test files pass, including the new archive/content/failure tests and joint-snapshot readiness regression. The app lint/baseline/build suite passed with existing warnings, followed by targeted lint and a final build. A synthetic seven-page PDF was rendered and visually inspected; extraction confirmed accented names, account data, declarations and amounts. Tests verify original signed bytes are unchanged, every attachment is indexed, duplicates receive unique names, path traversal is prevented, failed downloads produce no partial pack, and older evidence resolution cannot cross packet/version boundaries.

No customer records were changed, no real application was downloaded, and nothing was deployed. Existing applications with no accessible linked original signed PDF still need that evidence resolved through the signing workflow before final download is possible. The Phase 2 database migration remains subject to its existing rollout approval. Phase 4 originator handoff work and recipient acceptance remain separate.


## Phase 4 implementation — originator handoff

Implemented locally on 13 September 2026 in the primary transaction workspace.

- The application action centre shows individual document requests, instructions, feedback, due dates and review history. Originators can open the uploaded file, accept it, request a replacement or more information, or withdraw a request. Feedback is required for rejection, more information and withdrawal.
- Review commands check assignment, current request state, linked file and transaction. A changed linked document aborts the review. Replacements reopen accepted requests; withdrawals no longer block readiness. Canonical-type fallback does not link another participant's request.
- Formal corrections reopen a signed application without editing its snapshot. Buyers see the instruction. Primary-buyer correction saves synchronize shared and primary-applicant answers, preserving other applicants' private answers. Re-signing is restricted to the recorded base submission. Originators can close a correction only after a different, current, signed version exists. Open corrections block bank-submission readiness.
- External submission recording confirms the signed version and captures actual submission time, lenders, reference and notes. The server compares the version again under application/package locks and rejects a changed version or invalid time. It copies the version number, application revision, snapshot fingerprint and signing references into the record. Later revisions preserve earlier records. The complete history is displayed; legacy records without version evidence are explicitly labelled.
- Buyer projections exclude internal notes, reviewer identities, file paths and other participants' private document requests. The standalone portal's missing await was fixed so application loading finishes before rendering.

Validation:

- `npm run test:bond-handoff-workflow`: PGlite executes the migration and checks transitions, stale-file rollback, replacement continuity, participant isolation, withdrawals, correction re-signing, version preservation, timestamps, buyer privacy, assignment authorization and function privileges.
- All 30 application/portal test files pass, including correction-base/revision checks and preservation of other participants' answers.
- `npm run check:app` passes with existing lint warnings. Focused lint and the production build were also checked after integration changes.

Rollout remains separate: apply the Phase 2 readiness migration and `20260913124839_bond_originator_handoff_workflow.sql` before deploying this UI. No remote migration, customer write, email or deployment was performed. Phase 5 still needs an authenticated end-to-end run through buyer editing, the signing provider, storage and originator review. The standalone application-token page retains its existing draft-only editing capability; uploading and signing use the established buyer transaction portal. Phase 1 surety wording/profile decisions remain outstanding. This phase records external submissions; it does not send applications to banks.

## Phase 5 verification — 13 September 2026

**Release decision: NOT READY FOR LIVE RELEASE.** Local verification is implemented and passing. This is not live signing, Supabase authentication or originator acceptance certification.

### Defects found and fixed

1. **Retired signing dependency.** The bond submission service directly created packet, version and signer rows and returned `/sign/...` links. `src/App.jsx` routes those links to the retirement page, and the README explicitly retires this system. New sole/joint signing preparations now fail before client access or any write. Both signing controls explain the unavailable service and remain disabled; saving and existing evidence downloads remain available. Regression tests execute the actual three API functions with no database client in scope, proving they reject before side effects. Re-enabling the retired generator is not part of this change.
2. **Lost resume/correction metadata.** `buildLegacyBondApplicationDraft` reconstructed saved answers but discarded `_meta`, including the last screen, completed steps and originator correction ID. It now preserves a deep copy. Domain and browser tests prove edited answers and the saved screen survive reload, without mutating the original source object.

### Evidence

| Coverage | Result | Limit |
| --- | --- | --- |
| Application/portal domain checks, database workflow execution and retirement regressions | 40 checks passed | Local fixtures; historical test names containing “live” are not proof of live access |
| Real React screens in Chrome | Eight checks passed; no page errors or external network requests | Offline API fixtures, not real authentication |
| Capture and resume | Edited name and current screen survive save/reload | Representative capture screen, not every question in a live session |
| Originator handoff | Accept, new request visibility, withdrawal/history, submission reference/version and correction rejection checked | API responses simulated; SQL transitions separately executed with PGlite |
| Mobile | 390px handoff layout inspected; no horizontal overflow | Chrome viewport emulation |
| Downloads | Browser saved draft PDF and final ZIP; signed-evidence file, snapshot and index present | Synthetic PDF explicitly labelled as verification evidence, not a real signature |
| Denied storage response | Error displayed; no partial browser download | Simulated HTTP 403 |
| PDF | Three-page browser export rendered and visually inspected; accented-name extraction passed | Engineering layout sample, not originator acceptance |
| App suite | `npm run check:app` passed with existing lint warnings | Local lint, baseline and production build |

Representative sole, joint, self-employed, participant/entity and surety-blocker scenarios remain covered by the application-domain tests (`phase3ConditionalSoleApplicantFlow`, `phase4ParticipantEntityCompleteness`, `phase6ParticipantsCoApplicants`, `phase7SuretiesRevisionsChangeRequests` and document/download tests). Surety scenarios are expected to remain blocked without approved wording.

Repeatable commands from the primary app package:

```sh
node --test src/modules/bond/application/__tests__/*.test.js scripts/bond-handoff-workflow.test.mjs scripts/bond-submission-readiness-sql.test.mjs scripts/bond-application-portal-phase*.test.mjs scripts/document-generator-retirement.test.mjs
npm run test:bond-application-browser
npm run report:bond-application-release-readiness
```

The browser test starts a loopback-only Vite fixture server, uses installed Chrome with a fresh temporary browser context, replaces the API module with explicit offline fixtures, and blocks non-loopback requests. It does not load environment files or the production Vite server/API configuration. Outputs default to `/tmp/bond-application-verification/`. The fixture is not an application route and is not included in the production bundle.

### Remaining release requirements

- Choose the replacement bond signing approach: externally signed application upload, or a supported e-signing provider. The previous packet-signing integration is retired. An externally signed PDF must be explicitly linked to the reviewed application version; an ordinary upload alone must not mark the application signed.
- Apply the reviewed Phase 2/4 migrations only to an explicitly approved test environment after the repository database guard. No remote migration, customer write, email or deployment was performed during this work.
- Run an authenticated buyer/originator test in that environment, including a different user's denied access, upload/replacement, current signing evidence, final archive, correction/re-signing and external submission history. Verify the complete workflow with the selected signing approach.
- Obtain originator acceptance of representative sole/joint/self-employed/entity packs, required-field policy, document periods and the recipient-specific profile. The default originator profile registry remains empty.
- Obtain approved surety wording and entity signing authority rules before enabling those cases.

The release-readiness report intentionally returns `NOT_READY_FOR_RELEASE` and lists these outstanding conditions. `--require-ready` exits unsuccessfully so a passing local test suite cannot be mistaken for release approval.
