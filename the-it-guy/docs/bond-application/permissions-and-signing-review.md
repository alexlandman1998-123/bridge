# Bond application permissions and signing approval pack

Prepared: 3 October 2026. Policy version: `bond-permissions-2026-10-03-draft-1`.

Status: **Draft for originator, legal and privacy review. Not approved for release.**

This is phase 1 of the buyer application signing and submission-pack work. It
defines the decisions needed before implementing the two new signing paths.
The proposed clauses live in `src/modules/bond/application/submission/bondApplicationPermissionPolicy.js`.
They are deliberately separate from the existing production declarations.

## Decisions and owners

| Decision | Owner | Current position |
| --- | --- | --- |
| Originator legal name, assigned consultant and privacy contact | Originator | Not supplied |
| Participating banks and each bank's forms | Originator / bank relationship manager | Not supplied |
| Acceptance of each signing method for each bank | Originator / participating bank | Pending written evidence |
| Permission wording and electronic-signature classification | Legal reviewer | Pending |
| Signing provider, identity checks and evidence | Product / originator / legal reviewer | Proposed; provider not chosen |
| Privacy notice, recipients, operator agreements and retention | Information Officer / privacy reviewer | Pending |
| Access rules and verification of actual server/storage permissions | Engineering / privacy reviewer | Proposed; not verified live |
| Direct bank-statement handoff provider and receipt confirmation | Originator / engineering | Not connected |

Approving implementation is not legal approval or confirmation of bank acceptance.
Record each approval's policy version, named reviewer, date and evidence reference.
Also record the exact canonical policy returned by `getBondPermissionReviewContent`
in each decision's `reviewedContent`. Changing wording, recipients or rules then
invalidates the old decision even if somebody forgets to change the version label.
Change the policy version and obtain fresh review if the wording or approved scope
changes. Store the eventual approved policy in trusted server configuration; never
trust an applicant-supplied approval flag. This phase adds an assessment contract,
not a database access rule or production signing gate.

## Proposed applicant permissions

These are draft statements for review. Display the actual originator's name,
selected bank names and linked privacy notice before collecting acceptance.
Do not show unresolved placeholders to applicants.

1. **Apply to my selected banks — required.** Authorise the named originator to
   submit the application to selected banks and communicate about it. Obtain
   further authorisation before adding a bank.
2. **Use and share information for this application — required.** Explain the
   application purpose and identify the banks and necessary service providers.
   Keep marketing outside this authority. The privacy reviewer must confirm the
   appropriate lawful basis for each processing activity; a checkbox does not
   replace that assessment.
3. **Credit and affordability checks — required.** Explain the credit bureau,
   affordability and fraud checks, including who performs them. This does not
   grant unrestricted access to bank accounts. Any separate bank-data retrieval
   service needs its own explained scope and approved process.
4. **Confirm my information — required.** Confirm accuracy and completeness and
   explain how to report changes while the application is being assessed.
5. **Marketing — optional.** A separate, initially unchecked choice naming the
   sender and contact channels, with a clear way to withdraw. Declining must not
   prevent a bond application.

First Home Finance, insurance referrals and additional financial services need
their own applicable wording and choices. Do not fold them into blanket required
third-party consent. Existing saved declarations remain historical evidence;
never relabel old acceptance as acceptance of these new clauses.

## Bank acceptance worksheet

Complete one row for every participating bank. A blank decision means pending,
not acceptance. Include requirements for single and joint applicants and the
actual application/declaration document, rather than general e-signature claims.

| Bank / evidence reference | Online method | Download, sign, upload | Additional forms | Reviewer / date |
| --- | --- | --- | --- | --- |
| To be confirmed by originator | Pending | Pending | Pending; explicitly record none if applicable | Pending |

For each method, record approved or rejected, policy version, reviewer, date and
written reference. A bank accepting uploaded wet-ink copies does not establish
acceptance of the online method. Restrict future availability to the confirmed
scope; never assume one bank's decision covers all banks.

## Proposed signing methods

