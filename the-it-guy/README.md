# bridge.

High-end React + Vite + Supabase transaction workspace for Samlin Construction.

## Mobile push notification test

Open the mobile bell and select **Push notification settings** to reach the
**Inbox**. In the **Inbox** or **Documents** screen, select **Enable Notifications**,
allow device notifications, then select **Send me a test**. On iPhone, open Arch9
from its Home Screen icon on iOS 16.4 or later. Tests target only the requesting
account's registered device, use fixed test wording and open the mobile Inbox.
Each account can send one test every 30 seconds. Provider acceptance is reported
separately from seeing the notification on the phone. **Disable notifications**
removes this device's server registration and browser subscription. Switching
accounts or rotating the VAPID key requires re-enabling. This first version does
not connect transaction, lead or appointment events to push delivery.

The primary app owns `/api/mobile/push` and the push-only `/push-sw.js` worker.
The worker does not cache application requests. Device encryption material is
server-only; Supabase verifies the signed-in account for every API action.

Before releasing, apply only the approved forward migration
`20261008185046_mobile_web_push_subscriptions.sql` using the database release
runbook, then configure a single stable key pair in server runtime secrets:
`WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and
`WEB_PUSH_VAPID_SUBJECT` (a real `mailto:` contact). Generate the pair once with
`web-push.generateVAPIDKeys()` and provision directly into runtime secret storage;
never print or commit its private key or put it in a `VITE_` variable. The API
also uses the existing server `SUPABASE_URL`/`VITE_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Missing setup displays unavailable rather than a
successful opt-in. Keep the previous app release for rollback and preserve the
subscription tables and their send limits; no historical data is updated.

Focused check: `npm run test:mobile-web-push` executes the actual migration in an
isolated PostgreSQL fixture, verifies ownership and grants, generates encrypted
VAPID requests locally, and checks permission/registration/error states and
notification taps. It makes no hosted writes and sends no real notifications.
Local Vite browsing refuses registration/send mutations against hosted data.
After an approved deployment, confirm the worker is served as JavaScript rather
than the SPA, then perform an opted-in iPhone lock-screen test and tap it to open
the Inbox. Local tests do not establish iPhone delivery.

Custom messages from an operator use the POST-only `/api/mobile/push-operator`.
`WEB_PUSH_OPERATOR_TOKEN` is a dedicated server secret and
`WEB_PUSH_OPERATOR_USER_ID` pins the receiving account. Requests can supply only
a title (80 characters), message (240 characters), and optional `dryRun` boolean;
they cannot choose another recipient or a link. Delivery goes to that account's
most recently enabled device and shares the 30-second self-test cooldown.
The endpoint never returns subscription endpoints, encryption keys or credentials.

After explicit approval of the content, run `node scripts/send-mobile-push.mjs
--title 'New Lead' --message 'You received a new enquiry'`. The command reads the
dedicated operator token from `~/.config/arch9/mobile-push-operator-token`, stored
with mode 0600 outside this repository. `--dry-run` checks setup without sending
or reserving the cooldown. There is no automatic retry: an interrupted request
has uncertain delivery and requires review before another attempt. Keep this
credential server-side and rotate it in both protected stores if revoked.

## Development creation

Add Development uses Details → Units → Sales setup → Review. Details are grouped
into visible project and address sections. The actions follow the form content,
and desktop and mobile use the same flow. Developer access and transaction
defaults remain optional; invitations are only attempted when the agent selects
Invite developer and completes its required fields. The selected development
type is retained in the existing development profile's marketing overview.
Units shows the planned total above two choices: Set up units now or Set up units
later. Later allows adding or importing units from the saved workspace. Choosing
Set up units now stays inside Units, with a compact progress bar for Structure →
Unit layouts → Check units. Layout cards open a focused editor for room counts,
size, price, quantity, storeys and an optional floor plan or image. Building/floor
allocation appears only for grouped units. Cancel discards local editor changes;
Save layout returns to the cards. Draft and navigation actions wait until the
editor is saved or cancelled. Back preserves saved layouts. Review uses a simple
unit summary with automatic numbers; custom numbering is collapsed by default.
Sales setup has three optional cards: Developer, Sales team, and Reservation
deposit. Deposit fields appear only when enabled; extra partner and workflow
settings sit under More settings. Final Review shows project details, layout
previews, unit totals, and sales choices. Each section has a direct Edit action
that returns to Review after validation. Invitation recipients are shown before
saving; editing or returning to Review never sends invitations.

Duplicate opens a new layout with copied specifications and attachment, a unique
name, and empty quantity/allocation fields. Nothing is added until Save layout.
Undo restores the latest removed layout, building or floor, or structure change,
including its attachments and allocations. Undo is available in the current
session until another stock change; unfinished editor changes must be saved or
cancelled first. Ctrl/Command + Enter continues or saves a layout, Escape cancels
the layout editor, and Ctrl/Command + S saves a layout or workspace draft.
Ctrl/Command + Z undoes stock removal outside editable fields. Review always
requires clicking Create Development. Shortcut hints live in button tooltips.
Completed saves show a compact confirmation with Done and Open development;
partial-save warnings stay visible and cannot trigger another creation. These
actions remain unavailable while the final setup work is running.

Creation autosaves one recovery draft per account, workspace and role on this
browser; recovery expires after seven days. Resume draft restores the screen, sales settings and
unfinished layout editor. Start fresh discards only that local draft. Text saves
synchronously in versioned local storage; attachments stay in IndexedDB until a
server save. Saved on this device is separate from Save Draft, which still saves
to the workspace. Missing attachments must be reattached or explicitly removed.
If recovery fails, closing asks whether to leave; a refresh warns while recovery
is incomplete. A returned development ID replaces the recovery draft with an
Open development link, including partial saves, to prevent duplicate creation.
Successful server saves clear recovery. No invitations are sent during recovery.

Draft and final saves validate the details and any selected sales defaults.
Completing setup creates an active development automatically; Save Draft keeps
the development as a draft. Status is not a choice in the creation form.
Physical structure has two choices: Units for houses, townhouses and duplexes, or
Buildings + Units for one or multiple buildings with optional floors. A layout's
Number of storeys describes levels inside one unit; building floors describe
where units are located. Storeys are retained in the existing floorplan catalogue
metadata, with each generated unit linked to its layout. Layouts allocate whole-number quantities
explicitly to these locations. Release phases are left blank during creation.
Building/floor records are saved before linked units using the existing structure
model. A failed structure save stops unit creation and opens the saved development
for recovery. Generating stock derives the planned total from the layouts;
unfinished stock must be completed or deferred before a draft save. Optional
attachments use the existing development asset uploader after the development
is created, before the catalogue and units are saved. Upload receipts link the
file to its catalogue layout. Room counts use existing catalogue fields. No
database migration is required.
Known failures after creation retain the saved development ID and show a link to
its workspace instead of allowing another create. Profile, settings, directory
and invitation warnings remain visible in that receipt. Creation still uses
sequential writes and does not provide a database transaction across setup.

Address suggestions require `VITE_GOOGLE_MAPS_API_KEY` in the running app.
Manual address entry remains available when the key is absent.

Focused local checks: `npx vitest run src/components/__tests__/AddDevelopmentModal.test.jsx src/core/developments/__tests__/developmentCreateDraft.test.js`
and `node --test src/lib/__tests__/developmentCreation.test.js`, plus the existing
`scripts/developer-access-optional.test.mjs`,
`scripts/development-transaction-defaults-optional.test.mjs` and
`scripts/development-create-schema-cache-fallback.test.mjs` checks.
These use local fixtures and send no invitations or hosted database writes.
Stock allocation checks: `node --test src/core/developments/__tests__/developmentStockPlan.test.js`
and `npm run test:development-structure-model`.

## Development image access

Development covers, galleries, floorplans and visual-map backgrounds renew private
storage access when loaded. Existing signed URLs are recovered using their original
bucket and development path, including legacy uploads without separate storage
metadata. Saves retain token-free object references; external and public image URLs
are preserved. Signing uses the current user's storage permissions, batches up to
100 paths, and shares a bounded cache that clears when the account changes.
Optional card images may fall back when storage is unavailable; editable development
profiles stop loading on signing failure so a save cannot discard media references.
No database migration or re-upload is needed.

Focused checks from this package:
`node --test src/lib/__tests__/developmentMediaStorage.test.js`,
`node src/lib/__tests__/transactionsListApi.test.js`,
`node src/lib/api/__tests__/dashboardCoreSummary.test.js`, and
`node scripts/development-marketing-simplified.test.mjs`.
These use local fixtures and make no live writes. Production requires an app release
and an authorised Samlin user's check of Junoah's images after that release.

## Lead capture from Kanban and listings

Sales Kanban includes a Create Lead control on the board for the current buyer
or seller category, using the same capture dialog as the table. New sales listing
capture and saved drafts now create a CRM seller lead once seller details are
present, then verify both listing links and the CRM lead's listing link. Retries
reuse the same lead and contact; existing seller stages are retained. Rentals,
developer stock and empty drafts do not create sales seller leads.
Focused checks: `npx vitest run src/pages/agency/__tests__/LeadListPage.kanban.test.jsx
src/services/listings/__tests__/listingSellerLeadService.test.js`,
`node scripts/agency-lead-create-dialog-controls.test.mjs` and
`node scripts/direct-listing-persistence-phase3.test.mjs`.
These use fixtures without live CRM writes. No new migration is required.

## Agent workspace listings

Organisation → Agents → Agent workspace → Listings uses the same sales, rental
and development cards as the main listing pages. Sales, Rentals and Developments
switches show the selected agent's stock; listing photos use the existing cover
image service. Developments include direct agent assignments before a sale exists.
The unavailable Assign Listing control has been removed.
Focused checks: `npx vitest run src/components/agents/__tests__/AgentWorkspaceListings.test.jsx
src/components/agents/__tests__/AgentWorkspaceOverview.test.jsx`,
`node scripts/agent-listings-delete-ui.test.mjs` and
`node scripts/agent-workspace-inline-management.test.mjs`.
These use local fixtures. No migration is required.

## Agent workspace leads

Organisation → Agents → Agent workspace → Leads embeds the normal Leads screen,
including buyer/seller/archive categories, search, filters, pagination, Table and
Kanban views, capture and lead actions. Assignment is locked to the selected agent;
queries, cached pages and summary counts use that agent's user/membership IDs or
saved assignment email within the current organisation. New leads go to that agent
while the signed-in manager remains the recorded creator. No migration is required.

The lead list applies buyer/seller/archive categories, search and filters before
dividing matches into pages. It reuses the complete, authorised summary snapshot
and reads category contacts in bounded batches so an older seller or a contact
name on a later mixed page remains discoverable. Table totals and pagination count
all matching leads; category badges and seller journey totals use the same snapshot.
Refresh after deletion clamps the list to the last remaining page.
Focused checks: `npx vitest run src/pages/agency/__tests__/AgencyLeadListRoutePage.agentScope.test.jsx
src/pages/agency/__tests__/agencyLeadListReadRepository.agentScope.test.js
src/pages/agency/__tests__/LeadListPage.kanban.test.jsx`.
These checks use local fixtures and make no hosted CRM changes.
Focused checks: `npx vitest run src/pages/agency/__tests__/AgencyLeadListRoutePage.agentScope.test.jsx
src/pages/agency/__tests__/agencyLeadListReadRepository.agentScope.test.js
src/pages/agency/__tests__/LeadListPage.kanban.test.jsx` and
`node scripts/seller-leads-read-boundary-phase9.test.mjs`.
These use local fixtures without live CRM changes.

## Agent overview next actions

Organisation → Agents → Agent workspace → Overview replaces Tasks & reminders
with Needs attention. The card shows up to five urgent new leads awaiting contact
and dated follow-ups due today or overdue. It reads persisted, organisation-scoped
CRM records with complete pagination; unassigned tasks inherit the linked lead's
assignee, while explicit task assignments take precedence. Completed tasks and
closed leads are excluded. Dates use Africa/Johannesburg; only expired deadlines
are red, and leads without an SLA deadline show No due date. Each action opens
the relevant lead workspace, including its follow-up section. Failed reads show
Retry, rather than an empty queue. The card refreshes on CRM changes, window focus,
and its Refresh action. Seller onboarding and draft listing readiness are outside
this first version. No migration, live write or email is required.
Focused checks: `npx vitest run src/components/agents/__tests__/agentNeedsAttentionModel.test.js
src/components/agents/__tests__/AgentNeedsAttention.test.jsx
src/components/agents/__tests__/AgentWorkspaceOverview.test.jsx
src/services/__tests__/agentNeedsAttentionService.test.js` and the primary app build.

## Agent card rental enquiries

Agents can enable Rental enquiries and edit the Rental button label in Dashboard
→ My digital business card → Edit card, or in the Lead Capture card editor.
Existing cards retain their buy/sell actions. Rental-only cards are supported.
The public card captures monthly rent, area and preferences using the same privacy
consent and retry protection as existing enquiries. The server uses the card's
organisation, branch and agent assignment and the shared rental CRM metadata, so
these contacts appear as tenant leads. Rental submissions do not create sales
matching requirements; card statistics count them separately.

Apply `20261008140000_agent_card_rental_enquiries.sql` before deploying the app/API.
It expands the existing intake and event constraints; rental actions require an
agent card. It changes no permissions or existing card settings. The custom label
uses existing card metadata. This local change has not been deployed or applied
to a remote database.

Focused checks: `npx vitest run
src/components/dashboard/__tests__/AgentDigitalCardPanel.test.jsx
src/pages/__tests__/PublicAgentDigitalCardPage.rental.test.jsx
server/tests/agentCardRentalMigration.test.js`,
`node src/services/__tests__/agencyPublicIntakeLinkService.test.js` and
`node server/tests/publicAgencyIntakeApi.test.js`.

## Transaction buyer and seller capture

The agent's Create Transaction → Buyer & Seller step captures each legal entity
separately from its people. Individuals, multiple owners, companies, CCs, trusts,
foreign entities and seller estates can record representatives, spouses, ownership,
contact and signing roles. Every person keeps a stable identity and their own
marital status and marriage regime. Missing identity or authority information stays
visible as an item to confirm; capture does not approve documents or authority.

The transaction saves this snapshot in the existing buyer onboarding JSON and
passes it to document generation. The current legal checklist supplies the entity
and marriage document sets; mixed owners combine their applicable sets. Canonical
identity and marital requirements retain the exact person's identity. Compatibility
upload slots permit multiple files where several people need the same evidence.
Existing files and review states remain attached on recalculation. Checklist items
awaiting approval are shown as pending in the preview and retain the existing policy.
Foreign-law and other-entity details remain flagged for attorney confirmation.

Focused local checks from this package:
`node --test src/core/transactions/__tests__/transactionPartyProfile.test.js src/services/documents/__tests__/documentRequestCanonicalTransactionSyncService.test.js src/services/documents/__tests__/documentRequestCanonicalRequiredDocumentSyncService.test.js`,
`node scripts/transaction-canonical-document-engine.test.mjs`, and
`npx vitest run src/components/transaction/__tests__/TransactionPartyCapture.test.jsx src/components/transaction/__tests__/AgentTransactionPartyCapture.test.jsx src/services/documents/__tests__/transactionPartyRequirements.test.js`.
These checks use fixtures and send no invitations or live writes. This change needs
no migration. Production release and a saved-matter live check are separate steps.

The capture flow now includes an Existing Documents step. It accepts the agreed
selling price (prefilled from a linked listing/unit) and actual sale date, reuses
buyer leads, listing seller details and available CRM seller leads, and preserves
the chosen stage for address-first backfills. Documents are queued locally until
the transaction has been created; closing before saving discards that queue.
Files use the standard type/size checks and authenticated transaction upload API.
The receipt reports each saved or failed file and retries only unsaved files
against the same transaction. Unmatched evidence is retained in the document
library for manual checklist matching; person-specific uploads never guess which
co-owner's requirement to satisfy. Uploads stay internal and still need review.
If creation reports that a transaction exists but setup is incomplete, the wizard
opens that existing transaction instead of offering to create another one.

Additional focused checks:
`npx vitest run src/core/transactions/__tests__/transactionCaptureDocuments.test.js src/components/transaction/__tests__/AgentTransactionPartyCapture.test.jsx`
and `node src/core/transactions/__tests__/newTransactionSetupHealth.test.js`.
No schema migration or remote data change is required for this capture flow.

Transaction capture also records buyer finance (unknown, cash, bond or mixed),
the bank and reported application position, plus the seller's separate existing
bond position, bank and reference. Funding checks use the existing deal setup
contract: the deposit is included in the mixed route's cash portion; incomplete
or inconsistent funding remains a follow-up item. Reported approval does not
verify bank approval or advance the captured transaction stage.

Transfer, bond registration and cancellation attorneys remain separate roles.
Known organisation destinations use existing firm nomination and the durable
handoff register. An external nominee, including a directory contact without an
organisation destination, is excluded from immediate assignment and receives
the existing organisation connection invitation after save. The finance snapshot
retains the professional nominations in `__bridge_finance.captureSnapshot`.
Explicit nominees supersede inherited development defaults; cash suppresses
buyer bond professionals and a direct bank route suppresses originators. Seller
cancellation can still apply to a cash purchase. Seller bond facts also update
the canonical document checklist and capture upload options.

Invitation recovery reads history strictly before creating: permission/network
failures cannot prove absence. Pending or accepted invitations are reused;
expired/declined invitations require review in the transaction workspace. Failed
attempts retry against the saved transaction. An unconfirmed email is shown as
unconfirmed; invitation, delivery and firm acceptance are separate states in the
existing handoff register shown on the receipt. No new migration is introduced;
the organisation handoff and invitation infrastructure described below must be
available on the target before live verification.

Focused finance/handoff checks:
`npx vitest run src/core/transactions/__tests__/transactionCaptureFinance.test.js src/services/__tests__/transactionCaptureHandoffService.test.js src/components/transaction/__tests__/AgentTransactionPartyCapture.test.jsx src/services/documents/__tests__/transactionPartyRequirements.test.js`
and the existing `npm run test:transaction-handoff-register` and
`npm run test:transaction-partner-invite-org-connection`.
These fixture checks send no live invitations or instructions.

