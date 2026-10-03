# bridge.

High-end React + Vite + Supabase transaction workspace for Samlin Construction.

## Retired document generator

The legacy mandate/OTP generator, template workspace, packet signing endpoints,
and background generation jobs are permanently retired. Seller onboarding must
not create a mandate packet. Signed mandates and OTPs use the normal listing or
transaction document upload paths; the onboarding defects/compliance form remains
independent. Existing document records and final-file access are preserved.

Run `node --test scripts/document-generator-retirement.test.mjs` from this package
to check the retirement boundary and independent upload behavior. Server handler
changes require an explicit deployment before they affect an existing environment.

## Dashboard transaction counts

The residential header, transaction health total and transaction-flow summary use
one authoritative scoped active count, including zero. Agent cards and their count
come from the same deduplicated active transaction rows; inactive, terminal and
out-of-workspace records are excluded. Active card lists are not truncated to six
or sixty records. Available/imported drafts stay in awaiting review until they
move into an active deal stage. An explicit zero suppresses stale card/flow previews.

Focused checks: `node src/services/__tests__/residentialDashboardService.test.js`
and `node src/services/__tests__/principalDashboardService.test.js` from this package.

## Imported deal audit

Deal Setup counts a primary buyer only when there is one active primary buyer
participant. A legacy `transactions.buyer_id` alone does not complete the Buyers
step. Missing or conflicting links appear as a warning; use the existing buyer
assignment controls after checking the details. Opening Deal Setup does not
create, merge or relink buyers.

For a read-only inventory, run `scripts/sql/imported-deal-audit.sql` against the
intended database after checking its organisation scope. Save the `audit_input`
JSON outside source control, then run from this package:

```bash
node scripts/audit-imported-deals.mjs --input=/path/to/audit-input.json
```

The audit identifies imports from an explicit origin source or a workbook import
note corroborated by its row reference. A matching reference alone is a candidate
requiring scope confirmation; a historical sale date alone is not import evidence.
It reports buyer-link gaps, differing captured/profile names, missing linked source
PDFs and missing sale dates. It never infers dates, changes stages or writes data.
The identified records still need human verification against their source PDFs.
Production reports belong under the ignored `output/audits/` report paths.

Focused checks: the four `src/core/transactions/__tests__/dealSetup*.test.js`
tests and the Deal Setup/Buyer Parties component tests cover link consistency,
manual buyer capture, ambiguous primaries, read-only audit scope and historical
date/stage preservation.

## Imported transaction detail review

Authorised editors can open **Deal Setup → Review details** on identified imports
and import candidates. Buyer, Seller, Property, Attorney and Commercial terms & Funding sections keep drafts
when switching tabs. Each section can be saved as a draft or confirmed after
checking a linked PDF. Missing source files prevent confirmation; recover/upload
the signed OTP in Documents and reload the review. Buyer confirmation also
requires consistent primary-buyer links in the existing assignment controls.

Corrections update this transaction and its primary participant, with before/after
history and the signed-in reviewer. Shared buyer profiles, linked property records,
attorney appointments, sale dates and stages remain unchanged. Identity numbers
and extra contact details are stored privately behind authorised RPCs. A source
replacement or a change to confirmed details requires review again. Concurrent
changes are rejected; reload compares current values with retained unsaved edits.

The UI requires the unapplied migration
`supabase/migrations/20261001185738_imported_transaction_detail_review.sql`.
Use the database release runbook with explicit target approval before applying it.
This change does not mark existing imports as reviewed or repair their links/files.
The additional migration
`supabase/migrations/20261001191425_imported_transaction_review_status.sql`
provides the read-only list status. Existing imports are recognised from their
corroborated workbook notes; future imports must retain a supported origin source
(`bulk_upload`, `bulk_import`, `spreadsheet_import`, `otp_import`, or `import`).
No bulk data update is required to show identified imports as **Needs review**.
A reference or import note alone stays **Import source unverified**; ordinary
backdated transactions are not flagged solely because of their age.

The transaction list and Deal Setup show **Needs review**, **Review in progress**
or **Reviewed**. Reviewed requires all five current snapshots to match their saved
confirmations and available source files. Changes to details, buyer links or source
files invalidate the matching confirmation. The list has **Imported deals** and
**Reviewed imports** filters; **Needs Review** includes pending imports alongside
existing bond-originator review requests. A failed status lookup shows an explicit
warning and never retains a previous green review badge. Status reads expose only
counts and source availability, with transaction access checked for each ID.
They never return identity fields or correction history.