**Online:** show the fixed application and permissions; verify each applicant
through the approved identity process; collect explicit intent to sign; retain
the document version, exact permission text and signing evidence. Choose the
provider and record the evidence specification before implementation. An OTP
and drawn image alone must not be described as an accredited advanced electronic
signature. Decide how joint applicants authenticate and sign separately.

**Download, sign and upload:** issue the same fixed application version with all
required signature spaces; accept the signed original directly in the application;
preserve it unchanged; require consultant review of the reference, completeness,
all signers and any alterations. An uploaded file is awaiting review, not accepted
merely because upload succeeded. Record whether a bank needs physical originals.

The immutable version, signing services, upload review and final pack are later
phases. This pack does not certify the existing drawn-signature flow as acceptable
to banks, nor enable a new signing service.

## Proposed access rules

All access must be scoped to the application and verified on the server and in
storage policies. Hiding a button is insufficient.

| Person | Proposed access | Limits |
| --- | --- | --- |
| Applicant | Own answers, own uploads, own consent and signing evidence | Joint financial details require an explicit sharing decision; decide joint signed-copy access before release |
| Assigned bond consultant | Application and approved supporting evidence needed to process it; review uploads and prepare authorised bank pack | No access to unrelated applications; consultant assignment and reassignment audited |
| Participating bank | Information in the pack explicitly authorised for that bank | No general Arch9 portal access or access to other banks' records |
| Estate agent / developer / other transaction partners | Progress and outstanding-item status | No financial documents, credit information or signatures by default |
| Support / administrator | Operational metadata | Exceptional access only through an approved, logged process; no blanket routine financial access |
| Signing / document service provider | Minimum information needed for its agreed service | Contracted scope, security, retention and any cross-border processing reviewed |

The applicant must understand when information is shared with another joint
applicant. Do not assume joint participation authorises all financial disclosure.
Prevent cross-application downloads, leaked storage links and stale access after
consultant reassignment. Log sensitive downloads, review decisions and sharing.

## Bank statements and accurate privacy wording

Agreed product direction: select/upload within **Supporting bank statements**,
but transfer file content directly to the consultant's secure system. Arch9 keeps
receipt status and minimal reference metadata only. No statement content in Arch9
storage, application snapshots, logs, analytics, support attachments or ZIP packs.
Show received only after an authenticated acknowledgement from the receiving
system. Handle failure and retry without falsely recording receipt.

Statements can subsequently be supplied by the consultant to the applicant's
authorised banks. Therefore, do not promise that statements are never shared
with anyone other than the consultant. Explain that onward sharing accurately.

Do not say Arch9 stores no sensitive information: answers, signatures and other
supporting documents are stored. Review any historically stored statements and
their lawful retention separately; the new handoff does not delete those records.
Sending remains unavailable until the receiving service is configured and checked.

## Retention and privacy notice worksheet

The privacy reviewer must specify a period or event-based rule, legal/business
basis, owner and deletion process for each category. No invented retention period
is adopted by this pack.

| Category | Retention rule / basis | Deletion and exception handling |
| --- | --- | --- |
| Application answers, signed versions and signing evidence | Pending | Pending |
| Stored supporting documents | Pending | Pending |
| Statement receipt status and references | Pending; content remains with consultant service | Pending |
| Marketing preferences and withdrawal evidence | Pending | Pending |

Cover backups, abandoned and declined applications, legal holds and the receiving
service's own retention. Publish the responsible party, contact, purposes,
recipients/operators, any international processing, access/correction requests,
withdrawal procedure and applicable retention information. Explain the effect of
withdrawing processing authority on an application already sent to a bank, without
promising immediate deletion where another lawful retention obligation applies.

## Release decision

Phase 1 is complete only once the named originator, legal and privacy reviewers
approve this exact policy and the bank worksheet is populated. The local
assessment helper rejects empty approvals, wrong versions, future-dated evidence,
unknown banks, missing retention decisions and unresolved method decisions.
It reports readiness for implementing each method; it never enables production
signing, proves the quality of a legal opinion or substitutes for access testing.

Before release, later phases must persist and audit these content-bound approvals,
enforce permissions in trusted server/storage layers, test access using real role
scopes and connect the consultant handoff. Server enforcement is not implemented
by this review-only module.