Scenario verification also exercises 192 combinations of buyer and seller entities, marital
positions, finance routes and seller bond positions through snapshot reload,
canonical checklist generation, person-specific evidence matching and professional
routing. Seller estates are included across those combinations. Reopening capture
starts with a fresh form, preventing property details, notes and appointed firms
from carrying over. Invitation recovery refuses malformed history and reuses a
persisted invitation after a lost response.

Run the existing focused checks above plus
`npx vitest run src/services/documents/__tests__/transactionCaptureScenarios.test.js`.
These are local fixture checks of the wizard and services. Authenticated storage,
organisation connection, email delivery and acceptance on a deployed environment
still need a live saved-transaction check after an authorised release.

## Retired document generator

The legacy mandate/OTP generator, template workspace, packet signing endpoints,
and background generation jobs are permanently retired. Seller onboarding must
not create a mandate packet. Signed mandates and OTPs use the normal listing or
transaction document upload paths; the onboarding defects/compliance form remains
independent. Existing document records and final-file access are preserved.

Run `node --test scripts/document-generator-retirement.test.mjs` from this package
to check the retirement boundary and independent upload behavior. Server handler
changes require an explicit deployment before they affect an existing environment.

Seller mandate, FICA and disclosure HTML downloads use the shared browser PDF
exporter. It keeps the source off-screen in a wrapper while the captured document
retains normal layout, preserving its page height. The disclosure download uses
the same exporter after its existing completeness and current-branding checks.
Run `npm run test:seller-document-pdf-download` for the local Chromium download
regression, also included in `npm run check:listing-seller-workspace`.
It checks original and corrected copies, mobile downloads, two distinct agency
palettes and public/private image access. The actual PDFs must retain page counts,
visible content, repeated logos and the saved primary/accent colours. Missing,
corrupt, expired, timed-out or inaccessible images must stop the download and
remove temporary rendering elements. It uses no remote services.
SVG logos with only a viewBox receive explicit dimensions in the export copy,
preventing canvas capture from cropping the logo. The check includes the Home
Seekers SVG and verifies all four corners of synthetic logos on every page.
Install the browser with `npx playwright install chromium`
if it is missing. PDF and rendered-page evidence is written to
`test-results/seller-document-pdf-download/`.

The mandate wording review has a shared A4 layout for Exclusive, Open and Dual
drafts. It reads the exact Phase 1 Markdown, presents the captured commercial
terms and schedules, retains every numbered clause, and keeps each seller
signature and both Dual agency acceptance blocks intact. Missing details remain
visible. Each page carries a review warning, reference, wording version and page
number. Long text uses measured pagination; the review exporter captures each
page separately to avoid browser canvas limits. Full signing copies require the
exact approvals described below; historical copies retain their frozen wording.

Run `node scripts/render-seller-mandate-review-pdfs.mjs` from this package to
regenerate the three synthetic review proofs in the repository's `output/pdf/`.
The same script with `--check` writes all evidence under
`test-results/mandate-review-layout/`, including ordinary, maximum-length,
six-owner, mobile, zero-protection, fixed/open-period, missing-data and branding
cases. `npm run test:seller-document-pdf-download` includes this check and the
wording-preservation tests. Saved revised schedules also produce this full draft
in the normal post-onboarding review, with scripts blocked in preview frames and
pagination performed by the app. Mobile previews retain the complete text.

The separate seller-document signing service supports the full layout behind
explicit approval gates. `sellerMandateWordingRelease.js` pins the complete three
source drafts and their hashes; all releases remain pending and the agency
approval register is empty. An old template approval or client flag cannot enable
them. Exact business/counsel wording approval, matching agency-schedule approval,
checked authority/signed disclosure/FFC evidence and complete captured terms are
required before a signing version can freeze. Agency certificates must remain
current when links are issued or used. Do not populate approvals from synthetic
test fixtures.

Full copies freeze the wording, commercial schedules, notices, parties, branding,
evidence review and signer matrix together. Exclusive/Open include one agency
acceptance; Dual includes two distinct agency recipients on the same copy. FICA
and disclosure retain their seller signers. An agency token accesses only its
mandate. Changes to full frozen mandates require a replacement and fresh review;
the old-copy correction path remains separate. Preview and final review require
every signature, and signature evidence prints in its matching seller or agency
block before pagination. No retired packet endpoint is re-enabled.

Newly finalized FICA/disclosure copies also annotate their signature panels with
the recorded per-person date/place and signature. Their appended evidence pages
reuse the frozen source's logo, palette and footer, with bounded signer groups
and updated page numbers. Frozen source bytes and existing final artifacts stay
unchanged. The final-evidence checks run with the reviewed-version check below;
signature completion does not assert verification of supporting FICA evidence.

Run `npm run test:seller-reviewed-document-versions` for pending-approval, exact
wording, frozen-input and tampering checks. `npm run test:seller-document-journey`
also exercises the three full mandate variants through the actual Edge handler
and existing SQL, using explicit synthetic approval substitutions. For a focused
rerun after changing the full mandate flow, use
`node scripts/seller-document-journey.test.mjs --full-mandates-only`.
These are local checks. Real commercial/legal approvals, hosted acceptance and
an explicitly requested deployment remain necessary before activation.

Run `npm run test:seller-document-journey` for connected local acceptance of all
three generators. It carries the same PostgreSQL records through canonical save,
save retry, reopen, generation, frozen approval, browser download, shared-detail
correction, each required signature or physical upload, review, and reopen. The
original eight journeys cover individual, multiple-owner, company and trust
sellers across sole, exclusive, open and dual mandates. Three full-wording
journeys verify contracting-agency signatures and archived wording. Four
additional connected journeys complete FICA/disclosure first, then prepare a
full mandate while preserving both completed versions. They include company,
multiple-owner and trust authority, mixed physical/digital routes, actual public
React signing interactions and the physical-review confirmation. The Dual case
replaces a partially signed mandate, preserving its evidence and requiring all
new signatures. Guards cover stale saves and copies, incomplete
signatures, expired links, partial email failure, replacement links, review retries
and immutable signed evidence. Each downloaded page must contain visible content;
the final PDFs must include the actual drawn signatures and persisted agency logo.
The signature certificate uses the source template's A4 page class to avoid an
extra blank page between the reviewed document and its signature evidence.

This check also runs the disclosure, branding and profile-alignment regressions
and is included in `check:listing-seller-workspace`. PDFs, selected rendered pages
and a machine-readable report are written to `test-results/seller-document-journey/`.
Auth/session, email, Storage and transaction-promotion infrastructure are synthetic;
the actual Edge handler and canonical-save, upload, signing and review SQL run
locally. Human checks of wet-ink signatures, hosted UI, live delivery and the full
migration chain remain release acceptance steps. This check performs no remote
writes and grants no deployment approval.

For a focused rerun of the sequential flows, use
`node scripts/seller-document-journey.test.mjs --connected-only`.
Seller-portal physical uploads bind to the version currently open in the portal;
the service checks it again before Storage and the database checks it atomically.
The additive migration `20261004181626_seller_portal_signed_upload_version_binding.sql`
must be released before this portal upload code. Standalone historical uploads
retain the established upload path. Completed disclosure evidence from later
portal signing or physical review is recognised when preparing the mandate;
it is not inferred from an upload or onboarding submission alone.

New mandate, FICA and disclosure renders share the saved agency palette, with
readable heading colours even for a light palette. Approved HTML and its hash
stay unchanged when agency settings change; nested mandate terms are copied at
approval. Export validates and embeds configured image bytes in the temporary
PDF stage, rather than silently dropping logos or signatures. Old signed links
in the public `organisation-branding` bucket use public access; private document
and signature links retain their signed access. No data migration is needed.

Seller portal corrections regenerate the mandate, FICA and disclosure from a
local projection of the captured facts. The primary person's corrected name,
identity, contact and address reach each unsigned copy while co-owners, entity
identity, signing authority and invitation routing are retained. FICA is rebuilt
instead of reusing its stale model; captured declaration wording and other
untouched facts remain. Cleared fields stay cleared. Dual mandates expose the
second agency in the correction editor.
Run `npm run test:seller-document-corrections` for field/ownership regressions and
the real Edge correction handler against the existing correction SQL function in
an isolated PostgreSQL database. It checks complete-pack updates, rollback,
stale/expired links, signing locks and preservation of approved source/history.
This is included in `check:listing-seller-workspace` and makes no remote writes.
No new migration is required. The Edge Function and app changes need deployment
before taking effect. The correction check includes facts-bound reviewed versions
created by the current browser contract.

Browser preparation, browser verification and the signing Edge Function share
`computeSellerReviewedDocumentVersionDigest` in `sellerReviewedDocumentVersions.js`.
It binds the reviewed content, source draft, signer roster, mandate terms and any
captured-facts fingerprint into one SHA-256 version. Missing or empty facts
fingerprints retain the existing legacy hash format. A present fingerprint must
match; the server never falls back to a hash that ignores it. The saved index
must agree with both source fingerprints, the signer roster and the terms.
Run `npm run test:seller-reviewed-document-versions` for fixed hash vectors,
legacy/history preservation, and actual client preparation plus Edge issuance
and viewing with synthetic auth, local records and an in-memory email transport.
It also rejects tampering before any write. This check is included in
`check:listing-seller-workspace`. It does not send email or modify live records.
Existing approved versions and signature evidence need no migration or rehash.
A coordinated app/Edge release and live acceptance check are still required.

FICA-only preparation keeps an unchanged frozen mandate at its original version,
including copies without the newer facts fingerprint. Sole and Exclusive aliases
compare as the same legacy appointment without changing the stored terms or hash.
When available, the older saved signing snapshot supplies the facts comparison.
Records lacking that baseline remain candidates for manual historical review.
Full mandates compare their actual frozen inputs while ignoring a later pack's
preparation time. Changed parties, property, branding or agreed terms require a
separately reviewed replacement.

When renewing full mandate wording, retain the exact previously approved release
in `SELLER_MANDATE_WORDING_ARCHIVE`, including its variant, version, source and
approval evidence. Keep its agency approvals and the v1 reconstruction renderer.
Historical verification uses that trusted register; approval inside a saved copy
alone is insufficient. Existing requests may finish against their approved copy,
subject to the existing expiry/evidence guards. A new signing request requires the
current approved wording. Full-template labels with missing contract/capture
metadata are rejected rather than treated as legacy copies.
Unknown saved capture versions stay preserved and show
a notice requiring agent review rather than being converted to version 1.
The real wording register remains pending and its archive is empty.

Historical seller checks use `scripts/sql/seller-mvp-acceptance-audit.sql` in a
read-only transaction. The output contains listing/onboarding identifiers, reason
codes and preservation flags, with no names, document HTML or tokens. Canonical
conflicts and completed captures require agent review; unfinished capture remains
unfinished, rentals stay outside seller-sale scope, and frozen copies must be
preserved. No automatic repair is permitted. Run
`npm run test:seller-existing-record-audit` for actual PostgreSQL fixture checks;
it is also included in `check:listing-seller-workspace`. Migration comparison and
isolated clean replay commands are documented in
`../docs/database-release-runbook.md`.

The read-only audit includes legacy mandate copies, incomplete full-contract
metadata, unfamiliar capture versions and approved copies in version history.
These are preservation/review reasons, not automatic conversion instructions.
`npm run test:seller-document-journey` also checks the actual forward correction
against sent, partially signed and completed/reviewed full mandates, and tests
wording renewal against the real signing handler with synthetic approvals.

The same focused check validates the forward migration
`20261004121736_seller_document_review_runtime_reconciliation.sql`, prepared after
the live catalog showed missing review/reminder actions and review-queue objects
under historical versions with different recorded SQL. It restores those actions
and exact-requirement guards, keeps the current upload/signing functions, and
does not backfill historical records or start automatic reminders. The
[4 October migration review](../output/seller-document-migration-review-2026-10-04.html)
contains the 39-record review queue, catalog evidence and outstanding acceptance
checks. Live application requires a separately approved scoped release.

### Mandate capture and review schedules

Seller lead onboarding, the listing seller-information editor, and the listing
profile wizard use the same mandate editor. Sole/exclusive aliases display as
**Exclusive**. Open offers an agreed end date or an explicit appointment until
cancelled; Exclusive and Dual require a fixed period before preparation. Enter
`0` for no buyer-protection period. Blank protection and commission fields are
unfinished instructions, not defaults.

Use **Capture revised mandate schedules** to add contracting agency identities,
business and practitioner FFC evidence references, authorised representatives,
seller capacity/authority, exclusions and earlier introductions, marketing
commitments, approved expense limits, notices and annexures. Dual exposes both
agencies and an explicit allocation rule, shares and each portion's VAT treatment.
No allocation or proposed protection period is silently supplied. Certificate
references record supplied evidence; they do not certify verification.

These schedules are versioned JSON inside the existing onboarding form. Drafts
can be incomplete. Save/reopen preserves blank values, `None`, `Not applicable`,
zero protection days, inactive Dual fields and cleared end dates. Fresh signing
snapshots copy schedules by value; old frozen copies remain unchanged. New
schedules are review data until the revised layout and approved signing template
can include them. Preparation and the correction endpoint reject silently adding
them to the existing contract. Existing mandate corrections retain their legacy
path and now support indefinite Open appointments and valid calendar dates.

`npm run test:listing-seller-canonical-update` includes the capture requirements,
alias/clear preservation and actual lead-preparation actions. Run the editor
interaction checks with
`npx vitest run src/components/documents/__tests__/SellerMandateDetailsEditor.test.jsx src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx`.
`npm run test:seller-document-corrections` checks the endpoint/SQL correction
boundary. `npm run test:seller-document-journey` also saves and reopens the new
schedules through the existing canonical SQL before checking the existing FICA,
disclosure and mandate journeys. This capture change requires no schema migration
or remote write. The three proposed contracts and remaining work are recorded in
[the mandate decision record](docs/mandate-wording-review/decision-record.md).

## Appointment behaviour and failure baseline

[Appointment behaviour and acceptance rules](docs/appointment-behaviour-contract.md)
defines the calendar repair contract: lifecycle, ownership, access, timezones,
notifications, archive and consistency across agent screens. Unconfirmed bookings
hold a slot for 24 hours, ending earlier at the appointment start; expiry releases
the hold and leaves follow-up work. Phase 3 enforces this rule in the prepared local source and migration;
it has not been released to production. The contract maps all 42 audit scenarios to subsequent repairs.

The complaint-focused baseline exercises public application functions with local
storage and database fixtures, without live writes or email. From this package run:

```sh
TZ=UTC npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js --maxWorkers=1
TZ=Africa/Johannesburg npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js --maxWorkers=1
```

Phases 2–4 implement consistent times/statuses, atomic saves and reservations,
stable attendees and replacement approvals, and reconciled calendar/profile/dashboard
readers. Phase 5 saves invitation and reminder choices independently and commits
revision-bound jobs with each ordinary appointment. Browser closure no longer
interrupts delivery. The appointment editor supports type defaults or a
30-minute-only reminder and displays persisted queued/processing/provider accepted/
delivered/failed/superseded receipts. Viewing reminders use the new worker while
their dedicated invitations retain the viewing workflow.

Phase 6 adds explicit type/owner/link selection, safe drafts, shared agent actions,
reversible archive with history, and mobile creation, editing and own response.
Archived history cannot revive holds, RSVP tokens or delivery. Stale edits and
failed saves remain visible, with command identities retained for safe retries.
The calendar suite passes 274 checks in both UTC and SAST, alongside 121 attorney
checks and 11 independent local PostgreSQL concurrency checks.