Funding review covers purchase price, deposit, finance type, cash/bond amounts,
finance manager and bank. The additional append-only migration
`supabase/migrations/20261001195834_imported_transaction_funding_review.sql`
extends confirmation to five sections. Existing four-section confirmations and
history are preserved; funding starts unconfirmed. Funding changes in either
review or the existing Deal Setup form invalidate its confirmation. Review saves
refresh downstream document requirements, with an explicit warning if refresh
fails. Historical dates, stages, shared profiles and attorney assignments stay
outside the funding correction boundary. Source PDF and attestation are required
for confirmation. Drafts allow missing values; supplied amounts must be non-negative
with at most two decimal places. Confirmation requires a positive purchase price,
a supported finance type and the applicable amounts/finance manager. Funding completion now requires a positive price, an explicit deposit (0 is valid),
positive applicable amounts and a supported bond manager. Compare amounts in cents:
cash includes the deposit for cash and mixed finance; for bond-only deals, deposit
plus bond equals the price. Deposits cannot exceed price or the mixed/cash cash amount.
Bank selection can follow later. Missing or inconsistent figures remain drafts and
cannot complete commercial/funding steps or receive funding confirmation. Unsaved
changes do not count as complete. The append-only migration
`supabase/migrations/20261001201355_imported_transaction_funding_validation.sql`
enforces confirmation on the server and invalidates earlier unreconciled funding
confirmations while preserving their history.

Imported finance compatibility uses explicit known values. `combination` and
known mixed-finance aliases display as **Cash and bond** in Deal Setup and review.
Opening a deal does not rewrite its imported value; an explicit save uses `hybrid`.
Unknown values remain visible as **Unresolved**, do not complete the funding step
and never imply cash/bond document requirements from scanned prose. Select a
supported route before saving an unresolved type. Missing finance type does not
silently clear already-captured amounts when saving other terms. No bulk update
or migration is required for this compatibility change.

Deal Setup progress counts three saved setup steps: commercial terms, buyer
assignments and funding. Imported-detail verification remains the separate five-
section review status; received/approved documents remain in the Documents tab.
Missing documents do not block valid setup, and reusable profile coverage never
claims that all transaction documents are complete. The readiness contract returns
setup blockers separately from advisory document requirement issues. No migration
or bulk data update is required for this separation.

To prepare recovery of existing imports without remote writes, run the read-only
`scripts/sql/imported-deal-audit.sql` against the explicitly selected organisation,
then save its `audit_input` result locally. Run:

```bash
node scripts/audit-imported-deals.mjs --input=/path/to/audit-input.json --source-dir=/path/to/original-pdfs
node --test src/core/transactions/__tests__/importedDealRecoveryPlan.test.js src/core/transactions/__tests__/dealSetupCompatibilityAudit.test.js
```

The optional source directory adds recursive PDF inventory and SHA-256 candidates.
Exact filenames and download-copy suffixes are candidates only; duplicate or shared
generic filenames remain ambiguous. Stored document availability is checked separately
from linked metadata. Buyer links require source identity review; no automatic matching,
attachment, confirmation or date/stage repair is performed. Keep raw audit inputs local
because they can contain personal information. Live recovery needs explicit approval.

Focused local verification from this package:

```bash
node scripts/transaction-detail-review.test.mjs
npx vitest run src/components/__tests__/AgentTransactionsTable.importReview.test.jsx src/services/__tests__/importedDealReviewStatusService.test.js
npx vitest run src/components/transaction/__tests__/TransactionDetailReviewPanel.test.jsx src/services/__tests__/transactionDetailReviewService.test.js src/components/transaction/__tests__/DealSetupPanel.test.jsx
```

For the synthetic browser story, run `node scripts/transaction-detail-review-browser.mjs`
and open `http://127.0.0.1:4189`. This uses the real review components and migration
SQL with an in-memory database; it does not connect to or change production.
See `../docs/imported-transaction-review-release.md` for verification evidence,
exact migration scope, recovery and the pending production release.

## Current Workflow Layer

- Multi-development SaaS layout
- `Dashboard -> Developments -> Development Detail (Cards/Pipeline) -> Unit Detail`
- Global `+ New Transaction` 3-step wizard (Deal Setup -> Finance Details -> Transaction Status)
- Dynamic finance capture for `cash`, `bond`, and `hybrid`
- Auto buyer link/create + transaction save + unit status update
- External transaction portal links for:
  - client / buyer
  - tuckers
  - bond originator
  With token-based upload access at `/external/:accessToken`
- Progress timeline (full + compact)
- Notes/activity feed
- Right sidebar document checklist + uploaded files
- Lightweight admin create flows:
  - Add Development
  - Add Unit
- Development-level supporting document setup (requirements drive checklist + 3/4 style progress)
- Reports page with print styling
  - report type selector: `Overview Report` and `Unit View Report`
  - live filters for development/scope/finance/stage/risk
  - preview and export current selected report mode to PDF
- Executive Mobile Snapshot module:
  - dashboard link generation per user/token
  - shareable mobile route at `/snapshot/:token`
  - read-only portfolio metrics, development cards, alerts, recent movement
- Controlled Client Portal module:
  - token route at `/client/:token` with dedicated mobile-friendly experience
  - client-safe progress + documents view
  - client issue/snag submissions
  - optional alteration requests (feature toggle)
  - optional service reviews gated by stage + feature toggle
  - internal unit detail integration for issues/alterations/reviews + status updates

## Routes

- `/dashboard`
- `/developments`
- `/developments/:developmentId`
- `/units`
- `/units/:unitId`
- `/transactions`
- `/documents`
- `/reports`
- `/external/:accessToken`
- `/snapshot/:token`
- `/client/:token`
- `/client/:token/issues`
- `/client/:token/alterations`
- `/client/:token/review`

## Setup