Focused checks from the primary package:

```sh
node --test src/modules/bond/application/__tests__/bondApplicationPermissionPolicy.test.js
node src/modules/bond/application/__tests__/phase5ReviewSignSubmission.test.js
```

## Fixed application versions (phase 2 implementation)

New submission snapshots now carry `reviewedVersion`: a numbered reference,
creation time, SHA-256 fingerprint of the reviewed application and a separate
fingerprint of the supporting-document baseline. Both primary-applicant and joint
preparation paths seal snapshots before calculating the existing whole-snapshot
hash and persisting them. The current permissions are frozen verbatim; phase 1's
draft clauses are not substituted for approved wording.

Changing answers in the guided editor clears the drawn signature and resets
permission acceptance. Document refreshes do not reset those choices. Version
comparison covers financial answers, all participants, bank selection and exact
permission wording. The revision builder advances the version, links its previous
reference and resets every signer and declaration. Existing authorised correction
and participant-review workflows continue to own reopening an application; this
does not introduce a buyer bypass for a locked submitted application.

The existing database submission trigger prevents changes to saved snapshots and
their hashes. No database schema change is needed for the added snapshot metadata.
The exporter checks the reviewed fingerprints as well as the complete snapshot
hash before downloading a final pack. Older records retain their existing full
snapshot validation and are not retroactively assigned a new fingerprint.

`document-changes.json` records the difference between the original document
baseline and the current checklist: later uploads, file changes, review-status
changes and items no longer present. It is a separate change register, not a
complete chronological audit of every intermediate reviewer action. No update
rewrites the signed snapshot. Document changes trigger document review; if they
reveal changed application answers or require changed declarations, update those
answers through the correction workflow and obtain fresh signatures.

Phase 1 approvals remain pending. The fixed-version fingerprint is an integrity
check, not a signing certificate or evidence of bank acceptance. Live persistence
and role access still need release verification; no remote records were changed.

Focused checks:

```sh
node --test src/modules/bond/application/__tests__/bondApplicationReviewedVersion.test.js
npx vitest run src/modules/bond/application/__tests__/bondReviewedVersionEditing.test.jsx src/modules/bond/application/__tests__/buyerBondApplicationRuntime.test.js
node src/modules/bond/application/__tests__/bondApplicationDownloadPack.test.js
```

## Application document design (phase 3 implementation)

The review screen and PDF now use `bondApplicationDocumentPresentation.js` for
their application sections, labels and formatted values. The guided review shows
expandable applicant details, financial records, exact permissions and document
requirements, with the existing edit navigation retained. Zeros and negative
answers remain visible; blank fields are not presented as completed answers.

The A4 exporter uses the originator branding, clear section hierarchy, financial
tables, page numbers, unsigned draft identification and a signature space for each
signer. It separates the document checklist from the attachment index. Long answers
continue across pages with a repeated field label. Short paragraphs and declaration
blocks stay together where possible. Captured-signature records and original signed
PDF evidence have distinct descriptions; originals are never redrawn or changed.

Three fictional samples are available in `output/pdf/bond-application/`: single
applicant, joint applicants and a self-employed applicant with a long business
description and multiple assets. They were rendered and visually inspected.
They are unsigned design examples; the originator still needs to approve the
layout, bank-specific forms and wording before release. This phase does not
implement the signed-copy upload process or a new online signing service.

Focused checks:

```sh
node --test src/modules/bond/application/__tests__/bondApplicationDocumentDesign.test.js
npx vitest run src/modules/bond/application/__tests__/bondApplicationDocumentPreview.test.jsx src/modules/bond/application/__tests__/guidedApplicationPresentation.test.jsx
node src/modules/bond/application/__tests__/bondApplicationDownloadPack.test.js
```

## Review sources