Phase 7 adds a record-by-record historical report, fresh scoped snapshots,
opt-in reviewed repair plans, transaction previews, private before-state audit,
idempotent batches and guarded rollback. Corrections retire historical messages
without sending replacements, preserve original hold limits and reject changed
records. Past outcomes, ambiguous times and future conflicts need an agent's
explicit decision. The original 56-row inventory remains dated evidence and
cannot authorise writes. See the [operator workflow](docs/appointment-behaviour-contract.md#phase-7-reviewed-historical-reconciliation).
Verification passed 304 calendar checks in both UTC and SAST, 121 attorney
checks, 15 independent local PostgreSQL checks and six operator-tool checks.
Focused lint passed without errors or warnings. From this package, run the
offline report and focused checks with:

```sh
node scripts/reconcile-calendar-appointments.mjs report --input ../tmp/calendar-audit-20261008/appointment-inventory.json --as-of 2026-10-08T15:44:00Z --output ../tmp/calendar-review.md
node --test scripts/reconcile-calendar-appointments.test.mjs
TZ=UTC npx vitest run src/core/appointments/__tests__/appointmentReconciliation.test.js supabase-tests/calendarReconciliation.test.js --maxWorkers=1 --testTimeout=30000
```

Phase 8 adds personal Google/Outlook account connections, automatic managed
appointment copies, durable retries, per-agent sync receipts and outside-change
review on desktop and mobile. Arch9 edits and cancellations update the connected
copy. Outside edits/deletions require an agent decision: restore the Arch9 copy
or stop syncing it, then use normal appointment actions to change the booking.
Copies exclude attendees, client identities, private notes and provider reminders,
so Arch9's existing messages and booking approvals remain authoritative.
Phase 8 verification passed 386 calendar checks in both UTC and SAST, 121 attorney
checks, 21 independent PostgreSQL concurrency checks, both Edge authorization
checks, primary-app verification and the final production build.
Manual links are explicitly labelled as copies. Reconnecting uses the same provider
account; disconnecting leaves existing copies in the provider as manual copies.
External busy-time import, unrelated personal events, shared calendar selection,
provider webhooks and automatic acceptance of outside booking changes are outside
this phase. See [setup, local proof and live acceptance](docs/appointment-behaviour-contract.md#phase-8-connected-google-and-outlook-copies).

Phase 9 adds one repeatable acceptance runner for all 42 original scenarios,
UTC/SAST regressions, attorney compatibility, independent PostgreSQL concurrency,
Edge authorization and primary-app verification. Joined mobile → service → SQL →
worker journeys also repaired temporary attendee IDs being treated as existing
records when creating or editing appointments. Run from this package:

```sh
CALENDAR_LOCAL_PG_SOCKET=/absolute/path/to/calendar-phase3-local/socket node scripts/check-calendar-acceptance.mjs --output ../tmp/calendar-acceptance-<unique-run>
```

Use the isolated local PostgreSQL fixture and `deno` on PATH. The runner writes
fresh logs and scenario evidence, rejects skipped/missing tests and changed source,
and leaves all hosted delivery/provider/browser/agent-pilot gates pending.
See the [controlled release and recovery steps](docs/appointment-behaviour-contract.md#phase-9--joined-acceptance-and-controlled-release).
No live deployment, email or provider acceptance is implied by local passes.

Phase 10 adds scoped calendar health on desktop and mobile, a five-minute
read-only database monitor and appointment support details. Permitted agents and
managers can inspect saved revisions, responses, change history and delivery
receipts, record a reason for an eligible retry, or reconcile missing future
reminder work. Recovery preserves the original hold and delivery identity and
cannot recreate old invitations or resend accepted messages. Provider account
recovery continues through the existing connected-calendar controls. The same
acceptance runner now includes monitoring, permissions, support UI, joined worker
recovery and independent support/cancellation races. See the
[monitoring and support rules](docs/appointment-behaviour-contract.md#phase-10--operational-monitoring-and-support).
Prepared migrations and the scheduled monitor still require an approved release.

All 21 complaint baseline cases are now ordinary regressions; no expected failures
remain. The existing attorney suite is
`npx vitest run --config vitest.attorney-calendar.config.js --maxWorkers=1`.
The [behaviour contract](docs/appointment-behaviour-contract.md) records the SQL,
worker, component, timezone and independent local PostgreSQL concurrency checks,
including controlled provider and signature-verified webhook fixtures.

Release requires the prepared migrations in order:
`20261008163445_appointment_end_instant.sql`,
`20261008164958_calendar_atomic_reservations.sql`,
`20261008184511_calendar_durable_notifications.sql`,
`20261008184859_calendar_delivery_worker_schedule.sql`,
`20261008193925_calendar_agent_archive_workflow.sql`, then
`20261008202747_calendar_historical_reconciliation.sql`,
`20261008205719_calendar_connected_provider_sync.sql`, then
`20261008210940_calendar_provider_worker_schedule.sql`.
Deploy the new calendar delivery worker, updated Resend webhook and send-email function, verify Vault
and `ARCH9_APP_URL`, and complete the controlled live appointment/reminder journey.
The attorney and viewing workers also need verified deployment. No migrations,
deployment, live records or real email delivery were changed by these local phases.
Applying the Phase 7 migration repairs no data. Reviewed historical writes still require
explicit approval. Phase 8 additionally requires OAuth app registration, server-only
provider/encryption secrets, deployment of both provider functions, and controlled
Google/Outlook acceptance. No real provider accounts have been connected or changed
by the local implementation.

## Attorney calendar saving

The Attorney calendar loads appointments for authorised matters across their
agency/developer organisations, plus matterless events owned by the firm.
New invites use the selected matter's organisation. The appointment, recipients,
RSVP tokens, notification preference and delivery jobs save together in one database
transaction. A confirmed save releases the controls without waiting for email or
refresh. Turning **Send notifications** off persists through later edits and skips
email, portal notifications and reminders; calendar attachments are a separate option.

Saved rows appear immediately. Background reconciliation preserves the calendar
view, date, filters and open appointment; focus, reconnection and the existing
Attorney refresh hook's visible polling recover changes from other workspaces.
Stale reads cannot replace newer snapshots. Schema mismatches reject the save
instead of silently discarding workflow links or location details. A failed recipient
write rolls back the whole save, including its queued communications.

Calendar day/week/month calculations, displayed times and date filters use SAST,
even when the browser is in another timezone. Cards use the saved end time and
separate overlapping appointments into columns. The calendar includes completed,
cancelled and declined history, with separate filters; active workload totals exclude
closed bookings. Month navigation uses calendar months, the mini-picker includes all
six weeks, and readiness uses saved document/matter evidence rather than an empty
preparation checklist.

Delivery feedback reloads from saved jobs. The service-only
`attorney-appointment-delivery-worker` dispatches invitations, changes, cancellations,
confirmation and reminders through the existing email service. A one-minute cron
schedule uses the platform's Vault credentials. Leased jobs retry after interruption
with bounded backoff, stable provider keys and frozen private email payloads; replaced revisions and closed or
declined recipients do not receive old reminders. Explicit resends reuse pending
work, retry failed work, or create one new job after a recorded send. In-app receipts
and portal messages persist independently of the browser and preserve read state.
ICS attachments retain the appointment UID, advance SEQUENCE on calendar changes,
use the saved SAST duration and CANCEL semantics, and fold Unicode lines correctly.
This provides calendar attachments, without two-way Google/Outlook synchronisation.

Appointment details support editing the time, assigning or clearing a scheduling
owner, assigning a boardroom, completing and cancelling. The owner is saved with
their profile identity and email, separately from the matter attorney. Room choices
include the selected matter's organisation and the assigned firm's backing
organisation; firm IDs are not used as organisation IDs. Time changes request fresh
client confirmation and close old reschedule requests/reminders. Cancellation
keeps the record, reason and actor and revokes old RSVP links. Closed appointments
cannot be edited, and stale saves must refresh first. Database checks reject
overlapping people or rooms across organisations without exposing hidden booking
details; shared room saves use a short transaction lock to prevent double booking.
Room changes also update the physical venue used in communications. Edits replace
old reminder jobs, while a database guard prevents late legacy scheduling from
recreating reminders for closed appointments.

Local changes require the append-only migrations
`20261003201121_attorney_appointment_management.sql`,
`20261003204422_attorney_calendar_durable_delivery.sql` and
`20261003204821_attorney_calendar_delivery_worker_schedule.sql`. The two new delivery
migrations and worker have not been applied/deployed remotely. Release must deploy
both the delivery worker and updated `send-email` function, apply the migrations,
and verify `ARCH9_APP_URL` plus Vault's `arch9_project_url` and
`arch9_service_role_key` match the target environment. Provider delivery and
Google/Outlook import acceptance still require an authorised live smoke check.

Worker HTTP/authorization check: from the repository root run
`deno test --allow-env supabase/functions/attorney-appointment-delivery-worker/index.test.ts`
(the test stubs database calls and sends no email).

Focused checks: `npm run test:attorney-calendar-invite` (local contract, service,
component and page checks); use `npm run check:app` from the repository root for
the app baseline. Browser checks use fixture services and do not send emails or
write live bookings.

Client portal and public RSVP responses share one database writer. It verifies
buyer invitation identity or the seller's current secure session, saves the
participant response and any proposed time together, and confirms a booking only
when every required attendee has accepted. Optional attendees do not block it.
Retries reuse a saved command receipt; a lost acknowledgement cannot duplicate
requests or overwrite a later choice. A stale booking time requires a refresh. Listing viewings retain their existing
buyer/seller/agent proposal rounds and dedicated notification handling, including
new invitations after a counterproposal; portal responses use that same writer.

Appointment, participant and reschedule-request changes advance the existing
matter refresh watermark used by professional and client workspaces. Matching
local responses also refresh an open matter immediately. Late older workspace
reads preserve the newer appointment responses. Portals continue to use
scoped polling and recover through focus/reconnection. Appointment displays and
reschedule drafts use SAST, including older date/clock records. Private bookings
remain private and the notifications-off choice is preserved. Managed attorney
responses use the durable delivery queue; older appointments retain their existing
delivery adapter after the save, without making acknowledgement wait for email.

These response changes also require the append-only local migration
`20261004110204_attorney_cross_role_appointment_responses.sql`. It has not been
applied remotely. The established RSVP check now executes this migration and the
existing calendar management/delivery migrations in an isolated database, covering
rollback, replay, required attendees, separate party proposals and portal scope.
Run `node scripts/attorney-calendar-phase4-rsvp.test.mjs` without `--live` for this
check. A live cross-role transaction and provider delivery remain release checks.

## Attorney document persistence

Attorney matter uploads save the file record, exact request/requirement links,
activity and refresh signals together through `bridge_save_attorney_document`.
Requests and reviews use authenticated retry receipts; repeated submissions reuse
the saved action. Upload notes, participant identity, lane and visibility survive
reloads. New replacements reopen canonical review, and stale files cannot approve
new evidence. Save controls release before background refreshes or temporary
download URLs are resolved. Transport failures retain the storage object until
the saved outcome can be confirmed; definite database rejection allows cleanup.

Apply `supabase/migrations/20261003173649_attorney_document_persistence.sql` before
releasing the frontend. Missing RPCs fail explicitly rather than falling back to
browser-owned linking. Notification delivery and legacy workflow reporting retain
their existing integrations; the canonical document save does not depend on them.
Release and database application require separate authorization and live checks.

Focused checks from this package: `node --test scripts/attorney-document-persistence.test.mjs`
and `node --test scripts/shared-matter-journey-live-refresh.test.mjs scripts/atomic-buyer-portal-document-upload.test.mjs`.

The Attorney document request view tracks waiting files, review, corrections and
completion. Requesters select an exact checklist requirement or an additional
supporting document; an open request disables another request for that instance.
The requirement fixes its recipient. Only the exact received file can be reviewed;
additional-file approval completes its request without completing a legal task.
Correction reasons persist on the request, and replacement returns it for review.
Requested uploads retain their client recipient; professional-only requests use
the existing Storage policy's professional audience instead of client sharing.
The new request review RPC requires
`supabase/migrations/20261003180814_attorney_document_request_review.sql` after the
persistence migration. Both migrations and the frontend need a coordinated release.

UI/model checks: `node --test src/services/documents/__tests__/attorneyDocumentRequestModel.test.js`
and `npx vitest run src/components/attorney/operations/__tests__/AttorneyDocumentRequests.test.jsx`.

Attorney drafting uses external Word or firm templates and private uploads. The
Documents view now retains working drafts, ready-for-signature copies, signed
copies and supporting-evidence revisions in one numbered history. Each revision
keeps its exact matter, attorney lane, requirement, request and participant.
Unsigned copies stay internal and cannot supply checklist or requested evidence;
an accepted signed copy remains current while a new draft is prepared. Changed
signed evidence returns to review, with earlier approvals and files retained.
The generator, template workspace and packet signing remain retired.

`bridge_save_attorney_document_version` wraps the existing atomic save and records
version identity before success. Repeated saves recover the same version; a stale
predecessor rejects another branch. Historical files and metadata cannot be
overwritten or deleted through the document table. Existing ordinary uploads join
the history as version 1 only when an attorney explicitly replaces them. Browser
controls release before background refresh, and the saved version appears locally
from the confirmed response. No existing files are copied or backfilled on release.

Apply `supabase/migrations/20261003183115_attorney_document_versions.sql` after the
two attorney document migrations above, then release the frontend and verify a
logged-in matter through draft, signed upload, review, replacement and reopen.
This local implementation does not apply migrations or release the application.
Focused checks include the persistence check above,
`node --test src/services/documents/__tests__/attorneyDocumentVersionModel.test.js`,
and `npx vitest run src/components/attorney/operations/__tests__/AttorneyDocumentVersions.test.jsx`.

Private documents and legal notes follow the responsible firm and its allocated
matter team. Explicit delegations grant only their selected capabilities and
expire with the delegation. New records retain their owning firm across appointment
changes; historical records with ambiguous ownership remain author-only. Shared
documents and client recipients keep their existing audiences. Stored files,
activity, audit events, document retries and replacements enforce the same boundary.
Private FICA tasks have no client wording in the canonical catalogue.

Apply `supabase/migrations/20261004102741_attorney_internal_workspace_boundaries.sql`
after the document and conveyancing corrections, then verify distinct attorney
firms and client sessions in a live matter. This implementation is local and does
not apply the migration or release the application. The existing permission check
now covers private access: `node --test scripts/attorney-workbench-permission-contract.test.mjs`.

Attorney coordination summaries read the saved shared journey for every required
lane, even when the viewer can open only their own Work page. A completed handoff
is ready; reopening it withdraws readiness on refresh. The active plan and explicit
not-applicable outcomes exclude unnecessary dependencies. Missing progress or an
unconfirmed assignment remains visible instead of being reported as clear. An
assignment hidden by access rules is unconfirmed rather than assumed missing. Other
firms' notes, files and editing controls stay outside the summary.

Focused coordination checks: `node scripts/attorney-workflow-scoped-load.test.mjs`
and `node src/services/__tests__/phase6OutcomeConsistency.test.js`. This frontend change uses
the existing professional journey reader and requires no new database migration.

## Attorney conveyancing reviews

The existing transfer, bond and cancellation stages remain. Agreement review now
records applicable conditions, payment dates, owners and supporting decisions.
Cancellation allocation records each registered bond and linked loan account,
including paid-up registered security; settlement records match those accounts.
Seller signatures may be recorded as not applicable only after a saved lender /
instrument decision; bondholder consent remains required. Changed review records
withdraw unlodged readiness, and replacement of a linked agreement reopens its
substantive review. Reopen a completed review task to correct its saved records.

FICA reviews prompt for each party's firm RMCP review and internal reference;
findings stay inside the attorney firm. Existing capacity prompts include the
applicable guardianship, marital, entity distress/disposal and trustee decisions.
Electrical non-applicability requires an attorney decision and completed property
review; unknown applicability continues to require proof. Water compliance remains
municipality / contract dependent; the document resolver uses the saved property
municipality from the linked listing when available. Withholding review can record reserved funds,
owner, payment event and a future remittance deadline; actual withholding uses
the purchaser's residence and reviewed period. Due remittance and final-account
closure need payment proof. The separate SARS transfer-tax receipt stays required.

Registration communication may use portal updates or a recorded external channel,
date, recipients and evidence reference. Saving this evidence does not send a
message. Clearance dates use the same SAST calendar and conservative **usable
before** cutoff in the screen and database; this change does not decide a registry's
inclusive expiry interpretation. Municipal issue windows remain distinct from
body-corporate / HOA issuer conditions.

Release the frontend together with
`supabase/migrations/20261003185915_attorney_conveyancing_review_corrections.sql`,
after the three document migrations above. Existing unlodged matters need their
new review records completed before readiness can be confirmed. No historical
task outcomes or documents are deleted. Focused checks: `npm run check:attorney-conveyancing`,
`node scripts/verify-attorney-cancellation-lane-phase9.mjs`, and
`npx vitest run src/components/attorney/workflow/__tests__/TaskConfirmations.test.jsx`.
The local municipality and electrical fact cases use the existing
`node scripts/transaction-canonical-document-engine.test.mjs` check.
The readiness check executes the new migration in a local database and walks
through registration, settlement and closure, with negative applicability and
timing cases. Local fixtures do not establish a percentage of real matters covered:
logged-in release checks, practising conveyancer review and the representative
matter cohort described in `docs/attorney-conveyancing-process-audit-2026-10-03.md`
remain necessary before claiming the 95% target.

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

Seller conflict corrections (8 October 2026): an explicit owner-type edit now
resolves signing authority from the edited form and saves matching listing and
onboarding facts. Cleared owner lists, co-owner notes and nested estate,
representative and other-entity details are included in the database merge.
The history warning reloads after a saved listing revision and ignores older
responses that arrive after that revision. Actual source disagreements continue
to require owner review; contact-only edits retain the existing ownership model.

Apply `20261008154845_seller_history_compatible_entity_shapes.sql` during an
approved release to correct false audit conflicts for CC/foreign company/trust
profiles and the coarse legacy individual type used for married and represented
sellers. It changes comparisons only, preserves permissions and rewrites no
seller history or signed documents. The app and database corrections have been
checked locally; existing live disagreements are not automatically repaired.
Focused checks: `node --test scripts/listing-seller-historical-normalization-phase9.test.mjs`
(includes capture → canonical save → SQL audit across all twelve owner routes),
the canonical-save/profile-capture/onboarding-facts checks, and
`npx vitest run src/components/listings/__tests__/ListingSellerHistoricalNormalizationBanner.test.jsx`.

Seller upload and FICA request corrections (8 October 2026): internal
`manual_mandate_evidence` selected during listing intake now saves as a private
attachment without requiring or borrowing the signed-mandate checklist item.
It retains its original document type and does not complete a mandate request.
Explicit seller requirement uploads still require an exact checklist match.
Document-centre FICA requests retain the persisted requirement key, participant,
request revision, dedupe identity and existing review metadata when using a
projected display row. This prevents display aliases from changing request
identity or routing a co-owner's request to the primary seller.

Run `node --test scripts/document-generator-retirement.test.mjs
src/services/listings/__tests__/listingSellerDocumentCollaborationService.test.js`
and `npm run test:document-trust-phase1` for the focused regressions. These use
local service boundaries and isolated PostgreSQL; hosted Storage, permission
and email-delivery acceptance remain unverified. The permanent-link upload
correction requires the approved release of
`20261008154013_seller_portal_upload_token_resolution.sql`; the intake and FICA
request changes require an app release. No remote writes or client messages
are performed by these checks.

Ownership corrections (8 October 2026): Seller and Documents now expose
**Change ownership details**. The editor can correct the legal owner, entity
type, co-owners and signing authority. Switching owner types clears the previous
type's fields after confirmation and seeds two owner cards for multiple owners.
Saving uses the canonical seller update and always refreshes the checklist,
including when retrying an unchanged saved correction. New applicable requests
are issued and obsolete requests are retired; existing uploads and signed
documents remain in the file. Controls stay disabled while saving.

If the ownership save commits but the checklist schema or request issuance
fails, the editor stays open with a visible error and retry instructions. It
does not show projected requests as successfully saved. Focused regressions:
`node scripts/listing-seller-profile-capture-phase2.test.mjs` and
`npx vitest run src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx
src/services/__tests__/privateListingService.sellerAccess.test.js`. These exercise
the actual editor handlers and local PostgreSQL checklist persistence; this UI
change still requires an approved app release and hosted acceptance.

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

The dashboard's Active Mandates total counts one per current rental listing,
including saved drafts, within its organisation, branch and agent filters. Previous
listings are excluded. Selecting the card opens Listings. This count updates on
dashboard load and does not require a separate management-mandate record. The
append-only migration `20261007154210_rental_dashboard_listing_mandate_count.sql`
must be applied before releasing the matching dashboard copy. Focused local check:
`npx vitest run server/tests/rentalDashboardMandates.test.js --maxWorkers=1`.

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

## Home Seekers standalone website hosting

The Home Seekers public website belongs to the primary Vite product. Its separate
Vercel project is `home-seekers-website`
(`prj_uxIQ3zvHt7AM0iKSBXLa9ezBh5MA`), with the existing production alias
`home-seekers-website-alpha.vercel.app`. Kingdom remains in `apps/websites` and
has a separate release.

From this package, run `npm run build:home-seekers-website`. This builds the
current frontend and packages the existing `/api/home-seekers/site`, `/leads`,
`/analytics` and `/applications` handlers with their dependencies as Node.js 24
functions. The output is isolated in `.vercel/home-seekers-website/.vercel/output`
and its project link is fixed to Home Seekers. It does not alter the main app's
Vercel link, deploy anything, copy environment files, include other CRM APIs or
include scheduled jobs. Generate this artifact from the approved release source;
do not copy a previous `dist` directory into a static-only deployment.

The frontend now has a dedicated public entry (`home-seekers.html` and
`src/homeSeekersMain.jsx`), containing only Home Seekers routes. It preserves the
existing page links and aliases without importing the private app, CRM pages or
staff authentication. The builder disables dotenv loading for this public entry
and the functions; any approved optional campaign settings must be provided
explicitly as build environment variables. No database credentials are required
for the frontend build.

Hosted Vercel **Preview** deployments (`VERCEL_ENV=preview`) expose the labelled
signup walkthrough and block signup, verification, applicant sessions, draft
saves, submissions, enquiries, legacy applications and analytics writes before
database or Auth access. This safeguard also applies if credentials were
accidentally configured for Preview. Production still requires the setup below;
preview completion is not evidence of CRM capture or email delivery.

The 7 October recruitment signup release evidence is in
[`docs/recruitment-signup-release-2026-10-07.json`](../docs/recruitment-signup-release-2026-10-07.json).
It records the exact four pending signup migrations and their hashes, the
production project and previous website deployment, the reviewed artifact
inventory, local checks and hosted preview. Its status remains **production
pending**: no database migration, production promotion, intake link creation or
email delivery has occurred. The matching CRM display changes must be released
from approved source, after the migrations; do not upload this entire active
checkout. Before production approval, review that packet's remaining intake,
email and CRM requirements. Recheck live configuration immediately before release.

The Home Seekers Vercel **Production** environment needs server-only
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`WEBSITES_LEAD_FINGERPRINT_SECRET` (at least 32 characters). The URL and service
key must refer to Arch9 production (`isdowlnollckzvltkasn`), and the active
Home Seekers website/domain records remain the tenant boundary. Credentials
are read at function runtime, never embedded in the build. Preview deployments
must not inherit production database credentials. Publishing real listings and
testing real lead delivery are separate authorised tasks.

After explicit production release approval, deploy the reviewed artifact from
this package with
`VERCEL_PROJECT_ID=prj_uxIQ3zvHt7AM0iKSBXLa9ezBh5MA VERCEL_ORG_ID=team_ezJ5RCE7qwTf14fw215IhPs5 vercel deploy --prebuilt --prod --cwd .vercel/home-seekers-website`.
The root redirects to `/demo/homeseekers`; real files and functions resolve before
the public page fallback. Unknown API paths return JSON 404 responses. Verify
the standalone `/api/home-seekers/site` returns JSON and `/api/home-seekers/leads`
rejects GET with JSON 405, then check the Home Seekers pages load. These checks
do not submit a lead, publish a listing or send email. Confirm the project and
retain its previous production deployment for rollback before promoting.

Focused local verification:
`node --test server/tests/homeSeekersWebsiteDeployment.test.js server/tests/homeSeekersWebsiteBridge.test.js server/tests/homeSeekersRecruitment.test.js`.
The deployment check executes the bundled handlers against a loopback CRM
fixture, including standalone/custom-host enquiry validation, tenant scope,
unknown API paths, missing configuration and credential isolation. It makes no
remote writes.

### Home Seekers CRM listings

The home, Buying and Renting pages use the approved CRM website publication
snapshots. The featured section has no sample fallback: loading, an unavailable
feed and no published stock each have an explicit visitor message. An empty feed
offers contact with the team instead of invented listings. The public feed
rechecks the organisation and canonical Published status on every request.

In the CRM's Agency Website channel, Publish and Update prepare the current
listing details and durable media before synchronising the website snapshot.
An ordinary CRM edit remains unpublished until Update is used. Unpublish removes
the home from the public feed while keeping its CRM record. Sales and rentals
open `/demo/homeseekers/properties/<listing-id>`; existing Buying detail links
continue to work. Home Seekers links use the standalone Vercel alias instead of
the original platform preview hostname, and follow the active custom hostname
returned by the CRM after domain connection. Other agencies retain their routes.

Area sections and navigation are hidden for launch; `/demo/homeseekers/areas`
returns to the homepage. The deferred area components and content remain in
source for a later, separately scoped implementation.

Focused listing checks from this package:
`npx vitest run src/pages/__tests__/HomeSeekersListings.test.jsx
src/components/listings/__tests__/HomeSeekersWebsitePublication.test.jsx
src/components/listings/__tests__/RentalWebsiteChannels.test.jsx` and
`node --test server/tests/homeSeekersWebsiteBridge.test.js
src/services/listings/__tests__/listingMarketingChannelPresentation.test.js`.
These use local fixtures, including publication/update/withdrawal visibility,
tenant isolation, sales/rental detail pages and the absence of sample stock.
No migration or remote listing publication is performed. Rebuild the standalone
package after frontend changes; the main CRM needs its own approved frontend
release for the corrected publication links to reach agents.

### Home Seekers website enquiries

Homepage and Contact enquiries carry Buy, Sell, Rent or Other intent. Buying
and Renting enquiries default to their page's intent; valuations are seller
enquiries, and property enquiries retain the published CRM listing ID. The
existing CRM ingestion creates the contact, lead and notifications atomically,
classifies rentals for the rental workspace, assigns a property enquiry to its
active listing agent and leaves general enquiries awaiting assignment. Existing
principal alerts and the Home Seekers seller email recipient remain in force.

Every form joins overlapping submissions and keeps the same key after an
uncertain network/server failure. An unchanged retry therefore confirms the
original lead instead of creating another one. Definitive rejections or edited
details start a new attempt. Forms retain the visitor's answers on failure,
time out after 20 seconds and show success only after explicit CRM acceptance.
The API limits bodies to 16 KiB, validates consent and contact details, checks
published pages/listings and applies the existing five-per-hour fingerprint
limit across the site's aliases. Internal lead/notification IDs stay private.

An accepted lead immediately hands its queued notification to the existing
durable dispatcher. Notification delivery failure does not undo CRM acceptance.
Pending migration `20261004104401_home_seekers_lead_notification_queue.sql`
replaces the seller-only cron with a Home Seekers enquiry retry job, covering
all intents. It preserves dispatcher claims, provider idempotency, attempt limits
and retry backoff; it excludes other organisations and orphaned receipts.
Apply only this reviewed migration through the database release guard after
explicit release approval, deploy the updated `website-lead-dispatcher` Edge
Function, then release the standalone website artifact. Targeted dispatcher
calls leave other agencies' stale claims untouched; the Home Seekers worker
recovers its own interrupted claims.
Neither builds nor these tests apply migrations, send email or deploy anything.

Focused checks from this package:
`node --test server/tests/homeSeekersLeads.test.js
server/tests/homeSeekersWebsiteDeployment.test.js
server/tests/homeSeekersWebsiteBridge.test.js
server/tests/homeSeekersRecruitment.test.js` and
`npx vitest run src/pages/__tests__/HomeSeekersLeadForms.test.jsx
src/pages/__tests__/HomeSeekersListings.test.jsx`.
The lead check executes the actual ingestion/classification/dispatch SQL in
isolated Postgres with local fixtures. Controlled deployed CRM and email
acceptance still requires an explicitly authorised release and live submission.

From the repository root, the dispatcher's HTTP and payload checks are
`deno test --config supabase/functions/website-lead-dispatcher/deno.json
--allow-env --allow-net=127.0.0.1
supabase/functions/website-lead-dispatcher/index.test.ts
supabase/functions/_shared/websiteLeadDispatch.test.ts`.
They exercise the real handler against a loopback database fixture; no email is
sent. Local browser acceptance covered a committed lead with a lost response,
an unchanged retry producing one lead, a rental property viewing, Contact rental
intent and a mobile valuation. Live inbox delivery remains a release check.

## Home Seekers recruitment applications

`/demo/homeseekers/join` submits to `/api/home-seekers/applications`.
The pending `home_seekers_recruitment_intake` migration stores applications
separately from property leads, routes a bell notification with the application
details to the active principal (administrator fallback), and counts accepted
applications atomically. It does not send email. Recipient access requires
continued active principal/admin membership. The migration is not applied by a
build or test; release requires the database guard and explicit approval.

The endpoint uses the existing server-only Supabase connection and
`WEBSITES_LEAD_FINGERPRINT_SECRET` (at least 32 characters). It validates the
Join Us page and required fields, limits requests to 16 KiB and five applications
per fingerprint per hour, and preserves one idempotency key across unchanged
retries. A failed submission keeps the applicant’s answers. Local Vite previews
return an explicit unavailable response and never write live applications or
analytics; browser success checks must use a mocked response.

Optional campaign configuration: `VITE_HOME_SEEKERS_GOOGLE_ANALYTICS_ID` and
`VITE_HOME_SEEKERS_META_PIXEL_ID`. No IDs are configured by this change. Scripts
load only after the visitor opts into campaign measurement. Application and
guarantee events contain no application answers or contact details. First-party
application conversions are recorded only by successful database capture; client
requests cannot manufacture that event. Guarantee clicks have a separate event.
The PPRA event is reserved; no letter link or section appears until an approved
PDF is supplied.

Pricing assumptions live in `src/pages/homeSeekersRecruitment.js`. The agent
overview supplied on 8 October 2026 replaces the September offer: R10,000/month
paid from registered deals (solo only, up to 50% of each deal towards the accrued
balance), R9,000/month by debit order, or R100,000/year upfront. All exclude VAT
and add R1,500 per registered sale, with no commission-sharing threshold. The
Join Us page also reflects the overview's team rates, R750 referral payments
capped at twelve, rental charges and five-sales-or-R6-million production guidance.
The comparison uses ten R1.5m sales at 5% commission and option 2; competitor
figures are illustrations from the supplied overview, not verified quotations.
This updates public offering information, not billing or applicant eligibility
enforcement. The brand font and PPRA letter remain unverified launch inputs.

Focused verification (from this package):
`node --test server/tests/homeSeekersRecruitment.test.js server/tests/homeSeekersWebsiteBridge.test.js`.
The recruitment test executes the new migration in isolated PGlite with fixture
dependencies; it checks application capture, notification, atomic conversions,
idempotency, rate limits, recipient isolation, privileged RPC access, input
validation and pricing. It does not verify a deployed database or email delivery.

### Join Us local acceptance — 3 October 2026

The primary app’s recruitment page passed eight focused tests, focused ESLint,
production build and browser checks. Checked widths: 320, 390, 768 and 1440 px,
with no horizontal overflow. Keyboard checks confirmed menu focus containment,
Escape/return focus, scroll restoration and FAQ activation. Apply links reach
the form; its sticky button disappears while the application section is visible.
The guarantee link reaches the existing guarantee section. Browser checks found
no page errors. The form now has a fieldset legend and a 20-second timeout;
answers and the retry key are retained when delivery fails.

The hero reuses the existing brand photograph as a local 124 KiB AVIF, with
intrinsic dimensions and high fetch priority. The browser title/description now
identify agent recruitment; these client updates do not provide server-rendered
social metadata. No new font was invented or installed.

Production-preview timings on an unthrottled local Chromium browser:
initial run load 688 ms / FCP and LCP 2,132 ms; confirmation with other test
browsers closed load 636 ms / FCP 692 ms / LCP 796 ms. The confirmation meets the
two-second target locally; the slower run demonstrates variability. These are
local observations, not a guarantee for mobile networks or deployed hosting.
Real-device/deployed performance remains a release acceptance check.

Launch is pending: approved brand font and trademark artwork, confirmation of
VAT and the R10 million threshold, evidenced competitor terms and commercial
legal review, the itemised transaction-fee breakdown, and tracking IDs before
paid traffic. The PPRA section remains omitted until the approved letter exists.
The response-time promise needs an accountable reviewer. The database migration
and API deployment remain unapplied; controlled live application, notification
and analytics acceptance must follow an explicitly authorised release. No live
applications, migrations, emails or deployments were performed for this review.

## Organisation handoff register

The agent buyer workspace shows a persisted handoff per matter and partner lane.
Organisation nomination, onboarding/signed-OTP readiness, invitation status,
delivery evidence and organisation receipt are separate. Missing destinations,
competing destinations, expired/declined invitations and accepted invitations
without an organisation link appear as actions. Consultant and branch allocation
remain separate from this organisation-level register.

Source changes reconcile in the same database transaction; existing matters are
backfilled by `20261004074909_transaction_handoff_register.sql`. Matter-access
policies protect reads, and clients cannot edit handoff states directly. Bearer
tokens are excluded. A nomination or signup acceptance never implies instruction
delivery or organisation receipt. Confirmed firm acceptance and explicit bond
intake acceptance are recognised; legacy delivery starts as unconfirmed.

Run `npm run test:transaction-handoff-register` in this package. The tests execute
the migration in a local PostgreSQL engine and exercise the read service and UI.
The migration has not been applied remotely. This first pass adds visibility and
persistence; durable dispatch/retries, external-partner signup repair, stale
assignment cleanup and recovery queues belong to the following passes.

### Durable handoff dispatch

Phase 2 persists organisation dispatch jobs when the source facts make an
instruction ready. The service worker prepares the attorney firm matter or bond
originator intake, partner assignment, organisation inbox notification and buyer
journey event together. Email work is then persisted per recipient, independently
from matter preparation. A firm preparation failure does not stop the bond lane.
Existing accepted assignments and bank applications retain their state; competing
domain destinations require review instead of being overwritten.

Organisation company email is the first delivery destination. Without one, active
organisation administrators/firm leads at organisation scope receive the notice.
Named consultant or branch routing is not assigned by this worker. Missing firm
links or contacts remain visible, with bounded background retries. External
partners wait for signup and an organisation binding before formal dispatch.

Each job has a lease and attempt history. Interrupted work is reclaimed; successful
recipients are skipped on retries. Provider requests keep the same frozen sender,
recipient, content and idempotency key. Eight failed/interrupted attempts stop for
review. Uncertain sends older than 23 hours also stop for review, before the
[provider's 24-hour deduplication window](https://resend.com/changelog/idempotency-keys)
expires. Provider acceptance and organisation acceptance remain separate.
Controlled test recipients never reach the provider. The agent panel refreshes
pending work every 30 seconds while visible and refreshes on window focus.

Previously ready matters are held with `historical_delivery_review_required`.
Installing the migration does not replay historical emails. Later recovery work
will provide the explicit review/release flow. The legacy browser handoff and
formal attorney email paths defer to the organisation worker after migration;
other notifications retain their existing paths.

Checks from this package: `npm run test:transaction-handoff-dispatch`.
Worker/transport checks from the repository root:
`deno test --allow-env --config supabase/functions/send-email/deno.json supabase/functions/_shared/transactionHandoffDelivery.test.ts supabase/functions/transaction-handoff-dispatch-worker/index.test.ts supabase/functions/send-email/services/transactionHandoffDispatch.test.ts`.
These tests use local database/provider fixtures and send no live communications.

Release prerequisites: the Phase 1 register migration, then
`20261004080223_transaction_handoff_durable_dispatch.sql` and
`20261004080224_transaction_handoff_dispatch_schedule.sql`. Deploy the new
`transaction-handoff-dispatch-worker`, updated `send-email` guards, and primary
app before enabling the database schedule. The guards retain the previous path
while the dispatch RPC is absent. Verify the target's `ARCH9_APP_URL`,
`ARCH9_RESEND_FROM_EMAIL` (or `RESEND_FROM_EMAIL`), `RESEND_API_KEY`, and Vault's
`arch9_project_url`/`arch9_service_role_key` configuration. The schedule invokes
service-only claims every minute. Verify a new authorised instruction, its native
intake/matter, inbox/journey records, provider receipt and pending organisation
acceptance after release. No migrations, worker deployments or live email tests
have been performed for this local implementation.

### External partner signup and matter connection

Phase 3 routes attorney and bond partner invitations through organisation
connection, including existing canonical `/invite/` links and legacy
`/transaction-invite/` links. The preview shows the inviting organisation,
invited company and role; buyer details and documents remain unavailable before
connection. Partners can sign in, create an account, verify their email and use
the existing organisation setup. The invitation reference survives in the saved
signup intent, allowing continuation on another device. It is cleared only after
the matter connection commits.

Acceptance requires the verified invited email and active management authority
at organisation scope in a matching bond business or linked attorney firm.
Eligible workspaces are listed explicitly; multiple matches require a choice.
Consultant/branch membership cannot bind the organisation. A changed nomination,
closed matter, expired/declined/revoked link or conflicting destination stops the
connection. Generic canonical acceptance cannot consume an unbound handoff.

The invitation binding, reusable partner relationship, participant, roleplayer,
matter access and Phase 2 dispatch intent commit together. Existing accepted but
unbound invitations can be completed by their original recipient. Repeating a
successful connection reuses the records and dispatch generation. Consumed legacy
links have a private digest for recipient-only resumption after a lost response.
Signup and connection never confirm instruction delivery or firm acceptance;
signed-OTP/readiness gates still control native matter/intake preparation.

Run `npm run test:transaction-partner-invite-org-connection` for the existing
contract, executable database rollback/access/routing tests and signup UI/service
checks. `npm run test:transaction-handoff-dispatch` verifies the previous phases
remain sound. Local fixtures send no live communications. The database fixture
executes the existing acceptance/reconciliation and canonical sync functions as
well as the new migration; it does not simulate a deployed Auth email callback.

Release requires `20261004082510_transaction_partner_handoff_signup_binding.sql`
after Phases 1 and 2, plus the primary app changes. Verify new attorney and bond
signups, email confirmation on another device, organisation setup, explicit
connection and subsequent worker preparation in the authorised target. This
implementation has not applied remote migrations, deployed or sent live emails.
Invitation reminder automation and an operator recovery/release queue remain later work.


### Organisation handoffs: assignment retirement (Phase 4)

Organisation replacement, removal and matter closure now retire the old partner
lane in the same database transaction. Invitation-derived grants are archived
privately before revocation; independent manual grants remain intact. Old portal
and invitation links cannot restore the retired lane, including consumed legacy
invitations. Portal tokens rotate on retirement. Native attorney assignments,
bond records, buyer data, portal content and delivery receipts remain available
as history to the owning workspace. Direct portal and native record access also
exclude the retired organisation.

A pending, unallocated bond intake can follow a replacement nomination without
losing its saved data. Bank applications, progressed intakes or consultant/branch
allocations hold the replacement handoff for review instead of transferring
ownership automatically. The agent handoff panel shows this hold. A later
operator recovery/release queue must resolve it; this phase adds no bypass.
Attorney firm receipt is retained independently of retiring its assignment.

Run the existing `npm run test:transaction-partner-invite-org-connection` for
executable replacement, removal, closure, stale-link, direct-access, preservation
and rollback checks. `npm run test:transaction-handoff-dispatch` covers register
presentation and prior dispatch gates. Tests use local fixtures and send no email.

Release requires `20261004083851_transaction_handoff_assignment_retirement.sql`
after Phases 1–3 and the primary app changes. No existing migration was edited.
This phase reacts to future source changes; it does not bulk-repair historical
assignments. Remote migrations and deployment remain unapplied. After an approved
release, verify attorney/bond replacement, portal revocation and a progressed
finance review hold against the target's real policies and worker.

### Organisation handoffs: operator recovery (Phase 5)

The existing agent matter handoff panel now offers recovery controls to active
organisation managers at the owning agency's headquarters. Partner and branch
membership cannot authorise recovery. Each decision requires a review reason,
the current handoff generation and a reusable request identity. The private
recovery decision and internal matter event commit with the queued work; a lost
response can resume the same decision without extending retries twice.

Eligible failures can be retried after correcting their cause. Exhausted jobs
receive four additional attempts per reviewed decision, with a hard cap of 24.
Attempt history, recipient keys, frozen payloads, provider clocks and successful
receipts are retained. A leased job or an expired provider deduplication window
requires delivery confirmation and cannot be forced through this control.
Recovery queues background work; it never marks an instruction sent or accepted.

Reviewed historical and retirement holds can be released once readiness and
nomination gates pass. If progressed finance belongs to another organisation,
release remains blocked: correct the nomination to the existing finance owner
and review it again. An inactive intake belonging to that organisation regains
its recorded allocation; buyer data and bank applications are not transferred.
Closed matters, expired invitations and changed source generations cannot be
released through recovery. Private worker payloads and recovery tables remain
unavailable to browser clients.

Run `npm run test:transaction-partner-invite-org-connection` for executable
permission, rollback, retry allowance, worker-claim, source fencing, idempotency,
receipt preservation and finance ownership checks. Run
`npm run test:transaction-handoff-dispatch` for prior dispatch behaviour and the
recovery panel/service checks. `npm run check:app` covers lint, baseline tests and
production build. These checks use local fixtures without sending communications.

Release requires `20261004085417_transaction_handoff_operator_recovery.sql`
after Phases 1–4, plus the primary app changes. No remote migration or deployment
was performed. Verify recovery with real agency-manager and partner accounts and
the running worker after authorised release. Recovery is available per matter;
a central cross-matter queue, automated invitation reminders, bulk historical
repair and reconciliation of uncertain provider results are not implemented here.

### Organisation handoffs: central oversight (Phase 6)

The principal dashboard now includes an organisation handoff queue across the
agency's active matters. Access uses Phase 5's active headquarters management
membership at the owning agency; partner administrators and branch membership
cannot enumerate that agency's matters. The queue remains agency-wide when other
dashboard filters change. It has server-side filters, bounded pagination and
totals over the complete organisation scope, and refreshes while visible.

Managers can distinguish readiness waits, partners awaiting signup, queued
instructions, failures/review holds and outstanding organisation receipts. Pending
invitation expiry is evaluated on each read. Pending dates use saved work,
invitation or preparation timestamps instead of a dashboard refresh time.
Missing required registers, delivery jobs, native matters, partner assignments,
email intents, provider receipts, frozen payloads and owner mismatches are flagged
as missing evidence. Recovery also requires the saved handoff owner to match
the matter owner, so corrupted ownership cannot authorise another tenant. Delivered handoffs with organisation receipt leave the queue;
closed matters are excluded. A missing record never becomes a healthy empty result.

Each entry opens its matter or the existing guarded handoff review/recovery panel.
The queue read does not reconcile, repair, requeue or send anything. Buyer details,
invitation tokens, recipient emails, email payloads and private recovery history
are not included in the queue response. Errors and unavailable migration/access
are visible. Workspace changes discard old results and close the previous review.

The existing `npm run test:transaction-partner-invite-org-connection` now executes
the organisation queue migration and checks scope isolation, evidence gaps,
expiry, stable age, pagination, completion/closure and read-only behaviour.
`npm run test:transaction-handoff-dispatch` includes queue UI and service checks
alongside prior handoff gates. `npm run check:app` verifies lint, baseline tests
and the primary app build. Local fixtures do not send communications.

Release requires `20261004090057_transaction_handoff_organisation_queue.sql`
after Phases 1–5 and the primary app changes. No remote migration or deployment
was performed. Verify organisation scope and recovery navigation with real
principal, branch and partner accounts after authorised release. Automated
invitation reminders, bulk historical repair and uncertain provider-result
reconciliation remain separate work; this queue surfaces them for investigation.

### Rental listing save integrity

Connected local acceptance now runs the real rental detail and guided editors,
workspace scope and save services against the shared migrated PostgreSQL fixture.
It caught and corrected the date-only P24 expiry path: incomplete rentals no longer
need a complete capture form to change expiry, and that control cannot submit
unrelated editor fields. The new `save_rental_listing_expiry_v1` transaction changes
only P24 expiry and timestamps, preserves publication/media/links and mandate expiry,
and records actor-attributed before/after history. Stale or unauthorised updates and
history failures are rejected atomically. A failed readback is explicitly unconfirmed.
Apply `20261004163134_rental_listing_expiry_isolated_save.sql` after the durable-history
migration before releasing the updated client. The existing distribution review now
includes its SQL access/rollback checks; expiry UI/service regression checks cover
its receipt and readback. See [rental reliability acceptance](../docs/kingdom-rental-reliability-acceptance-20261004.md)
for the connected loopback browser fixture, tested boundaries and outstanding actual
signed-in account acceptance. Local fixtures do not certify hosted memberships,
Storage permissions, provider credentials or live portal pages.


Rental Property24 and Private Property sends now commit a server-owned submission
journal before calling the provider. One unresolved request per rental/channel/
environment blocks concurrent sends and changed-payload retries. Confirmed portal
receipts are retained before local sync writes. Timeouts, server errors, missing
references and failed local repairs remain uncertain; they are not reported as
confirmed rejection. Stale create previews cannot bypass a completed submission.
Stock review and channel settings show **Outcome unconfirmed** and allow
**Reconcile previous request** even without a saved public reference.
Reconciliation probes exact source/provider identifiers and repairs local sync
without publishing again. It never matches by address or title, releases a slot
because time elapsed, or treats an absent advert as proof of rejection. Ambiguous
content updates require provider review when the API cannot prove their outcome.
Withdrawals remain pending while the portal still reports the rental live.
Apply `20261004155515_rental_publication_attempt_recovery.sql` before releasing
this server/client. Browsers have scoped read access to the journal and cannot
forge or clear its entries. This protects submissions made through the new journal;
older uncertain submissions still require investigation of their existing evidence.
Focused checks: `npx vitest run server/tests/rentalPublicationRecovery.test.js`,
the rental channel service/model and portal management tests, and the established
Property24/Private Property publish, workflow and browser API checks. All use
fixtures; no real listing is published or remote database written by these checks.

Rental detail and gallery saves record their authenticated actor, time and before/after
facts, publication data, media (including bucket/path identities) and external links
inside the save transaction. Activity insert failures roll back the save. Combined
video/tour edits produce one final audit snapshot. Stock review displays recorded
changes and reads older history pages; refreshed signed photo links do not count as
edits. Historical snapshots are evidence, not automatic restoration approval.
Apply `20261004154901_rental_listing_durable_history.sql` after the photo storage
identity migration before deploying this client: v2 save functions fail before
writes when absent. Older RPC entry points also delegate to the audited transaction.
No older history is fabricated. Check with
`node src/services/rentals/__tests__/rentalListingPersistence.test.mjs` and the
rental history model, activity pagination and stock review component tests.

Rental creation reserves a UUID in the workspace browser draft before its first
database request. Every retry uses that same primary key with INSERT, never upsert.
A lost response or key conflict is reconciled through an authorised read of the
same rental. Existing rentals are reviewed before another save; an older creation
form cannot silently replace their saved details or photos. Confirmed creation IDs
and uploaded photo bucket/path references survive a browser refresh. Files that
had not uploaded need to be reselected. Failed recovery reads or browser storage
block creation rather than starting with another identity. The receipt is cleared
only after confirmed save and any requested landlord link succeed.
Phase 3 uses the existing listing primary key and requires no new migration.
Focused checks: `node --test src/services/rentals/__tests__/rentalListingCreationRecovery.test.js`
and the creation-entry, rental-save and create-page tests. These use local fixtures
and local Postgres; they do not create production rentals.

Rental lookup and editing enforce the selected organisation and the same agent or
branch scope used by the rental list, including organisation-wide principals.
Read failures stay visible rather than falling back to a misleading not-found result.
Changing organisation, agent, branch, permission scope or listing resets the editor;
late responses cannot replace the current listing or navigate back to an old workspace.
Browser drafts use a workspace-specific key. Older unscoped drafts remain in storage
but are not automatically restored because their owning organisation is unknown.
Photo, expiry, edit and portal actions cannot overlap on the same detail page.
Workspace regression checks are in `rentalListingWorkspace.test.js`,
`RentalListingCreatePage.save.test.jsx` and `RentalListingDetailPage.overview.test.jsx`.
This workspace correction needs no additional database migration.

Rental private photos retain their storage bucket and path through both atomic
save paths. Listing and cover reads, plus rental P24/PP payload preparation, issue
fresh signed viewing URLs. Readback compares durable object identity because a
refreshed URL can have a different token. External images keep their original URLs.
Signing failures never substitute a public URL or silently reuse an expired link.
Release requires `20261004151831_rental_photo_storage_identity.sql`, which recovers
unambiguous existing rental references only when the matching storage object exists
in that listing's upload namespace. It does not make any bucket public.
Focused checks: `node --test src/services/listings/__tests__/listingPhotoStorage.test.js
src/services/__tests__/privateListingService.coverImages.test.js`, the existing
rental persistence SQL check, and `rentalListingSave.test.js`.


### Rental listing save integrity

Rental listing cards have a three-dot menu for withdrawal and permanent deletion.
Rental and sales cards share the same “Live on” row with portal logos and checked
website publication status. Rental cards show availability as a compact date badge
and prices per month. Website status loads after the cards render. The focused
`RentalListingsPage.agentContact` and `RentalListingsPage.actions` tests cover the
card details, current/previous collections and existing actions.
Withdraw listing opens Marketing, where agents use the existing portal and website
withdrawal controls. Delete checks current channel status and stays blocked while
an advert is live, pending or unconfirmed. Withdrawn cards remain visible so agents
can delete them after removal is confirmed. Confirmation rechecks status, and the
card disappears only after the shared server deletion and readback succeed.

Release the shared `20261005075454_listing_deletion_withdrawal_guard.sql` migration
before the primary app update. It also protects sales deletion while retaining
ownership and linked-workflow checks. Local verification:
`node --test scripts/private-listing-deletion.test.mjs` and the Vitest
`RentalListingsPage.actions` / `rentalListingDeletionService` tests.

Rental edits now save listing facts, publication details and gallery changes in one
transaction. Photo edits retain existing video, tour, floor-plan and external-link
records, as well as IDs for retained photos. P24 expiry is saved separately in
`rentalInfo.property24ExpiryDate`; mandate expiry retains its own value. The app
reads the listing back and verifies facts, publication, media and links before
reporting success. Stale editor versions must reload. Failed or unconfirmed saves
retain uploaded photo URLs for recovery without uploading the same bytes again.

Release requires `20261004091223_rental_listing_atomic_persistence.sql` before the
primary app update. Without the RPC, rental saves fail visibly; there is no fallback
to the previous destructive distribution save. The original migration was applied in the verified 4 October repair release.
It does not restore previously removed media, change archived rentals, update portal
expiry remotely, or publish listings.

Checks: `npm run test:rental-listing-distribution-review` includes executable local
Postgres persistence, access-control and rollback checks. Run
`npx vitest run src/services/rentals/__tests__/rentalListingSave.test.js` for upload,
retry and readback checks. These checks do not write remote data or call portals.

Rental media controls now remove the selected photo, change its cover designation,
and save gallery order directly from Marketing. Photo-only saves retain the listing
facts and publication data verbatim, including older incomplete rentals. Removing
the last photo clears the displayed cover rather than reviving an old preview.
The guided Marketing editor can add, change or clear a public video and virtual-tour
URL; saved links open from Marketing and appear in Listing Media Progress. These
optional links do not change the portal readiness percentage. Edits target only
the selected video/tour row and preserve other media and external links.

Apply `20261004092331_rental_listing_media_controls.sql` after the phase 1 migration
and before deploying these controls. Both original migrations were applied in the verified 4 October repair release.
Photo removal unlinks the gallery record; it does not delete stored
files. Channel actions, archived-stock recovery and media forwarding to portals
are separate work. The distribution review now also exercises both media RPCs;
the rental save and create/detail-page tests cover link editing and photo actions.

Rental Listing Channels now use the agency website controls and, where the listing's
organisation has an enabled sharing grant, the independent Kingdom website channel.
Website lookup errors remain visible and retryable; an unconnected agency website
shows its connection state. An absent Kingdom sharing grant does not expose publishing
controls. The public websites product is unchanged.

Property24 and Private Property show saved references, valid public URLs, stored
status and publication activity. Marketing loads stored status only. Refresh portal
status explicitly probes the provider using the existing authenticated API routes.
Manage portal settings offers Property24 rental lifecycle statuses and Private
Property ToLet/Inactive, with the existing reactivation and readiness protections.
Update listing remains gated by each portal's readiness preview.

Submissions, acceptances, withdrawals and failures are recorded in the existing listing
activity store. Portal acceptance does not imply a verified public page. A user may
save a valid portal link after confirming it matches the saved rental; subsequent
saved changes are compared with that snapshot. Status/history errors are visible,
and an accepted request whose activity save fails is not reported as a provider
failure or automatically retried. Refresh status before retrying such a request.

No new phase 3 migration is needed. These changes remain local; the phase 1/2 RPC
migrations above must be released with the app. Live grant configuration, portal
credentials, website publishing and production rental smoke checks still require
an approved release. Phase 4 readiness explanations and phase 5 stock recovery are
separate work.

Focused local checks: `node --test src/services/rentals/__tests__/rentalListingChannelModel.test.js`
and `npx vitest run src/services/rentals/__tests__/rentalListingChannelService.test.js
src/components/listings/__tests__/RentalWebsiteChannels.test.jsx
src/pages/rentals/__tests__/RentalPortalManagementPanel.test.jsx
src/pages/rentals/__tests__/RentalDistributionChannel.test.jsx
src/pages/rentals/__tests__/RentalListingDetailPage.overview.test.jsx`.
The existing `scripts/kingdom-isell-listing-channel.test.mjs`,
`scripts/private-property-phase11-post-submit-monitor.test.mjs` and
`test:rental-listing-distribution-review` check the relevant publication boundaries,
provider monitor contract and rental persistence. All are local checks.

Rental Marketing now separates the local listing checklist from portal publishing
requirements. Incomplete checklist items name the missing fields or current workflow
status and open the relevant editor step. Property24 publication is shown as a
publication step rather than a missing field. The percentage is labelled checklist
progress; completing it does not approve a portal submission.

Each portal has its own requirements card showing Not checked, Checking, Check failed,
Needs attention, Readiness not confirmed or Ready to submit. Both Private Property's
readiness report and Property24's preview are displayed, with duplicate blockers
removed, setup and agent mappings separated from listing fields, photo preparation
counts, and targeted editor/settings/expiry actions. Backend recommendations remain
separate from required blockers. Unknown requirements remain visible for support
review. Publish controls require an explicit successful, unblocked portal check.

Checks are invalidated after reloads or saved listing revisions; late responses from
an earlier revision or organisation cannot restore a publish permission. This is a
primary app presentation change with no new database migration or portal rules.
Local verification: `node --test src/services/rentals/__tests__/rentalListingReadinessPresentation.test.js`
and `npx vitest run src/pages/rentals/__tests__/RentalListingReadinessPanel.test.jsx
src/pages/rentals/__tests__/RentalListingDetailPage.overview.test.jsx`.

Rental Listings now has an explicit **Review rental stock** action. This read-only
review includes archived and withdrawn rentals within the selected organisation
and the user's existing agent/branch scope. Normal stock queries remain unchanged.
Deleted records are excluded. The shared listing reader fails visibly if records,
publication, external links or media cannot be read, or if the database response
limit would make the review incomplete; it does not report a clean review from
missing data. Branch-schema failures also remain errors for this review.

The review identifies hidden stock, saved live portal statuses with incomplete
references or valid public links, hidden stock still marked live, and absent photo
galleries. Inspect history reads the selected listing's activity and compares any
available media snapshots. Historical differences may be intentional; an empty
history does not prove there was no data loss. Original files/backups and the
responsible agent's confirmation may be needed. Current records can open Marketing
for the existing channel workflow; archived records stay in the read-only review.
No automatic unarchiving, file restoration, status probes or republishing occurs.
Actual record recovery and production release require explicit approval.

Local checks: `npx vitest run src/services/rentals/__tests__/rentalStockReviewService.test.js
src/pages/rentals/__tests__/RentalStockReviewPanel.test.jsx
src/pages/rentals/__tests__/RentalListingsPage.agentContact.test.jsx`, plus the
existing `scripts/agent-listings-delete-ui.test.mjs` and rental distribution review.
No phase 5 migration is required.

## Seller document release verification

The revised mandate release uses the exact candidate and sign-off pack described
in [the Phase 7 decision record](docs/mandate-wording-review/decision-record.md#phase-7-sign-off-pack-and-release-controls).
The user's confirmation on 4 October 2026 is recorded against each unchanged
Exclusive, Open and Dual draft. `Pretoria` is recorded as supplied context; it
does not identify a lawyer or a contracting agency. Exact agency-schedule and
human design approval remain separate from that wording confirmation.

After the complete `npm run test:seller-document-journey` run, export the current
review candidate and a new pending decision file:

```bash
node scripts/seller-document-release-check.mjs --candidate-out=docs/mandate-wording-review/release-candidate.json --decision-template-out=docs/mandate-wording-review/release-decision.json
```

The decision writer refuses to overwrite an existing file. The candidate locks
the three wording hashes, fifteen synthetic PDF proofs, both scoped migrations,
rollback, the signing import graph and the relevant app/QA source. The journey
records that source fingerprint and rejects changes made during its run. Its
transactional rollback rehearsal preserves every fixture record and signature;
it is local evidence, not a production recovery rehearsal.

Validate the saved candidate and decision with:

```bash
node scripts/seller-document-release-check.mjs --candidate=docs/mandate-wording-review/release-candidate.json --decision=docs/mandate-wording-review/release-decision.json --require-ready=true
```

This strict command fails until exact agency/design approvals, build, migration
replay, target/recovery, scoped dry run, catalog/security, rollback, hosted seller
acceptance and delivery evidence are recorded for the same source. Also supply
the retrieved signing/retirement bundles and matching frontend arguments below.
Changed source, wording, PDF bytes, migration or QA evidence invalidates the
candidate. This read-only check never deploys, applies SQL or sends email. A
passing result is release-review evidence; a rollout still needs current-task
authorization and the database release runbook.

Run `npm run check:seller-document-release` from the primary package to verify
release packaging and the release checker itself. It follows the signing handler's
actual import graph, including every nested branding, mandate, FICA, disclosure
and correction module. A matching entrypoint alone cannot establish a matching
deployment. The local command reports remote verification as false until the
remote evidence is supplied; it does not deploy or send email.

`node scripts/seller-document-release-check.mjs --bundle-out=/tmp/seller-signing-bundle.json`
exports the complete deployment payload without credentials. For a deployed check,
provide `--remote-signing`, `--remote-retired`, `--deployment-url` and
`--expected-release-id`, each as `--option=value`. The signing snapshot is the
retrieved Supabase function including its files. Retirement evidence must contain
the complete function `inventory` and a `bundles` object keyed by every active
retired function name. The checker rejects missing or stale dependencies, altered
JWT settings, legacy handler dependencies, mismatched inventories, stale frontend
release markers and protected deployments. It does not replace authenticated
seller acceptance, migration verification or email-delivery checks.

The earlier release candidate was isolated from unrelated work on
`codex/seller-document-release`, starting from production commit
`8788b9596b040d87d6e05cfb76d72fd97cf077ce`. Apply only the reviewed seller-runtime
migration after the target, recovery and exact scoped dry run pass. Deploy the
complete signing bundle and replace the eight active retired handlers with the
pure HTTP 410 bundle, retaining their JWT settings. Preserve historical final-file
access and leave the two absent retired handlers absent. Then deploy the matching
app commit and verify retrieved bundles and the deployed seller journey.

That earlier checkpoint is [the release status](../docs/seller-document-release-status.json).
It predates the revised wording and Phase 6 fixes and must not be used as the
candidate for this sign-off. Isolate the current seller changes against the
current production source and rerun build/acceptance before an actual release.
The required Supabase migration dry run stalled during production database login;
no app deployment, function deployment or schema migration was performed. The
local workspace suite, app lint and baseline tests, production build, Edge type
check, retirement tests and release-check tests passed. A live transaction-only
rehearsal, post-migration advisor check, complete clean migration replay and hosted
acceptance remain outstanding. The full replay needs at least 10 GiB free.

Recovery definitions and old function bundles are retained outside source in the
original workspace's `tmp/phase7-*` files.
[The scoped SQL rollback](../docs/seller-document-review-runtime-rollback.sql)
removes only the newly restored RPCs, view and triggers, retaining event data,
columns and automation definitions. It has not been rehearsed against production;
do not execute it without the matching app/function recovery and catalog checks.

## Revo external websites

Revo organisation administrators can configure independent website connections
under Settings → Integrations → External Websites. Each connection has scoped
listing access or leads-only access, separate credentials, fallback assignment,
signed listing webhooks, durable withdrawal reconciliation and activity records.
The backend reuses the public listing projection and canonical website-to-CRM
intake; Revo’s website interface and Prop Data/DNS migration remain separate.

Run `npm run test:external-websites` from this package for the local PostgreSQL,
API, handover-example and administration-control checks. These use fixtures and
perform no remote writes or deliveries. The developer contract and release
requirements are in [docs/external-websites.md](docs/external-websites.md).

### Rental listing property registration

New rental listings register an active canonical property and a vacant rentable
unit in Properties & units in the same database transaction as listing creation.
Exact organisation/address/unit matches reuse existing inventory; existing
occupancy, contractual rent and management facts are preserved. Landlord portfolio
handoffs retain their canonical property identity. Standalone homes use MAIN;
numbered units use their captured unit number. Missing city details are flagged
in property metadata for review; no city is invented.

A listing alone does not create confirmed management authority or a contracted
lease. The management dashboard explains why active mandates and monthly rent
roll can remain zero while a rental is advertised. Property addresses now map
correctly from database fields into the portfolio.

Release requires `20261004165101_rental_listing_property_registration.sql` and
the primary app changes. The migration also repairs identifiable existing active
rental stock, including imported listings. Ambiguous multi-unit matches or invalid
legacy facts abort the transaction for review rather than partially repairing it.
Before release, inspect that exact backfill scope and unresolved/addressless stock
in the target environment. No live database writes or deployment were performed.
Run the existing `test:rental-listing-distribution-review` check for executable
SQL/RLS registration, deduplication, rollback, branch/organisation denial, occupied
unit preservation and compatibility with the audited snapshot save.

### Portal lead delivery

Tenant acknowledgement emails now create an expiring tenant qualification link.
The rental email and public form have their own rental design and tenant questions,
including monthly rent, areas, move date, employment, deposit, screening consent,
household, property needs and pets. Tenants can provide one to three preferred viewing
times in South African time, including enquiries without a linked local listing.
The saved lead decides the form; public callers cannot switch a rental into the buyer
write path. Answers populate Tenant qualification on the rental overview, while times
populate Viewing request. Submissions preserve the current stage and do not book an
appointment. Screening consent remains the tenant's explicit Yes/No answer.
The service-only `rental_submit_tenant_qualification` transaction saves the lead and
closes its link together, rejecting expired links, closed leads and stale reads.

Focused checks: `npx vitest run server/tests/rentalTenantIntake.test.js
src/pages/rentals/__tests__/TenantQualificationPage.test.jsx
src/pages/rentals/__tests__/RentalTenantLeadWorkspace.test.jsx`, and Deno tests
`supabase/functions/buyer-viewing-preferences/tenantIntake.test.ts`,
`supabase/functions/send-email/services/tenantQualificationLink.test.ts` and
`supabase/functions/send-email/content/leadAcknowledgement.test.ts` using each
function's `deno.json` and `--allow-env`. These use fixtures and send no live email.
Production needs the new submission migration, `send-email`,
`buyer-viewing-preferences` and the primary app released together with explicit
approval. This change does not resend historic tenant emails.

Property24 also verifies unmatched historical adverts against per-agency Sale and Rental statistics. Only an explicit matching agency can admit an unlinked enquiry; foreign, conflicting, or unavailable ownership records remain pending, preserving the recovery checkpoint. The CRM enquiry payload retains the advert number, listing type and verification source for follow-up.

Unlinked Property24 enquiries explicitly identified as Rental now receive tenant
rental metadata during import. The database classifier supplies the same fallback
for unlinked Property24 inserts, while linked listings retain their existing
classification rules. Rentals includes classified leads and Sales excludes them.

The append-only migration
`20261007155955_property24_unlinked_rental_lead_classification.sql` also corrects
the reviewed 45 Lost enquiries from the 5 October import batch. Their existing
identity, enquiry, assignment and CRM status are retained, and a lost rental
outcome places them in Closed Leads. The repair preserves consent and outcome
details, refuses a changed candidate count or classifier baseline, and permits
a repeat after all 45 have been corrected. It requires an approved production
release; preparing this change has not modified hosted records.

Focused local checks: `node scripts/property24-phase7-lead-import.test.mjs`,
`npx vitest run server/tests/property24RentalLeadClassification.test.js --maxWorkers=1`,
and `node scripts/rental-leads-phase11.test.mjs`. These use fixtures and send no emails.

The scheduled Property24 import discovers all enabled accounts in its own
environment, reads each account’s encrypted credentials and keeps an independent
agency checkpoint. New accounts recover the latest 30 days of published listing
enquiries without sending historical introduction emails. The agency feed uses
Property24’s `messages` response, follows all pages, and replays a recent window
with duplicate protection. A failed agency does not stop other accounts.

Private Property lead delivery uses the `private-property-webhook` Edge Function
and migrations `20261005060708_portal_lead_intake_global_fix.sql` and
`20261005064727_private_property_lead_channel_correction.sql`. An agency
principal or group owner must register its HTTPS endpoint in the supplier admin
portal and obtain the numeric agency ID and signing secret. The executive Admin
Console’s Private Property section stores these separately from publishing
credentials in Vault and shows last delivery and failures. Listing API access
alone does not register a lead webhook. The receiver verifies HMAC SHA-256 over
the exact body, checks agency ownership, resolves all three supplier listing
references and retries failed deliveries. CRM writes and duplicate protection
run in one transaction.

Run the existing Property24 phase 5, 7 and 9 checks,
`node scripts/portal-lead-intake.test.mjs`, and from the repository root
`deno test --config supabase/functions/private-property-webhook/deno.json
supabase/functions/_shared/privatePropertyLeadWebhook.test.ts`. These checks
use local fixtures and send no communications. Supplier registration and a real
signed delivery remain required for Private Property acceptance.

## Recruitment workspace

The Vite dev server loads the real Join Us link context and organisation branding
through the server-only recruitment API. Local forms are labelled as previews
and cannot submit applications to the configured database. Published intake uses
the normal submission endpoint.

Sales organisation principals and administrators can open Organisation → Recruitment
(`/agency/recruitment`). The Agent Leads / Closed Leads table includes search,
stage filters and pagination. Copy Intake Link in the Recruitment header creates
and copies a public Join Us link; the table has no separate intake-links panel
or website-link controls. The current link is reused while the page remains open.
Add Agent Lead opens a popup over the table; saving
adds the new lead to the table without opening its detail page. Failed saves retain
the popup’s entries for retry. Each lead has Overview, Agent Details and Documents,
with a buyer-style header and readiness based on saved information: onboarding
captured, experience, qualifications/registration, preferred area and supporting
documents. Captured information still requires human review. Joined and no-longer-
proceeding leads appear in Closed Leads. Only leads closed as not proceeding can be reopened.

Records live independently of property leads in `recruitment_leads`. PDF/JPG/PNG
files up to 10 MB use the private `recruitment-documents` bucket. The append-only
`recruitment_workspace` and `recruitment_lead_received` migrations must be applied before persistence works;
no migration or production release is performed by building the UI. Active
principal/admin/super_admin membership is enforced by database policies, and
version checks prevent stale edits from overwriting another save. This first
version supports manual capture; public website applications are not imported.

Focused checks from this package: `npx vitest run src/pages/recruitment/__tests__`.
The database tests execute the migration in an isolated in-memory PostgreSQL
instance and check organisation isolation, management-only access, private file
access, invalid stages and stale saves. They do not access a remote project.

Phase 1 captures staff and referral enquiries at **Lead Received**. Name and at
least one contact method are required; source, preferred area, referrer and notes
can be saved. Receipt time, capturing user, intake channel and an intake key are
stamped by the database. Repeating the same draft creation recovers its original
record. An append-only activity history records receipt, edits, closure and
reopening; receipt metadata cannot be changed by callers.

The Overview shows the agreed eight-stage journey. The stage is read-only in
this phase, and database guards reject advancement to later stages. Historical
joined records are retained separately without implying that an agent account
was activated. The onboarding readiness indicator does not advance the journey.
Public links, website intake and automated invitations are covered by the later
workspace phases below.

### Shared Join Us contact capture foundation

The shared signup journey has an initial contact-capture action on
`POST /api/public/recruitment-intake`. Send `action: "capture_contact"`, the public
intake `token`, a stable UUID `submissionKey`, and `contact` containing
`firstName`, `lastName`, `email`, `phone`, and `privacyAccepted: true`. The client
helper `captureRecruitmentContact` validates and normalises these fields. It
whitelists contact data; passwords and applicant account claims never enter the
CRM request. The agency comes from the server-resolved intake link, not a client
organisation ID. Only current, unrevoked website or public links can start a new
contact enquiry; private invitations keep their existing application workflow.

Apply `20261007082653_recruitment_contact_capture.sql` after the existing
recruitment workspace migrations and before releasing the updated CRM queries.
Contact capture atomically creates a **Lead Received** record and a private retry
receipt with consent version and receipt time. An identical retry with the same
agency, link and key returns success without creating another lead or overwriting
staff edits. A changed payload or link with that key returns a conflict. Unverified
email addresses are not used to merge leads, and agencies remain isolated. Sender
rate limits apply across intake links. Receipt data and capture/verification
evidence cannot be edited from the CRM.

Captured leads show **Email verification pending** separately from **Application
not yet submitted** in the CRM. Existing leads default to `not_requested`; no
historical email is marked verified. This foundation creates no account, agent
membership or email. The Home Seekers popup/signup, authenticated applicant-to-lead
binding, verification/resume and submission onto the same captured lead belong
to the subsequent signup journey phases. The existing full application form is
unchanged. Vite previews block contact writes as well as final submissions.

The focused recruitment suite above covers the public handler through the real
database function in isolated PostgreSQL, retry/conflict handling, tenant and
role isolation, metadata protection, rate limits and rollback without orphan leads.

### Shared signup popup (signup journey phase 2)

The Home Seekers Join page replaces its embedded legacy application form with a
**Join Home Seekers** invitation. The header, hero, FAQ, bottom invitation and
sticky Join buttons open the shared `RecruitmentSignupModal`. It collects first
name, surname, email, mobile, password and recruitment contact consent. The
application progress shows account creation, email verification, application and
review; this phase stops at the verification boundary. The popup can also use the
shared intake endpoint and another agency's token/branding.

`signup` on `/api/public/recruitment-intake` first invokes the Phase 1 contact
capture function, then creates a Supabase Auth account through the server-only
Admin API with `email_confirm: false`. The password is sent only to Auth; it is
never written into CRM contact data, retry receipts or account metadata. No session
is returned to the browser and no agent or staff membership is created. A stable
provider account ID derived from the private CRM lead UUID allows recovery of
uncertain or simultaneous account creation responses without changing a saved
password. Server-authored account metadata records the pending lead association;
it grants no applicant read access and must be checked against verified ownership
before any access is enabled in Phase 3.

If Auth fails, the contact stays in Recruitment at Lead Received and the response
acknowledges contact capture separately. The popup retains the same key and contact
snapshot for retries. It clears passwords when closed or completed, stores no
signup data in browser storage and blocks overlapping submits. An email belonging
to another account is never adopted or reset through anonymous signup; sign-in
and verified existing-account binding belong to Phase 3. This phase sends no
verification email and makes no delivery claim.

The standalone website includes `/api/home-seekers/recruitment`. Configure the
server-only `HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN` using a current website/public
link created by a Home Seekers manager. The server validates that it belongs to
Home Seekers and ignores client token/organisation overrides. Use the same
Supabase and fingerprint settings as the shared intake endpoint; keep the token
out of frontend configuration. Apply the contact-capture migration before release.
Missing configuration fails explicitly. Local Vite previews provide a labelled
walkthrough of the signup and next-step screen without saving CRM data, creating
accounts or sending passwords to an API.

Focused checks: `npx vitest run src/pages/recruitment/__tests__
src/pages/__tests__/HomeSeekersLeadForms.test.jsx` and `node --test
server/tests/homeSeekersWebsiteDeployment.test.js server/tests/homeSeekersRecruitment.test.js`.
The packaging test calls the bundled signup handler against synthetic database
and Auth servers, checks retry recovery and verifies credentials stay out of the
artifact. No test creates a remote account or sends email.

### Verified applicant access (signup journey phase 3)

The shared popup now requests an email verification code after account creation.
Applicants can resend the code, verify it, sign in with an existing account, or
use another email code to return on a different device. Signup still captures
contact before Auth; an existing-account creation failure retains that enquiry
and offers sign-in. Email failures retain the enquiry and allow a retry.

The provider is called through an isolated server-side Auth client. After OTP or
password authentication, `auth.getUser(accessToken)` checks canonical identity;
the database independently checks `auth.users.email_confirmed_at`, the unchanged
capture email, account deletion/ban and the receiving organisation. Browser user
IDs, verification flags and editable user metadata never author ownership.
Verification stamps the **same** Lead Received record. No application submission,
organisation membership or staff access is created. One verified account can own
separate enquiries at multiple agencies without exposing either agency's CRM.

Applicant ownership and sessions live in private RLS-enabled tables. The browser
receives an opaque random cookie scoped per organisation: HttpOnly, SameSite=Lax,
Secure on public hosts, `/api/` path, seven-day expiry. Only its SHA-256 hash is
stored in the database. No Supabase access/refresh token or password is returned
to browser JavaScript or stored in browser storage. Reopening the popup restores
only that applicant's captured contact and submission state. Expired, signed-out,
banned, deleted, email-changed or closed enquiries cannot resume. Sign-out deletes
that applicant session without affecting any staff session. Persistent HMAC-based
attempt budgets limit email requests to one per minute/five per hour per email,
authentication to ten per hour per email, and all requests to thirty per hour per
sender. Failed requests consume the budget. Provider rate limits also apply.

Apply `20261007085627_recruitment_applicant_resume.sql` after the contact-capture
migration. Before release, configure Supabase's **Magic Link** and **Confirm
signup** email templates to display `{{ .Token }}` as a six-digit verification
code; `signInWithOtp` sends a link by default unless the template includes the
code. Retain existing confirmation links alongside the code for other Auth
flows. Keep working SMTP/email delivery configured and confirm an actual new and
existing account journey after an approved release. The provider request uses
`shouldCreateUser: false`; it cannot create or reset accounts through a resend.
The acknowledgement asks users to check their inbox without disclosing whether
an account exists. This local implementation has not changed Auth configuration,
applied remote migrations, sent live email or deployed anything.

Local preview offers a labelled simulation of code entry and the verified enquiry
screen. All authentication, email and CRM writes remain blocked. Phase 4 supplies
the full personal/professional questionnaire; Phase 3 stops at verified access to
the saved enquiry, and Phase 5 handles final submission on that record. Existing
private invitations and their application workflow remain in place.

Use the recruitment Vitest directory and standalone website packaging tests above.
The database journey covers actual migrated SQL, server verification, cookie
resume, sign-out, canonical ownership, agency isolation and session expiry using
synthetic Auth responses. No check sends email or changes a remote account.

### Applicant questionnaire (signup journey phase 4)

Verified applicants now complete Personal Information and Professional Details
in the shared popup. Four shorter screens cover names/date of birth, contact,
experience/licence/FFC/activity/legal status, then employer/referral/address/start
date. Verified email stays fixed. Phone and optional WhatsApp support country
codes; the questionnaire is the South African module shared across organisations.
A valid licence asks for the FFC number and candidate/non-principal/principal
practitioner type. Answers are self-declared, not a PPRA compliance determination.

Save & continue persists each step. Save & close accepts incomplete valid answers;
closing changed answers also saves them, and a failed save keeps the popup open
with retry or an explicit discard option. Signing back in restores answers and the
saved step. Conflicting device edits require reloading the newer saved draft;
identical retries do not add another revision. Completed questionnaires remain
**Lead Received**, with no submitted application or staff membership. Final review,
declaration and submission belong to phase 5.

Apply `20261007091149_recruitment_applicant_questionnaire.sql` after the phase 3
resume migration before releasing the new CRM query. It adds draft JSON, revision
and saved time to the same recruitment lead. Service-only functions recheck the
organisation-bound opaque session and canonical Auth identity on every save.
Database validation fixes verified email, whitelists fields, checks dates, phone
numbers, counts, lengths and conditional FFC requirements. A guard blocks staff
updates to applicant draft fields and leaves the immutable contact receipt and
submission stage intact. CRM managers can read the labelled draft separately from
the original enquiry and submitted application.

Use the recruitment Vitest directory and standalone packaging tests above.
The isolated database test exercises the API against migrated SQL, draft saves,
resume, retry/conflict handling, validation and agency/role/session isolation. The
packaging test checks the bundled website handler against synthetic Auth/database
servers. The local popup offers an in-memory questionnaire preview; it sends no
answers and does not persist across a page reload. No remote migration, account,
email or deployment has been performed for this phase.

### Review and submit (signup journey phase 5)

Save & review now opens a complete summary with edit buttons for each questionnaire
section. Applicants explicitly confirm processing consent and an accuracy
declaration before submitting. Both remain unchecked on entry and after loading
newer answers from another device. Submission uses the saved draft revision;
answers, agency IDs, verification flags and timestamps sent by the browser cannot
replace the reviewed questionnaire. Uncertain responses keep the same retry key
and declarations. A conflict requires reloading and reviewing the latest draft.

`20261007092532_recruitment_verified_application_submission.sql` follows the phase
4 migration. Its service-only RPC rechecks the organisation-bound opaque session,
canonical confirmed Auth identity, expiry, account status, complete saved answers
and current revision under a lead row lock. Submission atomically updates the
**same lead** to **Application Submitted**, stamps the immutable application,
consent wording/version/acceptance time and applicant identity, and adds one
activity entry. Original contact capture, source and received time remain intact.
Retries and another device's submission return the existing confirmation without
another lead, application or activity entry. No staff membership, approval,
contract, notification email or invitation is created by submission.

The retained application uses `recruitment-application-v1` with
`questionnaireVersion: recruitment-profile-v1`, preserving the existing staff
review/approval workflow. CRM summaries show the exact personal/professional
answers and recorded declarations. Qualification, training, CPD, mandate and
operating-area answers are not inferred from this questionnaire; reviewers can
request missing evidence. Submitted applicants return to a confirmation screen
and cannot change the retained application. Existing private/legacy application
invitations continue to work.

Use the recruitment Vitest directory and standalone packaging checks above.
Tests exercise migrated SQL and API submission, immutable consent/snapshot,
invalid/stale/unverified/foreign/expired sessions, duplicate recovery, staff review
and confirmation resume. Browser preview simulates review and confirmation only;
no application is sent. Remote migration application and deployment require a
separately approved release. No remote migration, email or deployment was
performed while implementing this phase.

Phase 2 adds the **Application Submitted** workflow. Organisation managers create
public and website links from Recruitment, or a private invitation from a saved
Lead Received record. The primary app hosts `/join-us/:token`; use the website
link as your website’s Join Us button destination, or an iframe `src` pointing to
that URL. This keeps organisation branding and questionnaire changes in one
place. No existing website is changed automatically.

The form has Basic Details, Insights, PPRA/FFC and Review steps. Insights include
areas, experience, average deals, commission retained, current agency, joining
date and mandate handover obligations. Registration questions distinguish new
entrants, candidate, non-principal and principal practitioners and capture FFC,
qualification route/progress, PDE, practical training and CPD. New entrants do
not need an FFC number to apply. Both processing consent and an accuracy
declaration are required. Answers are kept in memory while the page is open;
closing or refreshing an unfinished form clears them.

Questions were informed by the PPRA’s [FFC renewal guidance](https://theppra.org.za/licensing-and-registrations/ffc-renewals/),
[education transition clarification](https://theppra.org.za/download.php?data_id=145160)
and [PDE guidance](https://theppra.org.za/education/pde/). These are recruitment
self-declarations, not PPRA registration or verified compliance. The exact eXp
South Africa application questionnaire is behind account registration at
[join.expsouthafrica.co.za](https://join.expsouthafrica.co.za/); this implementation
does not claim to reproduce that questionnaire.

The server endpoint `/api/public/recruitment-intake` returns public branding only
and accepts validated submissions through a service-role-only database function.
The `recruitment_application_submitted` migration must follow the first two
recruitment migrations. Configure server-only `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `RECRUITMENT_INTAKE_FINGERPRINT_SECRET` (a random
secret of at least 32 characters; the existing `WEBSITES_LEAD_FINGERPRINT_SECRET`
is supported as a fallback). No secret is included in the form bundle. Vite local
previews deliberately disable this endpoint to avoid writing to a remote database.

Private links expire after 14 days and public/website links after one year.
Addresses are shown only at creation; copy them then. Only their SHA-256 hashes
are stored. Managers can revoke links. Private submissions update the original
lead while preserving receipt time, source and staff notes. Public submissions
create their own recruitment lead at Application Submitted. Repeating the same
link/submission key returns the original acknowledgement; submitting with a new
key is a new application rather than an unverified email-based merge. Intake is
limited to five accepted applications per sender fingerprint per hour across
links, with a honeypot and request-size cap. Application snapshots are immutable
and anonymous users cannot read recruitment records or call the submission RPC.

Submitted answers appear in Agent Details and generate four review requirement
cards in Overview. Closing/reopening a submitted application preserves its stage
and snapshot. Approval and later stages remain locked. Links can be copied and
shared manually; creating them does not send email. Automated invitations,
applicant uploads, review/approval actions and contracts remain later work.
Focused checks cover form progression, failed submissions, retry keys, branding,
link hashing/revocation, organisation isolation and atomic database capture.

Phase 3 adds **Under Review**. Organisation principals and administrators start
review from a submitted application in Overview. The database records the starting
reviewer and time. Staff record four checks (registration/FFC, qualifications/PDE,
training/CPD and handover), overall/interview notes, an optional internal follow-up
date, and individual document findings. Resolved checks, not-applicable reasons and
information requests need explanatory notes. Evidence references must point to an
uploaded file on that same lead; review findings do not alter the application.

Each changed finding is stamped with the saving user and time. Review saves use
the current record version and reject conflicts. Unsaved review findings disable
agent-detail saves, uploads and close/reopen actions until the review is saved;
unsaved agent details similarly block review saves. Review summary is derived from
the four checks and every current uploaded document: In progress, Needs information
or Ready for approval. A new upload makes a ready review incomplete until reviewed.
Ready for approval leaves the pipeline at Under Review; Phase 4 approval is still
locked. Closing and reopening preserves findings and returns to Under Review.

Apply `recruitment_under_review` after the three earlier recruitment migrations
when an authorised release is requested. The migration has been tested locally,
not applied to a remote database. Review uses existing organisation management RLS;
there is no public review access. Follow-up dates and information requests are
internal records and do not send messages or reminders. The focused recruitment
suite includes review start/access, audit stamps, evidence isolation, stale saves,
readiness, document additions and closure/reopening.

Phase 4 adds **Application Approved**. Organisation principals and administrators
approve from Overview after the saved review resolves all four checks and every
uploaded document. A decision reason and deliberate confirmation are required.
Approval uses the current lead version; a stale record or lost access requires
reloading and reviewing the record again before approval. The database verifies
readiness and the presence of reviewed files independently of the UI, stamps the
approving user and time, and appends an approval activity.

An immutable approval snapshot retains the submitted application, saved findings,
review documents, agent information and pre-approval record version. The review
and its documents are locked after approval; management users cannot delete the
approved record or its referenced files. Contact/detail corrections remain possible
without changing that snapshot. Closing and reopening an approved lead restores
Application Approved and preserves the original decision. Contract generation,
sending, signatures, onboarding and agent activation remain subsequent phases.
Approval does not send email, make a PPRA compliance determination or create an
agent account. The append-only `recruitment_application_approved` migration must
follow the review migration; it has not been applied by this implementation.

Recruitment contract preparation adds a separate private `recruitment-contracts`
bucket and a retained PDF version history in Overview. Active approved applications
can prepare PDFs up to 10 MB; review evidence stays locked in its original bucket.
Each version records the preparing user/time and approval reference. Preparation
uses the current record version, records an activity, preserves older versions and
leaves the stage at Application Approved. Registered contract files cannot be
replaced, renamed or deleted through authenticated storage access. Failed saves
attempt to clean up unregistered uploads; retention protects registered files even
if the response was uncertain. Contract downloads require organisation management
access. No public contract URL, email sending, contract-generation template or
Contract Sent transition is enabled by the preparation foundation. The delivery
workflow still needs the requester’s choice between recording manual sending and
generating/emailing from an organisation template. The prepared append-only
`recruitment_contract_sent` migration has not been applied remotely.

Phase 6 adds **Contract Signed** through staff verification of a returned PDF.
As a prerequisite, an approved lead with a prepared contract can record prior
external delivery: the current version, recipient/contact, channel, date,
evidence/reference and confirmation that the version was already provided.
This records Contract Sent; the action does not send a message or verify provider
delivery. Automatic contract generation/email remains a separate unresolved choice.

At Contract Sent, staff record both the agent and organisation representative,
the date signing was completed, paper or external electronic signing method,
verification findings and the complete signed PDF (up to 10 MB). External
electronic signing requires a reference. Staff must confirm the delivered version
matches, all pages/annexures are present and both signatures are complete. This
records staff verification, not a cryptographic signature or automated legal
assessment. Dates must fall between approval, delivery, completed signing and today.

Signed PDFs use a separate private `recruitment-signed-contracts` bucket. Original
versions, delivery records, signed evidence and verification records are retained;
recording users/times are authored by the database. Current-version checks reject
stale saves. Unsaved contract findings block other writes; a failed save keeps the
findings and selected file in memory. Closing/reopening returns to the recorded
Contract Sent or Contract Signed stage. Onboarding/activation remain locked. The
append-only `recruitment_contract_signed` migration follows the contract preparation
migration and has not been applied remotely. Focused recruitment tests cover
organisation/role isolation, version linkage, partial signatures, dates, file
retention, stale saves, failure recovery and closure/reopening. No email, real
signature, deployment or remote database change is performed by these checks.

Phase 7 adds **Onboarding Complete** after a verified signed contract. A separate
private `recruitment-onboarding-documents` bucket holds the final joining pack
(PDF/JPG/PNG, up to 10 MB each). Documents append to a retained pack and start
awaiting review. Existing application-review documents and contract evidence stay
preserved. Uploads record the database-authored user/time; failed saves attempt to
clean up unregistered uploads, while registered files cannot be replaced or deleted.

Overview provides six joining checks: identity/contact, PPRA/FFC position,
qualifications/PDE, training/CPD arrangements, mandate/agency handover and
organisation induction. These are operational staff checks, not a new regulatory
certification. Each resolved item needs findings or a non-applicability reason and
can link to the final pack. Staff may save partial progress and information requests.
Uploading another file preserves saved findings and adds an awaiting-review entry.
Completion requires all six checks resolved, a nonempty reviewed document pack,
a valid agreed joining date (which may be future), completion findings and explicit
confirmation. It atomically preserves the checklist, pack and signed-contract
reference in an immutable completion snapshot with the database-authored actor/time.

Current-version checks protect uploads, progress and completion from stale saves.
Unsaved onboarding findings block other writes and uploads; errors keep those
findings in memory. Closing/reopening preserves progress and restores Contract
Signed or Onboarding Complete. The new `recruitment_onboarding_complete` migration
follows `recruitment_contract_signed` and has not been applied remotely. Agent
activation/account creation belongs to Phase 8; no email, deployment or remote
database change is performed by this implementation.

Phase 8 adds **Agent Activated** using Arch9’s existing canonical invitation and
organisation-membership workflow. From a completed onboarding record, management
records activation findings and confirms identity/access. An existing active agent
with the same email can be linked directly; recruitment does not alter their role,
branch, commission or profile. Otherwise the atomic recruitment RPC prepares a
standard `agent` workspace invitation and retains its ID, actor/time and findings.
The lead remains Onboarding Complete until the agent accepts with their own account
and staff select **Confirm agent activation**. Preparing or retrieving a link does
not send email or WhatsApp. Share the access link directly or manage delivery through
the existing user-invitation tools. Existing invitation acceptance creates/activates
the account membership; recruitment never silently creates credentials or grants a
higher role. Internal activation findings remain private to the recruitment record.

Activation validates the active agent membership, same organisation/email and,
where an invitation was prepared, acceptance by the same user. It requires retained
signed-contract and onboarding evidence. The database records the real membership,
user, role, actor/time and onboarding reference. Expired/revoked invitations can be
reprepared by confirming again; earlier preparation records are retained. Pending
retries reuse the prepared invitation, and retries after an uncertain successful
activation return the preserved result without another event. Duplicate invitation,
email and user links are blocked. A pending invitation for a privileged or different
role cannot be adopted. Closed leads must be reopened before activation; activated
leads are terminal, appear in Closed Leads and provide an **Open agent** link.

Unsaved activation findings block other writes and survive failed saves. Activation
records cannot be changed after completion; later offboarding and account changes
continue to use the existing agent directory. The append-only
`recruitment_agent_activated` migration follows `recruitment_onboarding_complete`
and has not been applied remotely. Focused checks use isolated database membership
and canonical-invitation fixtures; live invite acceptance/delivery and production
integration still need verification after an explicitly approved release. No real
account, access grant, email, deployment or remote database write is performed here.

### Recruitment joining record

The joining consolidation's Phase 2 adds a planned setup under **Agent Details**:
intended branch, agent role, business areas, commission structure and joining date.
The record retains its original entry point and source. These are planned choices;
saving them does not grant access or apply branch, role or commission changes.
Application invitations and workspace access invitations remain distinct, with
existing submission and invitation history visible on the record.

Creating a staff enquiry checks the email within the current organisation. An
active agency member opens their existing profile. Matching enquiries and pending
invitations require explicit review before a separate enquiry can be created;
records are never automatically merged. Staff can explicitly link an eligible
existing invitation while preserving its token, expiry and metadata. One invitation
cannot belong to two recruitment records. Retrying a creation uses the same receipt
key. Joining choices are locked once access is prepared, and unsaved choices block
other recruitment writes.

The append-only `20261008114647_recruitment_joining_record.sql` migration follows
the existing contact, questionnaire and verified application submission migrations.
It grants management only the receipt's lead/link relationship; sender fingerprints,
consent payloads and applicant sessions remain private. Old records are preserved,
with their joining origin marked as an existing record on their first plan edit.
Phase 3 connects **Invite new agent** on Agents and Branch staff to the same
Recruitment capture form. Branch staff preselects its branch, and the record keeps
the entry point. After saving, staff can prepare and copy an application link or
open the saved record. Link preparation can be retried without creating another
record. Recruitment can still capture an enquiry without preparing an invitation.
Existing staff access invitations remain a separate action.

Agents and Branch staff show a separate **Joining** list with the saved stage,
next action and a link to continue the record. These applicants do not enter the
staff directory or its active-agent totals. Progress is scoped to the current
organisation and, on Branch staff, the intended joining branch. Only existing
recruitment managers can see this progress; branch-manager recruitment initiation
and privacy policy belong to a later phase.

Phase 3 requires no additional migration. Apply the Phase 2 migration before
releasing the updated app through an explicitly approved database release.
Preparing an application link does not send email or grant workspace access.

Phase 4 adds a final joining review before workspace access is prepared. Save an
active branch, supported business areas and joining date in Agent Details first;
review the agent/senior-agent role and commission structure (or explicitly review
no assigned commission). The reviewed plan is preserved with the access receipt.
Ready for access, Awaiting acceptance and Active remain separate states.

The append-only `20261008125501_recruitment_activation_handover.sql` migration
uses the canonical invitation create/accept workflow. A compatible live invitation,
including an explicitly linked branch invitation, is reused unchanged. Expired
access gets a new receipt while retaining its history. Invitation preparation
creates no membership, commission profile or email. On acceptance, the existing
account receives the reviewed business access, commission and joining date in the
same transaction as membership creation. Conflicting existing access or commission
rolls back acceptance rather than silently replacing staff setup.

Final activation verifies the account, agency, branch, role, business access,
joining date and commission before closing recruitment, and links to both the
agent profile and branch staff. Retries retain the existing membership and audit
record. Already prepared legacy invitations retain their original access contract;
existing activated records are not rewritten. Phase 4 initially restricts handover
to agent and senior-agent roles; Phase 5 below adds Commercial brokers and routes
transfer requests to the existing staff workflow.
Apply the Phase 4 migration after Phase 2 during an explicitly approved release.
The app uses a dedicated handover endpoint, so a missing Phase 4 migration blocks
preparation instead of falling back to the earlier standard-agent invitation.

Focused verification: `npx vitest run src/pages/recruitment/__tests__`. Database
tests exercise the migration in isolated Postgres, including permissions, existing
website intake, retries, duplicate review, invitation preservation and activation
rollback. No remote database change, invitation delivery or deployment is performed
by these checks.

Phase 5 connects the remaining agent entry points and exceptions in the primary
workspace. **Settings → Team & access** defaults agent invitations to Recruitment,
carrying the contact and planned business/commission choices. **Commercial → Brokers**
defaults new brokers to the same form with Commercial role and business access.
Its setup wizard also captures recruitment without discarding the enablement draft.
New broker team/specialisation choices follow activation; existing broker access
retains the existing Commercial invitation form and metadata.

| Entry avenue | Destination and authority |
| --- | --- |
| Agents, toolbar/mobile Add Agent | Shared Recruitment capture; same organisation and selected branch |
| Branch staff: new agent | Principal/admin/owner uses full capture; branch manager submits basic contact for their own active branch |
| Settings: new agent | Shared Recruitment capture, preserving contact and planned setup |
| Agency setup: new agent | Stable joining receipt with agency setup origin; no access invitation or invite email |
| Commercial Brokers and Commercial setup: new broker | Shared Recruitment capture; broker role and Commercial business access |
| Commercial Brokers: branch manager | Basic contact capture for their own branch; planned broker destination; principal reviews and approves joining setup |
| Website / Join Us | Existing verified contact/application journey, stored in Recruitment with website origin |
| Public campaign/application link | Existing public intake; campaign source retained, no staff membership grant |
| Private application invitation | Continue the existing enquiry and evidence journey; preserve its original joining source |
| Existing or returning staff access | Explicit separate access purpose, canonical invitation/acceptance and existing identity/history |
| Support staff or principal access | Existing staff invitation or principal claim/approval process |
| Agent transfer | Existing staff profile and transfer wizard; Recruitment does not rewrite memberships, operational ownership or commission |

Branch progress uses bounded RPCs returning only same-branch name, stage and access
state. Branch managers cannot open recruitment records, view documents, applicant
answers, review findings, commission choices or approval controls. Duplicate contact
matches require principal review without exposing matching private records. They
cannot choose privileged joining roles, prepare access or approve an application.
Captured enquiries are normal joining records visible to agency management, with
stable retry receipts and database-authored origin. Owners receive the same
organisation-scoped recruitment permissions as principals; support staff do not.

The append-only `20261008131645_recruitment_entry_avenues.sql` migration follows
Phases 2 and 4. Commercial activation requires the agency's active Commercial module
and a consistent broker role/business plan. Canonical acceptance applies the module
marker alongside the previously reviewed branch, business access, commission and
date. Verification checks the broker marker before closing Recruitment. The final
receipt opens the broker profile and Commercial branches. The app uses a distinct
activation endpoint so missing migration support blocks preparation.

Agency creation remains its existing atomic operation. New-agent enquiries are
confirmed afterwards with stable setup receipts; an uncertain handover keeps the
local draft and reports retry instructions. Matching enquiries or memberships are
preserved for explicit management review. Staff/support invitations retain their
existing delivery workflow. Deploying the app or applying the migration still
requires an explicitly approved release; local checks do not deliver real email or
write remote data.

The joining consolidation's **Phase 6** adds explicit application and workspace
email delivery in Recruitment. A private application email requests an application
and grants no staff access. Workspace access emails use the canonical invitation
already prepared from the reviewed joining plan. Creating either link sends no
email. Staff choose **Send invitation email**, refresh its status or explicitly
send another email. The application URL is shown only at creation; paste the
original private link to send it again. If unavailable, revoke that link and create
a new one for the same enquiry. Public/website campaign links are not bulk emailed.

Delivery receipts distinguish link preparation, email-provider acceptance, failed
sends and uncertain results. Invitation expiry, revocation, application submission
and workspace acceptance are read from their canonical records. Provider acceptance
is not inbox delivery; no delivery or bounce webhook is claimed. Historic sends
without the new receipt remain unconfirmed. Agents, Branch staff and Commercial
Joining lists show the same safe progress summary, with appropriate next actions.
Branch-manager summaries retain branch scope and contain no contact, application,
review, commission or private email content. Newly prepared Recruitment workspace
resends from branch/directory tools use this delivery process; existing staff and
legacy invitation tools retain their previous workflow.

The server verifies the signed-in manager and rechecks agency, lead stage, live
invitation, recipient, role, branch and Commercial module before acquiring an
attempt. It derives email content and the URL host from saved records and configured
application settings. Browser clients cannot write provider receipts or read the
private request body. Server-only frozen email snapshots and provider idempotency
keys recover uncertain attempts without changing the email or adding another lead,
invite or membership. A 60-second lease prevents concurrent sending. Retries stop
at 23 hours, within [Resend's 24-hour idempotency window](https://resend.com/changelog/idempotency-keys).
An uncertain result beyond that window requires staff review and explicit
acknowledgement before another email. A new acknowledged send preserves the old
receipt. Sending failure leaves the joining record, evidence and planned access intact.

Release requirements for this consolidation:

- Apply the reviewed joining-record, activation-handover and entry-avenues
  migrations in dependency order, followed by
  `20261008135223_recruitment_invitation_delivery.sql`. Use the existing database
  release runbook and guard; include only the approved migration scope.
- Release the `send-email` function with its new `recruitment_invitation` handler
  and the primary application together. Required server settings are working
  `RESEND_API_KEY`, Supabase service/anon keys and an HTTPS `CLIENT_APP_URL`
  (or the existing supported application URL setting), plus a verified email sender.
- Capture target identity, pre-change definitions and recovery evidence under
  `docs/database-release-runbook.md`. Keep the previous app/function release available
  for rollback; preserve delivery receipts and joining evidence.
- After explicit release approval, verify hosted RPC permissions and private-body
  restrictions, then use approved controlled recipients for actual delivery and
  acceptance with both new and existing accounts. Check expiry/recovery, branch
  restrictions, Commercial access and a preserved legacy invitation. Confirm inbox
  receipt separately from provider acceptance and final membership verification.

Local verification uses the actual Recruitment/canonical-invitation SQL in an
isolated PostgreSQL fixture, component/service tests and injected email-provider
responses. `npm run check:app` is the build-ready gate. Public website source is
unchanged. This implementation does not apply remote migrations, send real email,
deploy, or establish that a real agent has completed the live journey.

### Mobile sales listings

Agents and developers can open **Menu → Listings**, browse their accessible active
sales listings, search and filter the full inventory, or continue saved drafts.
Photo cards show saved price, address, unit number, beds, baths and floor/erf size;
unrecorded values remain visibly unknown. Inventory reads retain organisation and
assignment scope and paginate beyond the API's first page.

**Create new listing** reuses the full listing editor in six mobile steps, with
large inputs, draft recovery, photo ordering/cover selection and a final review.
Developers begin with development, unit and sales assignment. Saving waits for
property and marketing persistence; retries retain the original record. Mobile
channel choices save preferences; portal submission remains separate. Rentals
retain their existing creation workflow.

Focused checks:
`npx vitest run src/pages/mobile/__tests__/MobileListingsPage.test.jsx src/pages/mobile/__tests__/MobileListingFields.test.jsx src/pages/mobile/__tests__/MobileListingWizardKeyboard.test.jsx src/services/__tests__/mobileListingsService.test.js`,
`node --test src/services/__tests__/privateListingService.mobileInventory.test.js`,
`npm run test:direct-listing-persistence-phase3`, and
`npm run test:mobile-shell-routing`.

### New lead emails to allocated agents

Each new agency CRM lead commits an email job in the same database transaction.
This covers Property24, Private Property, Meta Lead Ads, manual capture, show days,
digital business cards and QR forms, including intake that bypasses the browser.
The worker resolves the saved lead's active allocated agent inside its organisation.
Its branded email includes the contact, source, property and an **Open lead** link
to the sales or rental workspace, with a friendly first-name greeting. Stock
communication wording uses no long dashes. Email delivery does not block capture.

Enquiry ingestion defers the alert until automatic assignment finishes and
suppresses the preliminary assignment email for new leads. Existing lead
reassignment alerts remain active. Both Property24 import paths queue the agent alert
for phone-only enquiries and attempt the agent alert even if a customer
acknowledgement fails. Completed duplicate imports and persistence repairs do
not create another new-lead job. Historical Property24 recovery and historical
Meta imports are suppressed at insertion; this release does not backfill old leads.

`lead_agent_email_jobs` is service-only. Every provider attempt uses the same
frozen email and job key, with leased claims, interrupted-claim recovery, backoff
and at most eight attempts within 23 hours of the first attempt. An acceptance
ID is required before recording `sent`; `queued` never means delivered. Provider
acceptance does not prove inbox delivery. Missing or invalid agent details keep
the agent job waiting and queue a manager alert. Later assignment wakes the agent
job. Fallback recipients are active members of the same organisation; branch
managers must match the lead's branch. Exhausted retries or an unavailable manager
create a high-priority **Review lead email delivery** task. Jobs overdue by
15 minutes also get a task while remaining retryable, including missing worker
credentials or configuration. Frozen recipients who
lose access are stopped for review, rather than changing the provider request.

Website principal alerts and their configured inboxes retain their receipt/outbox
flow. The shared queue supplies the allocated agent email where the website only
notifies its principal, and delegates where the website already owns that agent
alert. Website jobs require explicit provider acceptance and route rental links
to rentals. Terminal interrupted website attempts for newly captured leads are
reconciled once into management follow-up and tasks; old receipt backlogs are
excluded. General website enquiries without an allocated agent first reach
management, then the agent when assigned.

Release together, after approval for the named target: migration
`20261008173528_durable_lead_agent_email_outbox.sql`, Edge Functions `send-email`,
`lead-agent-email-dispatcher`, and `website-lead-dispatcher`, plus the primary app
changes for Property24's historical-import marker and queue reporting. Follow
`docs/database-release-runbook.md` and run the database guard and exact dry run.
Verify `RESEND_API_KEY`, a verified internal sender, `LEAD_OPERATIONS_EMAILS_ENABLED`,
`ARCH9_APP_URL`, and matching Vault `arch9_project_url` / `arch9_service_role_key`.
The new cron job is `arch9-lead-agent-email-dispatcher-1m`; retain and verify the
existing website dispatcher schedules. Check job progress and authorised test
emails from each enabled source after release. Portal credentials, Meta form
mapping, website publication and active agent email addresses must be configured
for their intake paths. Resolving a terminal task requires checking provider
receipts before manually replaying a job outside its deduplication window.

Focused verification: `npx vitest run src/services/leads/__tests__/newLeadAgentNotificationService.test.js src/lib/__tests__/agencyCrmNewLeadNotification.test.js src/services/__tests__/leadIngestionAgentNotification.test.js src/services/__tests__/leadAssignmentNotificationControl.test.js`,
`node --test server/tests/leadAgentEmailOutbox.test.js server/tests/property24LeadNotifications.test.js server/tests/homeSeekersLeads.test.js`,
`npm run test:lead-ingestion`, `node scripts/lead-assignment.test.mjs`, and
`node scripts/property24-phase7-lead-import.test.mjs`. These tests use mock email
delivery; no real agent email is sent. The outbox suite executes the new migration
and the real Private Property, Meta and website capture functions in isolated
PGlite databases. Also run the Deno tests in `_shared/leadAgentEmailDispatch.test.ts`,
`send-email/services/leadAgentEmailQueue.test.ts`, `_shared/websiteLeadDispatch.test.ts`
and `website-lead-dispatcher/index.test.ts` with local fixtures only.

### Buyer and seller lead intro emails

Migration `20261008180125_durable_buyer_seller_lead_introductions.sql` extends the
same service-only queue with a separate `client_intro` job for each new agency
buyer or seller lead. Source does not gate delivery: Property24, Private Property,
Meta, websites, digital cards, QR forms, show days and manual capture use the
same database trigger. Tenant and landlord classifications keep rental wording;
tenant intros retain the expiring qualification link. Seller intros discuss
selling and valuations, rather than buying or arranging a property viewing.

Client delivery is independent of agent assignment and of the agent alert's
delivery state. The recipient comes from the saved contact in the same
organisation. Missing or invalid email addresses create a follow-up task and
wait; adding an address or linking the contact wakes the job. A recipient change
after an attempted send stops automatic retries for review. Each client job uses
the existing frozen-envelope, lease, eight-attempt/23-hour retry and acceptance
receipt controls. Existing intake requests now inspect this queue instead of
sending an additional intro. Historical imports and old leads are not backfilled.
Provider acceptance is recorded separately from inbox delivery.

Home Seekers' enabled custom seller design is retained. Its website principal
alert stops sending a second client email when a durable client job exists.
Event RSVP confirmations without a lead keep their existing communication flow.
The client worker uses `LEAD_INTRO_EMAILS_ENABLED` (default true), independently
of `LEAD_OPERATIONS_EMAILS_ENABLED`; it still requires configured provider and
sender credentials. Release the new migration with the updated `send-email`
and `lead-agent-email-dispatcher` functions, alongside the preceding agent queue
release. Production application and authorised live email tests remain separate.

Focused checks: `node --test server/tests/leadAgentEmailOutbox.test.js
server/tests/property24LeadNotifications.test.js server/tests/homeSeekersLeads.test.js`
and the Deno queue/dispatch, lead acknowledgement, qualification-link and branded
template tests. All use isolated databases or mocked email providers.

## Company performance totals

Organisation → Branches shows current sales pipeline value, active transactions,
current sale/rental listings and the active team (including leadership and staff).
The period controls change the activity beneath these totals, not the current stock.
Rental monthly prices are excluded from the sales pipeline value. Company users
include stock awaiting branch allocation; restricted users retain their branch scope.

Company reads filter by the resolved organisation and page in stable order. Missing
optional columns use compatible selects; failed reads show an error rather than
valid-looking zero totals. The queries no longer request the obsolete transaction
`status` and listing `mandate_expiry_date` columns. Refresh failures keep the last
successful figures labelled with their loaded period. Workspace changes discard
late responses and hide the previous company's data.

Focused checks: `npx vitest run src/services/__tests__/agencyCompanyOverview.test.js
src/pages/agency/__tests__/AgencyBranchesCompanyPerformance.test.jsx` and
`node src/services/__tests__/agencyBranchMetrics.test.js`. All use local fixtures
and send no email or database writes.

## Branch staff allocations

Branch → Staff calculates each member's current listings and open transactions
directly from branch records, including owners, principals and support roles.
Current listings include sale/rental working stock and drafts; sold, withdrawn,
archived and cancelled stock is excluded. Workload counts are independent of
the reporting period. The labelled commission amount uses actual agent splits
for registrations in the selected period. Missing reads or missing splits stay
unavailable rather than becoming zero. Pending invitations have no performance
figures. The sales-agent leaderboard retains its own role eligibility.

Staff ownership prefers an explicit assignee ID, then a legacy assignee email.
Creating a record for someone else does not count as owning their allocation.
Both branch and organisation boundaries are retained. Focused checks:
`node src/services/__tests__/branchStaffMetrics.test.js` and
`npx vitest run src/pages/agency/__tests__/BranchStaffAllocations.test.jsx`.
These checks use local fixtures and make no remote writes or send invitations.

### Listing capture validation (8 October 2026)

Sales and rental capture now check fields on their owning page. Agents can select
publication channels at the start, so portal requirements appear before they fill
Property details, Rental terms or Marketing. Continue, forward progress clicks
and the final submit cannot bypass incomplete earlier pages. Save draft retains
its existing recovery path and does not require publication-ready photos or
signed mandate/FICA evidence.

Each issue links to the exact field or container, expands address details or the
appropriate feature dialog, focuses its input, and shows the correction beside
it. Saved listing channel issues carry their message into the same editor target;
portal account and agent-mapping issues retain their settings destination.

Capture checks include Private Property's three-photo minimum, address details,
confirmed bedroom/bathroom counts (zero is accepted), description restrictions,
positive pricing, valid rental dates and amounts, future Property24 expiry and
category support. Residential floor size remains optional. Property24 category
and type rules reuse the server's pure contract; the authoritative server check
still verifies account/location mappings and prepares media before publishing.
This change owns only the primary app and requires no database migration.

Focused verification:
`node --test src/services/listings/__tests__/listingCaptureValidation.test.js src/services/rentals/__tests__/rentalListingReadinessPresentation.test.js`,
`npx vitest run src/pages/rentals/__tests__/RentalListingCreatePage.save.test.jsx src/pages/mobile/__tests__/MobileListingWizardKeyboard.test.jsx src/pages/mobile/__tests__/MobileListingFields.test.jsx`,
`npm run test:direct-listing-persistence-phase3`,
`npm run test:property24-commercial-listing-readiness`, and
`npm run test:public-listing-readiness`.

Release verified at `https://app.arch9.co.za` on 8 October 2026: runtime commit
`51956d7b7ad978c8b598679b711b6e331126a94d`, Vercel deployment
`dpl_8YttRkA1JVctbyScZNjapuQSrKM6`. This includes the already-live Home Seekers
commit `80d1180f840863e66930a9051b0c41494bf47cc9`; the rollback deployment is
`dpl_EGXGLggC5oEcyLNxXmXra9gfwSev`. No migration or live listing write was performed.
The primary app check, exact-source production build, 57 focused tests, local
desktop/mobile capture interactions and all 830 deployed critical assets passed.
The live app shell identifies the same runtime commit. Signed-in production
capture was not retested because no authenticated browser was available.
The older `test:listing-portal-readiness-phase5` source-text assertion still expects
the previously removed rental readiness grid; use the focused behavior checks above.