1. Install dependencies:

```bash
npm i
```

2. Configure environment variables:

```bash
cp .env.example .env
```

`.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

3. Run schema:

- `sql/schema.sql`

4. Run seed:

- `sql/seed.sql`

5. Configure Supabase Storage bucket:

- bucket: `documents`
- storage policies on `storage.objects` for `documents` bucket:
  - `SELECT` for `anon, authenticated`
  - `INSERT` for `anon, authenticated`

6. Start app:

```bash
npm run dev
```

## Lead intake

Property24 enquiries enter through the Property24 API. Website and Meta leads use their direct integrations. Inbound email aliases and the old email-forwarding pilot have been retired; historical messages remain available under **Settings → Integrations → Archived Lead Emails**.

## Demo Flow

1. Click `+ New Transaction` in the top header.
2. Complete:
   - Step 1: Deal Setup
   - Step 2: Finance Details (dynamic by finance type)
   - Step 3: Transaction Status
3. Save using:
   - `Save Transaction`
   - `Save & Open Unit`

## Schema Notes

The schema includes:

- `developments`
  - includes `planned_units` for early setup capacity
- `units`
- `buyers`
- `transactions`
- `transaction_finance_details`
- `transaction_external_access` (tokenized external upload links by role/email, linked to buyers)
- `snapshot_links` (one active mobile snapshot token per user/owner key)
- `development_settings` (client module feature toggles per development)
- `client_portal_links` (tokenized client portal access)
- `client_issues` (structured snag/unit issue tracking)
- `alteration_requests` (controlled variation request workflow)
- `service_reviews` (post-completion client feedback)
- `notes`
- `transaction_notes` view
- `documents`
  - includes `is_client_visible` flag for client-safe document exposure
  - includes external upload metadata (`uploaded_by_role`, `uploaded_by_email`, `external_access_id`)
- `document_requirements` (required checklist by development/global)

## Legacy DB Upgrade

`sql/schema.sql` is idempotent. For older projects, rerun:

1. `sql/schema.sql`
2. `sql/seed.sql`

## WhatsApp campaigns

The primary app's Marketing → WhatsApp page uses persisted campaign and consent
records, with template definitions fetched from the selected sender's Meta WABA.
It supports saved drafts, explicit recipient selection (up to 500), search and
status/date filters, personalisation, review, sending and per-recipient results.
CRM names and phone numbers can be copied into WhatsApp contacts; CRM/email
subscription status never supplies WhatsApp consent.

Meta fields come from the connected account: Phone Number ID for the sending
endpoint, template name, exact language code, approval status, category and
components. This version supports marketing/utility templates with positional or
named text values, text/image/video/document headers, static phone/quick-reply
buttons and dynamic URL suffixes. Create/submit templates in WhatsApp Manager;
unsupported formats (including authentication, carousel, location and Flow
buttons) are visibly unavailable. Media uses public HTTPS links; Meta validates
media format, availability and size. Campaign name and consent evidence are
Arch9 fields, not Meta template fields. Tokens remain server-side.

Before enabling this in an environment, apply the new `whatsapp_campaigns`
migration and deploy `whatsapp-campaigns` and the updated `whatsapp-webhook`
function, then deploy the app. Use the repository's Supabase guard first and
obtain explicit approval for that environment. No migration or deployment is
performed by the checks below. Existing sender connections need a valid WABA ID,
Phone Number ID and token with `whatsapp_business_management` (template reads)
and `whatsapp_business_messaging` (sending) access. Configure the existing
`WHATSAPP_WEBHOOK_APP_SECRET` and verification token, subscribe the app to WABA
message webhooks, and set `WHATSAPP_GRAPH_VERSION` if overriding the existing
integration's v23.0 default. Production sender configuration remains in the
existing administrative integration; the campaign UI never collects tokens.

Sending runs in resumable batches of five while the campaign page remains open.
Closing it leaves unclaimed recipients queued; use **Send remaining** in results.
Each recipient is atomically claimed before the Meta request. An interrupted or
ambiguous attempt is marked unconfirmed and is never automatically resent.
Approval is rechecked before each batch and consent before each individual claim.
Delivery/read callbacks are monotonic and correlated using message IDs or
`biz_opaque_callback_data`; read counts include only actual read callbacks.
Signed STOP, unsubscribe and opt-out replies revoke permission. Other replies
are not presented as a shared inbox. Scheduling and shared reply handling are
outside this version. Read receipts can be unavailable, and acceptance by Meta
is not delivery. A real sender/template/recipient smoke test is still required
after an explicitly approved deployment.

Focused local verification:

```bash
node --test scripts/whatsapp-campaigns.test.mjs
./node_modules/.bin/vitest run src/components/marketing/__tests__/WhatsAppCampaigns.test.jsx
```

The Node tests use isolated PostgreSQL (PGlite), not a connected database. The
component tests mock network operations; they never send WhatsApp messages.

References checked during implementation:
[Meta's template-message API example](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text),
[Meta's template components example](https://www.postman.com/meta/whatsapp-business-platform/request/ep5w4rc/create-template-w-document-header-text-body-a-phone-number-button-and-a-url-button),
and [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).

## Seller onboarding access

Seller onboarding table access follows `bridge_can_access_private_listing` for
signed-in staff. Public onboarding reads and writes use an exact, unexpired
onboarding token through the server/RPC boundary. Stable seller workspace links
retain their separate expiry and password/session lifecycle. Browser saves fail
closed when an RPC is unavailable; they do not retry as direct table writes.

Focused verification (no remote writes or client messages):

```bash
node --test scripts/seller-onboarding-access.test.mjs scripts/seller-onboarding-submit-fast-return.test.mjs scripts/listing-seller-canonical-update.test.mjs
./node_modules/.bin/vitest run src/services/__tests__/privateListingService.sellerAccess.test.js server/services/sellerOnboardingCoreApi.test.js
```

The database tests execute the access migration and existing completion RPC in
isolated PostgreSQL/PGlite with synthetic listings and identities. They verify
allow/deny policies, token expiry, draft rollback, and submission/readback. The
existing listing-permission helper is supplied as a fixture contract; these tests
do not certify every production organisation/support-role configuration.

Release requires the app/API changes and migration
`20261001092739_seller_onboarding_access_enforcement.sql`. Deploy the compatible
app/API first (the new reader can fall back to the existing token-checked API),
then apply only the reviewed migration after the repository database guard and
explicit environment approval. Refresh existing app tabs and verify an authorised
agent and synthetic seller link after release. Do not restore permissive policies
to accommodate an outdated browser bundle.

Migration `20261001092402_seller_onboarding_access_scope.sql` is intentionally
empty: a concurrent release recorded it before its implementation was written.
Production history was checked and contains zero statements for that version.
Keep that history entry unchanged; the implementation is in the later migration.

## Seller ownership and field acceptance

The seller lead agent editor and listing seller editor share the ownership model.
Manual capture and physical document preparation do not require email; supplied
email must be valid, and digital signing still requires a distinct valid email
for every required signer. The client-facing onboarding route retains its contact
email requirement. Identity, authority and consent requirements still apply.

Local acceptance matrix (1 October 2026):

| Scenario | Acceptance | Local result |
| --- | --- | --- |
| Individual / married | Personal identity and applicable spouse details; manual capture may omit email | Pass |
| Company / CC, trust, foreign company / trust | Entity identity and representative authority; no hidden personal-name requirement; separate contact | Pass |
| Foreign individual | Passport and country accepted without SA ID; no company-registration question | Pass |
| Deceased estate | Legal estate name/reference separate from executor; estate name is not the property's HOA name | Pass |
| Power of attorney | Principal name/identity separate from representative and authority | Pass |
| Other legal entity | Capture legal name and authority; explicit manual-review notice | Pass |
| Manual versus digital documents | Manual preparation permits absent email; digital signing rejects absent/invalid signer emails | Pass |
| Bond status | Yes, No and Unknown remain distinct through form/canonical round trips; legacy booleans and aliases supported | Pass |
| Lead/listing fields | Shared authority inputs render once; zero rates remain visible and valid; optional email can be cleared | Pass |

These results cover local model, rendering and document-data tests, not a live
save/reload or production RLS certification. Local persistence and signer
consistency checks are recorded below; complete document layout and the live
end-to-end acceptance run remain in the later stages of the seller MVP plan. “Other” is a manual-review route,
not automated approval of every possible legal entity.

Run the focused checks from this package:

```bash
node --test src/lib/__tests__/sellerLeadManualCaptureModel.test.js src/lib/__tests__/sellerFicaOnboardingFields.test.js scripts/seller-onboarding-south-african-scenarios.test.mjs scripts/listing-seller-profile-capture-phase2.test.mjs scripts/listing-seller-canonical-update.test.mjs scripts/listing-mandate-readiness-phase1.test.mjs src/core/documents/__tests__/sellerOnboardingSigningPackSnapshot.test.js src/core/documents/__tests__/sellerReviewedDocumentVersions.test.js src/core/documents/__tests__/sellerMandateDocumentMarkup.test.js
./node_modules/.bin/vitest run src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx
```

The app baseline (`npm run check:app` from the repository root) passed locally.
Two legacy checks failed on the unchanged Git HEAD and the Phase 2 working tree: `seller-onboarding-flow-contract.test.mjs:132` expects a
`body_corporate_details` trigger, and `seller-readiness.test.mjs:213` expects
`record_hard_copy_mandate` rather than `open_documents`. These were not changed
as part of ownership/field correction; their obsolete expectations are corrected
and pass in the Phase 5 acceptance run below.


## Seller saving, synchronisation and signer acceptance

Phase 3 uses the existing atomic seller-save RPC for linked seller lead edits and
listing seller edits. Canonical document facts are rebuilt from the complete saved
form. CRM contact updates follow the listing save; a failed CRM refresh is reported
without disguising the committed listing save. No new database migration is needed
for this phase. Phase 1 access enforcement remains a separate release prerequisite.

Local acceptance matrix (1 October 2026):

| Scenario | Acceptance | Local result |
| --- | --- | --- |
| Edit from linked lead or listing | Both use the shared canonical save; listing and onboarding update in one transaction | Pass: wiring, service and isolated database checks |
| Partial edit and reopen | Unedited facts/disclosure survive; all form aliases show the saved value | Pass |
| Clear email or change ownership | Empty values persist; retired entity details do not reappear | Pass |
| Entity and contact | Legal owner name stays separate; contact edits update the contact name and CRM projection | Pass |
| Stale edit / denied access / write failure | No partial save or false success; stale edit requires reload | Pass: isolated database and service checks |
| Post-save refresh failure | Confirmed save remains available with a follow-up warning | Pass |
| Signer consistency | Signing plan and compliance use the same roster across individual, married, multiple-owner, company, trust, estate and POA routes; foreign entities use representatives | Pass |
| Missing identity or duplicate email | No owner silently removed; digital dispatch blocked; named signers can use the manual route without email | Pass |
| Signer replacement | A new person cannot inherit the previous person's signature or approved authority; existing signed document versions remain preserved | Pass |
| Live lead → listing → documents | Verify save/reload, access and document preparation using authorised synthetic records after release | Pending live acceptance |

Focused checks, from this package:

```bash
node --test scripts/seller-onboarding-access.test.mjs scripts/seller-onboarding-profile-canonical-wiring-phase3.test.mjs scripts/listing-seller-canonical-update.test.mjs scripts/listing-seller-profile-capture-phase2.test.mjs src/lib/__tests__/sellerLeadManualCaptureModel.test.js src/core/documents/__tests__/sellerComplianceSignerResolver.test.js src/core/documents/__tests__/sellerOnboardingPhase8Operational.test.js src/core/documents/__tests__/sellerOnboardingSigningPackSnapshot.test.js src/core/documents/__tests__/sellerReviewedDocumentVersions.test.js
./node_modules/.bin/vitest run src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx src/services/__tests__/privateListingService.sellerAccess.test.js
```

The focused checks, app lint (warnings only), baseline tests and production build
passed locally.

The additional `sellerCompliancePortalModel.test.js:45` assertion that spouse
consent is absent from standalone documents fails on both unchanged Git HEAD and
this working tree. Its other four checks pass. This was carried into Phase 4 and is now resolved: spouse consent remains a
required signature task without a duplicate document upload slot.
No remote data, client messages or deployments were performed for these checks.


## Seller document acceptance

Phase 4 aligns the lead and listing generators for FICA, disclosure and sole,
open and dual mandates. Both signing routes use the same content. New versions
carry the applicable legal owner, representative, all owners and all required
signers. Existing approved HTML and version digests are preserved when opened;
changed content requires a fresh reviewed version.

| Scenario | Acceptance | Local result |
| --- | --- | --- |
| Sole / open / dual mandate | Correct existing wording; dual requires the second agency; commission, VAT and protection period use captured terms | Pass |
| Lead versus listing; manual versus digital | Identical mandate and FICA content for identical approved inputs | Pass |
| FICA fields | Captured identity, authority, tax and declaration fields; no invented compulsory banking, employment or trade questions | Pass |
| Company / CC / trust / foreign entities | Entity name and registration separate from contact; representative authority shown; no entity marital-status question | Pass |
| Estate / POA / other / foreign individual | Estate or principal identity, authority or passport routed correctly; other entity remains subject to manual authority review | Pass |
| Multiple owners | Six-owner render retains every full name, identity and signature; shared contact details do not remove owners | Pass |
| Disclosure | Every named owner appears; long explanations continue on additional pages; signature certificate refers only to disclosure | Pass |
| Spouse consent | Required spouse signer remains; no duplicate standalone upload requirement | Pass |
| Branding and pagination | Agency headers and references repeat; signer and explanation continuation pages do not clip content or overlap footers | Pass: rendered PDFs |
| Browser download | Mandate, FICA and disclosure downloaded with the app's html2pdf renderer and visually checked | Pass |
| Previously approved document | Opening an older version does not regenerate its HTML or digest | Pass |
| Live delivery and returned signatures | Requires the Phase 5 end-to-end acceptance run after authorised release | Not tested live |

Focused verification from this package:

```bash
node --test src/core/documents/__tests__/seller*.test.js scripts/seller-onboarding-south-african-scenarios.test.mjs scripts/listing-seller-canonical-update.test.mjs src/lib/__tests__/sellerLeadManualCaptureModel.test.js
```

All 172 focused checks pass. App lint, baseline tests and build passed; lint retains
existing repository warnings. An additional legacy check,
`kingstons-seller-documents-phase6-authority-documents.test.mjs:178`, expects an
uploaded company resolution to be complete. It fails identically on unchanged
Git HEAD and the working tree; upload/review completion policy was not changed.
The two older baseline failures recorded above remained outside Phase 4.
Phase 5 corrects these obsolete expectations, including uploaded-versus-reviewed
authority status, and reruns the checks successfully.

Rendered review samples use synthetic data only. No migration, remote data change,
client communication or deployment was performed in this phase.


## Seller MVP acceptance outcome

### Original-question recheck before release (1 October 2026)

The recheck found two lead document-preparation sync gaps; both are now corrected
in the primary app. The updated implementation **passes the corrected local MVP
acceptance matrix**, subject to the evidence limits below.

- The second agency, price, dates, protection period, commission and VAT terms
  are captured once and used for both generation and saving. Changing or clearing
  the second agency updates both form aliases. Zero protection days and switching
  commission basis do not restore inactive values.
- Preparation uses the listing's saved seller form rather than a lagging CRM
  projection. It rebuilds canonical facts before generation and commits the form,
  facts, listing price and mandate type through the existing atomic save.
  Reviewed copies are included in that transaction; old versions retain their
  original HTML, IDs and digests in history. Subsequent dispatch/status updates
  do not rewrite preparation terms.
- Save failures and stale-edit conflicts stop preparation before dispatch or
  local success. A committed save with a readback warning remains available but
  blocks dispatch until the warning is resolved.

The existing canonical-update check now executes the actual lead action with
real document/save models and fixture transports: sole/open/dual through manual
and digital preparation, matching reopened lead/listing/document terms, failed
and conflicting saves, readback warnings, and immutable previous copies. The
isolated PostgreSQL check independently reads both saved snapshots and confirms
that a rejected onboarding write rolls back listing price and facts too.

Fresh verification: 232 focused Node checks and 26 component/service/API checks
passed, including 10 new actual-action cases in the canonical-update script.
The seller-workspace suite and build also passed. Targeted app lint has zero
errors (existing warnings). No new database migration is required for this
correction.

Four supplemental legacy checks failed on obsolete expectations: the old journey
omits the existing `mandate_sent` stage; conversion inspects a retired generator;
mandate saving inspects the old `AgentLeadsPage` wrapper; timeline serialization
expects the previous journey guard rather than the current compliance-aware
draft/created/live labels. These are check-maintenance findings, not evidence of
four new product defects. No remote data or client messages were changed or sent.
Buyer acceptance and a complete hosted digital-signature cycle remain
outside the verified seller evidence.

Phase 5 local verification completed on 1 October 2026. **Live MVP sign-off is
HOLD**, not passed: the read-only Arch9 SaaS catalog check found the broad
onboarding policies still active and migration `20261001092739` absent. The
Phase 1 implementation must be released before hosted access can be accepted.
No deployment, migration application, remote test write or client message was
performed during this run.

The connected acceptance tests found and corrected these remaining gaps in the
primary application:

- Close corporations are now selectable and stay CCs through capture and reopen;
  their submission validation uses entity requirements instead of personal ones.
- Compact lead capture retains spouse details. The editor's marital dropdown
  values map consistently into the signer roster: community-of-property includes
  the spouse; ANC/out-of-community does not automatically add the spouse, while
  explicitly required spouse consent still does. Foreign-marriage review rules
  remain in place. Co-owners belong in the multiple-owner route.
- Legacy seller email/phone aliases reach the signer data. Deliberately clearing
  contact fields stays cleared instead of restoring stale aliases on reopen.
- Agent onboarding offers dual mandates with a saved second-agency name.
- Legacy tests now distinguish captured fields from document uploads, uploaded
  authority from reviewed authority, and the scoped RPC from the removed unsafe
  table fallback. The live-evidence validator requires every named check.

| Acceptance area | Evidence / result | Remaining limit |
| --- | --- | --- |
| 13 ownership scenarios × sole/open/dual | Pass: 39 combinations through capture adapter, actual local PostgreSQL save, independent readback, listing edit, three generated/frozen copies and physical-upload metadata review | Synthetic fixture; not a hosted session or storage upload |
| Individual, COP, ANC, multiple owners, company, CC, trust, estate, POA, foreign individual/company/trust, other | Correct saved legal owner and signer count; shared-name owners stay separate | Other requires manual authority review; trust case uses the captured authorised trustee and supporting authority |
| Access, token expiry, failed and concurrent saves | Pass: assigned agent/outsider/anonymous policies, rollback, token scope, stale-write denial and idempotent save replay in isolated PostgreSQL | Existing organisation-access helper is a fixture; live policies currently block release acceptance |
| Current physical copy and approval | Pass: digests verify; approved upload metadata projects consistently; stale/unversioned review is rejected by existing focused checks | Binary storage, download from both live entry points and human signature inspection remain unverified |
| Actual shared editors | Pass: browser capture/reopen for CC, dual second agency, zero rates and COP/ANC; desktop 1440px and mobile 390px without horizontal overflow | Isolated component harness with local storage, not logged-in production lead conversion |
| Client-free manual route | Local checks make no remote requests or client sends; blank delivery addresses supported | Zero client notification side effects must still be observed in the hosted workflow |
| Per-document portal signing | Shared version/signer and feature-gate checks pass; retired combined route stays disabled | Live issue, invitation delivery, each recipient signature and final review not executed |
| Conversion / document continuity | Local save retry and document projection checks pass | Repeated live lead conversion, actual upload retry and cross-entry status readback remain unverified |
| Historical records | Read-only audit returned 37 candidates: 24 differing snapshots, 13 captured owner forms without canonical owner facts | Review candidates, not confirmed corruption or approval to repair |

The identifier-only list is in [seller-mvp-review-candidates.json](docs/seller-mvp-review-candidates.json).
Its repeatable read-only query is [seller-mvp-acceptance-audit.sql](scripts/sql/seller-mvp-acceptance-audit.sql).
Do not bulk-rewrite these records or regenerate approved/signed copies.

Verification commands from this package:

```bash
node --test src/core/documents/__tests__/seller*.test.js src/core/documents/__tests__/onlineSigningPolicy.test.js src/services/__tests__/sellerPhysicalSigningVersionReview.test.js src/services/__tests__/sellerReviewedMandateContinuity.test.js scripts/seller-onboarding-access.test.mjs scripts/seller-onboarding-flow-contract.test.mjs scripts/seller-readiness.test.mjs scripts/kingstons-seller-documents-phase6-authority-documents.test.mjs scripts/seller-onboarding-south-african-scenarios.test.mjs scripts/listing-seller-canonical-update.test.mjs scripts/listing-seller-end-to-end-release.test.mjs scripts/listing-seller-profile-capture-phase2.test.mjs src/lib/__tests__/sellerLeadManualCaptureModel.test.js
./node_modules/.bin/vitest run src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx src/services/__tests__/privateListingService.sellerAccess.test.js server/services/sellerOnboardingCoreApi.test.js
npm run check:listing-seller-workspace
```

Verification results: 231 focused Node checks and 26 component/service/API checks
passed. The existing seller-workspace check and root `npm run check:app` passed;
app lint reports existing warnings (zero errors). Final targeted lint and a fresh
build cover the last capture fixes.
The live gate (`--require-manual`) correctly fails without a completed observation;
the pending template was not relabelled as passed.

Use the existing [controlled acceptance runbook](docs/listing-seller-phase10-release-runbook.md)
and its expanded evidence template for the authorised hosted run. Leave unobserved
checks false. Passing local checks never substitutes for that live evidence or
provides deployment approval. Buyer readiness is outside this seller sign-off.

## Dashboard FIC foundation training

Every agency's company and agent dashboard shows Commission Target and FIC
training side by side on desktop, stacking on smaller screens. Agents complete
the existing six-question foundation quiz; principals review their team's
completion and scores, and can preview the quiz without recording a result.

Apply `20261002070559_global_agency_fic_training.sql` to enable result saves
outside Home Seekers. Existing results remain in the original
`home_seekers_fic_training_results` table. Active agency membership is required;
agents save only their own results and principals read only their agency's team.

Focused checks: `node scripts/global-fic-training.test.mjs` and
`npx vitest run src/components/training/__tests__/FicTrainingPanel.test.jsx`.

## Branch FIC training

The primary workspace's branch **FIC Training** tab provides six foundation lessons,
a server-graded assessment, dated attempt history, branch staff assignments and a
CSV register. Organisation owners and principals can publish an approved RMCP PDF;
staff acknowledgements refer to that exact policy version. Publishing a new
version retains earlier documents and acknowledgements.

The feature requires migration
`20261001202026_branch_fic_training_compliance.sql`. Its private
`fic-compliance` bucket accepts PDFs up to 10 MB. Agents read their own learning
records; branch managers and compliance staff review their assigned branch;
owners and principals manage organisation policies. Documents are immutable and
older permissive storage policies cannot broaden this bucket's access.

Run `node scripts/branch-fic-training.test.mjs` from this package for the isolated
Postgres migration, access, grading, policy-version and export checks. It does not
write to a remote database.

The course is introductory training material, not an accredited qualification or
a determination that a branch complies with the FIC Act. The organisation's
responsible compliance person should review the lessons against its approved
RMCP. Source starting points: [FIC obligations](https://www.fic.gov.za/compliance/)
and [FIC estate-agent guidance](https://www.fic.gov.za/accountable-institut/estate-agents/).
Regulatory reporting and actual sanctions screening use the organisation's approved
processes; this module records learning and policy acknowledgement.

## Agency business lines

Organisation setup and Settings → Organisation offer Sales, Rentals, and
Short-term rentals independently. Save the organisation lines, then assign members
any combination in Roles & Permissions. Principals and managers inherit enabled
organisation lines. Existing Sales & Rentals assignments retain their original two
lines; short-term access requires an explicit assignment or management role.

The sidebar organisation (Business) dropdown is removed. The separate business-line
selector shows Sales, Rentals and Short-term rentals according to saved organisation
settings and member access. Manually enabling a rental line activates it; Sales-only
setups do not show it automatically. The selection is saved per account and
organisation and restored before route guards run on refresh. Individual module
release gates and action permissions continue to apply.

Focused checks: `npx vitest run src/lib/__tests__/threeBusinessLines.test.js
src/lib/__tests__/businessWorkspaceAccess.test.js
src/lib/__tests__/rentalOperatingModeNavigation.test.js
src/pages/settings/__tests__/SettingsUsersPage.test.jsx`.

## Show day creation

Marketing → Events → Show Days → Create uses Property & timing, Guest experience,
and Review steps, with a linked property preview and publishing checklist. A draft
can be saved after selecting a listing; publication requires valid future/current
dates, a host, and an active listing for public events. Changing the property resets
the host to its assigned agent. Custom host names clear the linked user ID.

Registration links become shareable from the published event workspace. Local-only
storage cannot publish a public registration page. Disabling registration also
disables automatic lead creation for registrations. No invitations are sent by the
builder itself.

Focused checks: `npx vitest run src/components/marketing/__tests__/ShowDayCreate.test.jsx
src/components/marketing/__tests__/ShowDayWorkspace.test.jsx`,
`npm run test:show-day-phase5`, and `npm run test:listing-show-day-capture`.

## Revo inbox workspace

Revo's inbox selector uses existing connected email/WhatsApp address records.
Search, ownership/status views, channel filters and sorting combine in one scope;
the reader never retains a conversation excluded by those filters. Navigation
and contact details can collapse, and small screens open a reader with a back action.
Email pop-out opens a separate reader window and retains the original conversation;
closing the parent inbox closes its pop-out. No messages or credentials are copied
into a URL or browser storage. Unsaved reply/note text stays separate per conversation
while the page is open. Save draft/Save note use the existing private message ledger;
reply drafts are explicitly unsent. Assignment supports claiming/unassigning yourself
and preserving an existing team owner. Manage inboxes opens existing connection setup.
Named team queues, outbound sending and attachments are outside this first pass.

Focused checks: `npx vitest run src/pages/revo/__tests__/RevoSharedInboxPage.test.jsx`,
`npm run test:revo-shared-inbox-operations` and `npm run test:revo-inbox-connection-core`.

## Show Days landing page

The event landing page has a separate header, five summary cards, equal status tabs
including Draft, search/sorting, and larger property rows with working open actions.
Shared mode loads only the selected organisation's persisted events; sample events
are not substituted while loading or on failure. Registration records provide the
same metrics used by the event workspace. If those records cannot load, the page
explicitly identifies its saved-total fallback. Local planning starts empty when
there are no saved events. Past events still marked Upcoming receive a review hint;
the landing page does not silently change their status or write any records.

Focused checks: `npx vitest run src/components/marketing/__tests__/ShowDaysLanding.test.jsx
src/components/marketing/__tests__/ShowDayWorkspace.test.jsx
src/components/marketing/__tests__/ShowDayCreate.test.jsx`.

## Rental tenancy register

Tenancies is the main long-term rental navigation item, alongside Leads and
Listings. Applications remain accessible from Leads and the tenancy register.
The register loads persisted tenancy, property and unit records in batches,
then presents 15 rows per page with search and lifecycle filters. Each row opens
the existing tenancy workspace. Rent and dates prefer the current lease version,
with legacy lease terms used only when needed. Missing values remain explicit.

Focused checks: the RentalTenanciesPage, rentalTenancyRegisterModel and
rentalOperatingModeNavigation Vitest tests, application-handoff and tenancy-move-in
checks, scoped ESLint, and the Vite production build. The separate lease-signing
check currently fails its existing maintenance/inspection context assertions.

## Rental onboarding discovery

The [rental onboarding discovery and document contract](docs/rental-onboarding-discovery-and-document-contract.md)
defines the landlord and tenant questions, conditional evidence matrix, document
scopes and acceptance scenarios. Phase 2 fixes existing tenant evidence consistency;
Phase 3 adds the shared definitions and saved checklist/revision/assignment
foundation. Phase 4 connects saved requirement IDs/generations to tenant onboarding,
uploads, progress, submission and approval, and displays the saved landlord matrix
preview. Phase 5 adds versioned landlord discovery, secure onboarding links,
agent/landlord file collection, per-property evidence review and the prescribed
disclosure gate before new mandate acceptance. Phase 6 verifies local browser and
database continuity, preserves submitted declarations/documents during property
handoff, and isolates public forms when an onboarding link changes. It also
prepares the scoped migration manifest and read-only release catalog checks.
Hosted acceptance and deployment still require release approval. The broader landlord matrix retains
preview policy mode; proposed agency policy values await confirmation. See the
contract for migration order, release dependencies and verification.

### Seller portal launch access pass — 3 October 2026

The primary app now offers device sign-out on desktop and mobile, clears private
portal state and fences pending reads on sign-out, rejects invalid stored session
expiry values, and hides placeholder contact emails. Agent seller workspaces
expose confirmed portal revoke/reactivate and session sign-out controls.

Read-only production inspection confirmed seller onboarding direct-table access
is fenced by listing membership and unavailable to anonymous visitors. However,
the existing management, password-reset and diagnostics RPCs lack that membership
check. The append-only migration
`20261003145000_seller_portal_management_listing_access.sql` was subsequently
approved and applied in the 3 October production release. A rollback-only live
check allowed the Only Realty assigned agent and rejected an unrelated user
across management, password-reset and diagnostics. This clears that database
permission blocker. Recovery-email delivery and attorney-stage acceptance remain
separate verification tasks.

Use the existing access-stability, security-controls, password-recovery and
upload-feedback checks, the focused SellerPortalAccessControls/SellerPhaseOne/
SellerPortalPasswordGate/sellerAccess tests, and `npm run check:app`. Only Realty
browser verification covers the current pre-transaction account; attorney-stage
updates and real recovery-email delivery still require controlled acceptance.
The saved placeholder agent email, absent listing photos/live links and lack of
a linked transaction remain data/acceptance gaps, rather than fabricated content.