The legal reviewer should assess the applicable electronic-signature requirements
under [ECT Act section 13](https://www.saflii.org/za/legis/consol_act/ecata2002427/).
Bank acceptance must be established separately. Privacy responsibilities include
security measures and operator arrangements under
[POPIA security safeguards, sections 19–22](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/part-a-processing-of-personal-information-in-general/condition-7-security-safeguards/).

These sources guide review; this pack is an implementation proposal, not legal advice.

## Download, sign and upload (phase 4 implementation)

The connected buyer application now offers a paper signing route alongside the
existing drawn-signature route. A server-created version freezes saved answers,
permission wording, document baseline and all required applicant identities. It
locks editing until cancelled or reviewed. Cancelling requires a fresh version;
retrying cancellation of an older version cannot unlock a newer application.
Joint applicants must have completed their own participant review first. Surety
applications keep the existing approved-workflow blocker.

Applicants download the fixed PDF, mark optional permissions, sign and date each
applicant space, and upload every page as one PDF directly in the application.
The private `bond-signed-applications` bucket allows append-only uploads of up to
25 MB. The app records SHA-256, byte count and original object identity. Upload
registration retries reuse the same immutable object. A failed registration is
not reported as a successful upload.

The assigned consultant's Application action centre has a separate signed-copy
review queue. Acceptance requires an integrity-verified download, matching
reference/version, complete legible pages, unaltered answers and a checked,
dated signature for every applicant. This is a recorded human review, not
an automated handwriting or identity verification service. Rejection requires
feedback and preserves the original; a replacement creates a new file record.
Optional permissions default to no and are recorded separately per applicant.
Accepted permission evidence is separate from the unchanged unsigned snapshot.
Acceptance creates the existing immutable submission and links the original PDF
for the existing final-pack exporter. Supporting-document and bank readiness
gates remain applicable; acceptance does not send anything to a bank.

The new migration is `20261003202419_bond_wet_ink_application_signing.sql`.
It has not been applied remotely. Local tests execute the SQL against PGlite,
including role/storage policies and the existing document-audience boundary;
the fixture substitutes only the pgcrypto hash primitive. Actual PDF/file hashes
are tested with Web Crypto. Before enabling this on a live environment, apply
it through the database release runbook and verify access with real scoped buyer
links, assigned and unrelated consultant accounts, actual Supabase Storage,
and a full accepted original in the bank pack. Complete phase 1's bank, legal
and privacy approvals; no approval is inferred by this implementation.

A fictional joint signing PDF, `output/pdf/bond-application/sign-by-hand-joint.pdf`,
was rendered and visually inspected for optional choices and both signature spaces.

## Online signing (phase 5 gated implementation)

The server service now defines preparation of a fixed version, separate applicant
review and consent, provider-owned verification codes and signing, interrupted
session recovery, all-signer completion evidence, and unchanged signed-original
downloads. Each signer has an authorized participant scope; browser participant
identifiers and success redirects are not accepted as proof. Codes are never
persisted. Expired challenges, five failed attempts, cross-session challenges,
unsafe provider links, missing joint signers, altered versions/PDFs and revoked
links fail closed. New verification sessions require a repository-enforced rate
limit, so restarting a session cannot bypass limits.

The connected buyer screen now exposes the verified signing choice alongside
paper signing. Until enabled it explicitly explains that verified online signing
is unavailable. It does not present drawn-signature capture as the verified
provider method. Existing historic captured-signature submissions are preserved.

**Provider integration is not complete.** No provider has been selected or
connected, no real verification codes are sent, and no provider completion records
are saved to Supabase. The production API deliberately constructs an unavailable
service, even if the browser supplies an approval flag. The adapter and lifecycle
are exercised with fixture providers and repositories only. Those fixtures are
not production approvals or an actual signature service.

To enable: select the originator-approved provider and verification method;
complete phase 1's content-bound decisions; connect the server provider adapter;
implement the scoped durable repository; validate concurrency and revocation
against the real database; and complete the live single/joint pilot. The repository
must atomically freeze current answers, persist sessions and append-only evidence,
rate-limit code requests, preserve a verified original idempotently, and create
the canonical immutable submission only after all required signatures. It must
not store verification codes or ordinary application data in browser storage.
The new classification/inventory entry stays legal-review-required; there is no
permission to enable online signing or reuse the retired packet generator.

## Originator submission pack (phase 6)

The primary workspace's originator action centre now loads current signed
applications assigned to the consultant independently of older export packages.
Each application offers its accepted original PDF unchanged, an approved-files
supporting ZIP, and a readable A4 checklist. Incomplete archives carry an explicit
warning; downloading never submits to a bank or changes readiness.

The new read-only migration `20261004001000_bond_submission_pack_original.sql`
scopes accepted original evidence and the signed-application queue to the current
assigned consultant, excludes portal credentials, and leaves signed-upload tables
private. Wet-ink original bytes and SHA-256 are checked against accepted immutable
upload evidence. Every download verifies the signed snapshot hash and re-reads
current assignment, submission, file locations and approvals before saving.
Missing originals, altered evidence, revoked access and failed attachments stop
the download. Approved current files are selected from the shared requirements;
review-pending files, unrelated parties and superseded versions are excluded.
The ZIP index records file hashes and document changes against the signed baseline.

**Bank-statement handoff remains unconnected.** Statement bytes are excluded,
including a statement referenced under another requirement. The checklist shows
receipt as unverified; existing shared-storage statements are not accepted as proof
of external handoff. No receipt is fabricated, and no service was connected.
Selecting and integrating the approved consultant upload system, authenticated
receipt callbacks, consultant retrieval and live single/joint verification remain
necessary before that portion of phase 6 can be completed. This limitation also
prevents statement-dependent packs from displaying ready status.

No remote migration or deployment has been performed. Apply the phase 4 and
phase 6 migrations through the approved release process before live use. Phase 5
online signing remains gated pending its separately documented integration and
approvals. Bank acceptance and a live end-to-end pilot remain unverified.

## Readiness and pilot (phase 7 implementation)

The submission pack now separates applicant completeness, consultant review and
release approval. Its readiness assessment requires complete saved answers, current
approved required files, a complete applicant signer manifest, verified signatures,
an intact signed-original review and current consultant checks. Optional marketing
and optional documents never block an application. Pending external statements
remain blockers; an ordinary shared upload cannot satisfy them.

Consultants can record four explicit checks against the exact current application
and documents. The append-only review is scoped to the currently assigned
consultant. A changed application revision, sections, document status/location or
requirement invalidates it. The database rejects stale review requests and missing
checks; repeated requests for the same evidence are idempotent. Review does not
change application status or grant release approval.

The server-owned release endpoint reports missing bank/legal/privacy approvals,
statement integration and live single/joint pilot evidence. Neither a browser flag
nor consultant review can approve these. Missing/unavailable release assessment
fails closed. The database also prevents the older readiness/external-submission
paths from marking a new fixed-version application ready or recording its bank
handoff while this release is gated. Historic workflows without the new reviewed
version format retain their existing rules. Enabling the release requires a
reviewed server/database change after the real approvals and pilots, not a UI toggle.

### Live pilot acceptance record — not yet run

Run with authorized test applicants after migrations and providers are connected:

- Single employed applicant: three months of statements handed directly to the
  consultant system; approved documents; both online and paper signing paths;
  exact signed-original download and reviewed bank pack.
- Self-employed applicant: six months of statements, conditional income evidence
  and document-centre/bond-step status agreement.
- Joint applicants: separate identities and permissions, neither applicant seeing
  the other's private review, no completed envelope before both signatures.
- Interrupt/retry: verification timeout, failed code attempts, interrupted upload,
  upload metadata failure, refresh and resume without duplicate evidence.
- Changes: edit a signed answer, replace/reject a file, add a requirement or change
  the consultant; readiness and stale reviews must revoke immediately.
- Privacy: anonymous, buyer, other applicant, unrelated consultant and revoked
  credentials cannot retrieve a consultant pack or original beyond their scope.
- Bank acceptance: named originator checks readability, required bank forms,
  signature acceptance and consultant statement retrieval. Record bank, application
  version, date, reviewer and evidence reference. Fixture tests do not count.

No live pilot, bank acceptance, remote migration or release is claimed. The signing
provider, bank-statement provider and content-bound approvals are still outstanding.
