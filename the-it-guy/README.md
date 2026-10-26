# bridge.

**Production update — 15 October 2026:** The approved all-local Arch9 release
is live, including the four remaining landlord profile migrations. Current
deployment details, verification and provider limitations are recorded in
[the production release record](../docs/arch9-production-release-20261015.md).
Earlier local-phase notes below retain their original verification boundaries.

Local development and Vitest use separate Vite cache directories:
`node_modules/.vite-dev` and `node_modules/.vite-vitest`. This keeps a test run
from replacing dependencies referenced by an already running development server,
which can otherwise cause lazy-loaded pages to fail to load.

Primary app builds default to a 4 GB Node heap to keep builds responsive on
8 GB development machines. Set `NODE_OPTIONS` explicitly to override this limit.

## Buyer journey

The overview’s next action opens its named workflow. Contact logging opens Activity,
viewing outcomes open the completion form, sending onboarding sends the invitation,
and manual capture opens the shared form. Each active action has “Mark as completed”:
contact and qualification use their saved completion handlers, viewing uses an audited
manual completion with a reason, and later stages refresh and validate their actual
delivery, submission, signed OTP, transaction or document evidence. Missing evidence
keeps the stage open and explains what to finish. A completed journey opens the
transaction instead of offering another completion.

Focused checks: `node src/services/__tests__/buyerNextActionCompletionService.test.js`
and `npx vitest run src/components/journey/__tests__/JourneyStageOverrideActions.buyer.test.jsx --maxWorkers=1`.

All agencies, including Kingstons, share this journey:
Captured → Contacted → Qualified → Viewing → Buyer onboarding sent →
Buyer onboarding submitted → Offer to purchase signed → Transaction created →
Buyer documents uploaded.

Sent and submitted onboarding are separate milestones. A prepared link or pack
alone does not prove delivery, and a draft onboarding transaction does not finish
the transaction milestone. Signed OTP evidence and all applicable required buyer
uploads are tracked independently; earlier uploads still count. Missing, rejected,
expired, or unmatched files keep the document milestone open. Organisation-specific
legal terms and development unit reservations retain their existing routing.

The header’s Buyer Readiness percentage and completed-step count use the same
evidence-backed milestones as the Buyer Journey, including onboarding and documents.
It reaches 100% when every journey step is complete.

Until onboarding is submitted, Buyer Profile shows contact details and the onboarding
actions only. The full onboarding sections and verification appear after submission.
Buyer Profile starts with the onboarding actions, followed by contact details.
The Offer tab is retired. Documents owns signed OTP upload and viewing; the Buyer
Journey’s Transaction setup action owns the setup checklist and transaction creation.
Old Offer/OTP tab links open Documents, and old onboarding links open Buyer Profile.
It offers sending onboarding and manual capture. Manual capture opens
the same active onboarding form and saved record as the buyer link. Sending catches
up the earlier journey steps and awaits actual submission; opening manual capture
does not mark onboarding sent or submitted.

The buyer overview pairs the property enquiry with a preferred viewing times card.
It shows buyer-submitted options and notes and distinguishes preferences from confirmed
appointments. The bottom Viewing Planner is temporarily hidden; viewing actions open
Appointments. Activity capture remains in Activity.


Matches populates automatically using the buyer’s preferred areas and the existing
enquiry price band. With no preferred areas captured, it uses the enquiry property’s
city and suburb. Matches refresh when those details change. Missing search locations
show a prompt to add buyer areas or link an enquiry property; they do not show
price-only recommendations. Listings without the selected location details are excluded.

Location check: `node src/pages/agency/__tests__/buyerMatchLocationModel.test.js`.

Focused checks: `npm run test:buyer-leads-journey-alignment-phase7` and
`npm run test:buyer-process-definition-phase1`.

## Seller lead capture

Add Seller Lead opens with first name, surname, phone, email, property address,
the standard source dropdown and the lead team. Select one primary agent and
optional supporting agents through the existing lead assignment model. Owner
details reuses that contact; linking Owner 1 avoids retyping the same contact.
Ownership and mandate choices use two columns. Seller permissions and declarations
are completed by the seller in onboarding, rather than recorded in this modal.
Owner details, Property details and Documents are optional tabs. Answers autosave
after an 800 ms typing pause, including source, priority, additional agents and
reported seller progress. The status confirms saving or explains an unsaved draft;
typing and tabs remain available during background saves. Closing flushes remaining
changes before returning to the lead list; opening and closing an untouched form
does not create a lead. Offline edits save when the connection returns, and failed
saves keep the form open for retry. The primary agent follows the existing lock once
the lead is created. Save lead remains available from every tab to finish capture.
Property details starts directly with the fields. Documents shows one preparation
action, then compact upload rows and saved-file statuses. Optional seller progress
is under Lead Details. Save lead skips document preparation and unchanged drafts;
new intakes use the guarded save without redundant onboarding lookups. Confirmed
contact, lead summary and agent writes run together, retaining successful writes
when retrying. The existing seller record, partial-save rules, document uploads
and review gates are reused. Documents can save the details first without closing
the modal. Saved
answers feed the lead's Seller Profile and Property tabs, the linked listing,
seller onboarding and seller portal through the same onboarding record.
Focused checks: `SellerLeadCreateDialog.test.jsx`, `SellerOnboardingCapture.test.jsx`
and `sellerLeadCaptureService.test.js`; save guards and CRM notification reads are
covered by `privateListingService.sellerAccess.test.js` and
`agencyCrmNewLeadNotification.test.js`.

## Seller onboarding differences from a draft listing

Submitted onboarding now preserves the agent's saved draft property values before
the seller answers update it. Lead Property and Listing show a review notice.
The existing onboarding review compares address, property type, asking price,
rooms, parking, sizes, rates and levies. Agents accept each seller answer or
request clarification through the existing onboarding link. The original draft,
reviewer and accepted values remain in the audit history. Revised answers require
a fresh decision; an empty answer cannot erase an existing disagreement.
Unresolved differences block onboarding approval and publication to the public
catalogue, agency/partner websites, Property24 and Private Property, including
queued publication. Existing submissions are not backfilled with guessed drafts.

Focused check: `npm run test:seller-onboarding-draft-review` and
`npm run test:seller-onboarding-review-handoff`. Release
`20261013140956_seller_onboarding_draft_discrepancy_review.sql` before the primary
app/API change. This change has not been applied remotely or deployed.

## Seller lead property profile

Seller Lead → Property shows section and unit numbers for sectional-title or
share-block properties. Full-title, freehold and agricultural properties omit
these rows even when old sectional data remains saved. Empty estate/scheme rows
are hidden unless applicable; captured full-title estate names remain visible.
The property editor follows the same title-type rule. Occupancy rows follow the
saved status: tenant/lease details appear only for tenant or partially occupied
properties, using onboarding's tenant name, lease checkbox and expiry date.
Owner-occupied homes omit these rows. Empty optional viewing/access/vacancy rows
are hidden, and occupancy labels use plain words. Saved answers remain unchanged.
Focused checks:
`node scripts/seller-lead-property-workspace-marketing-media.test.mjs --property-profile-only`
and `node scripts/seller-lead-listing-prefill-alignment.test.mjs`.

## Seller signing pack preparation

Seller onboarding review distinguishes the legal owner from the contact and
explains why company owners need beneficial-owner details. Missing people and
missing fields within each person are listed separately, including the row number.
Review and submission use the same required-details checklist. Incomplete answers
offer **Save draft and finish later**; complete answers offer **Submit to agent for
review** (or **Submit seller details** for agency-assisted capture). Saving confirms
that the draft has not been submitted. Filled-in details remain subject to agent
and supporting-document review. The review contains one final action; the ordinary
draft action remains available. This messaging change is prepared locally and has
not been deployed. Focused checks: `SellerOnboardingCapture.test.jsx`,
`sellerFicaOnboardingFields.test.js` and `sellerOnboardingReview.test.js`.

Seller onboarding's final review keeps document uploads in agent-assisted manual
capture. Sellers see one **Next: your seller portal** card explaining that their
private portal link is where they upload supporting documents and track the
property. The final selling-context summary and repeated document/submission
explanations are removed. Portal upload behavior is unchanged. Focused checks:
`SellerOnboardingCapture.test.jsx` and `SellerLeadCreateDialog.test.jsx`.

Seller Lead → Prepare seller signing pack shows mandate terms when selected,
required signer names/emails and the preparation action. It omits the explanatory
cards, repeated signing routes and disclosure questionnaire. Saved disclosure
answers are reused; unanswered questions can be sent to the seller's private
signing link. The seller completes and saves the questions, reviews the updated
copy, then signs. Every required owner signs that same version.

Disclosure answers update only the unsigned disclosure copy and lock after its
first signature. A prepared mandate or a signature on FICA does not block filling
in the disclosure. Submitted onboarding facts, signer identities and other copies
remain unchanged. Listing Documents also sends online disclosure preparation to
the seller; its separate physical-copy answer editor remains available.

Release `20261013101510_seller_portal_disclosure_completion.sql`, the
`seller-portal-document-signing` function and the primary app together. This change
has not been applied to a remote database or deployed.

Focused checks: `node scripts/listing-seller-canonical-update.test.mjs`,
`node scripts/seller-document-corrections.test.mjs`,
`node scripts/seller-document-journey.test.mjs --disclosure-only` and
`vitest run src/pages/__tests__/SellerDocumentSigning.test.jsx --maxWorkers=1`.


## Portal Manage popups

Existing Private Property adverts offer **Save and update Private Property** for
sale and rental listings. This saves pending sale details, runs the required
checks and sends to the existing advert. Rental updates run a fresh requirements
check automatically. A required sale channel review shows only Private Property;
**Continue update** resumes the original request, while closing cancels it.
Existing Property24 and Private Property rental adverts also run a fresh check
from either Update listing or the Manage dialog update action. Valid updates
continue automatically; failed or blocked checks show the specific issue and
send nothing. Existing update actions do not depend on a previous manual Check,
and one submission lock covers the check and send to prevent duplicate clicks.
New advert publishing retains its separate readiness review.
Other advert actions sit under **More actions**, and the main update is visible
first on mobile. New advert publishing retains its existing confirmation.

After acceptance, Arch9 checks the portal status once and shows Accepted,
Processing or Needs attention. A failed status check retains the accepted send
and asks for a status check before resending. An active advert still needs a
public-page check to confirm the latest content. This update is prepared locally
and has not been deployed. Focused checks: ListingChannelManageDialog component
and integration suites, RentalPortalManagementPanel and
RentalListingDetailPage.overview; the existing local browser check covers the
single-action desktop and mobile flow with external requests blocked.
Verification on 15 October: 136 focused tests and 24 browser checks passed,
as did lint and the baseline tests. The normal production build and a 4096 MB
heap-limit retry were both terminated by the system (SIGKILL); a completed
production build is still required before release.


Listing → Marketing opens a separate Manage popup for each channel. It shows
that channel's saved status, advert reference, submission/check times, pending
changes, errors, warnings and recent activity. Update and retry target that
advert; Sold and Under offer explicitly update the whole listing and its active
channels. Relist retains the selected portal and existing advert identity.
Property24 offers expiry and extension; Private Property offers withdrawal and
reactivation, without an unsupported Expired action.

Property24 and Private Property popups also let agents add or edit a live advert
URL. Only HTTPS advert pages on the selected portal's domain are accepted.
Saving a URL updates the saved link without sending a portal update or marking
the advert live. Website public links continue to follow their publication URLs.
Leave the field blank and choose **Remove link** to clear the portal URL and its
matching external-link entries while retaining the advert reference and status.
Old activity URLs do not restore a removed link in Manage. This removal correction
is prepared locally and has not been deployed.

Focused checks: the ListingChannelManageDialog component and integration suites,
ListingRelistDialog and listingChannelManagement/Relist service suites,
`node scripts/listing-quick-actions-phase4.test.mjs`,
`node scripts/property24-expire-listing.test.mjs`,
`node scripts/listing-channel-update-state.test.mjs`, and
`node scripts/listing-channel-manage-browser.test.mjs`. The browser check uses
local portal doubles and blocks external requests; it does not publish adverts.

Portal review and submission save property content only when it has unsaved
changes. The publishing service records the portal reference and status; the
browser reloads that receipt instead of saving the seller profile again with
its previous revision. This prevents Arch9's own review or submission save from
causing a seller conflict. Genuine conflicts on unsaved changes still block
submission. Covered by the ListingChannelManageDialog integration suite.

## Address search across capture forms

Full address entry uses the existing Google Places search in seller and owner
profiles, rental capture and applications, legal forms, offices, developments
and contact capture. Plain string fields retain their saved keys and validation;
location forms fill the available street, city, province and postcode fields.
Manual entry remains available. Google loads on interaction, and a delayed
selection cannot overwrite newer typing. Uncontrolled fields follow form reset.
Office/address meeting locations use search; phone and video details keep their
existing controls. The Operating Console reuses the same control and needs
`VITE_GOOGLE_MAPS_API_KEY` in its build environment.

Seller lead Address, seller property Search address and Address line 1 also use
this control. Selecting a result fills street, suburb, city, province, postcode
and the saved place ID together; manual edits invalidate that place ID, and
clearing the selected address cannot restore its old formatted value. Branch
office setup (agency, commercial and bond), mobile physical appointment locations,
legal task appointments, development event venues and launch venues share the
same search. Phone/video appointment details retain their ordinary text fields.
Google configuration and deployment have not been changed by this source update.
Suggestions render above scrolling forms when needed, remain selectable in modals
and dismiss with Escape before the containing dialog closes.

Rental tenant and landlord workspaces expose the saved listing link directly.
Older rental records also retain links stored in the CRM listing columns. Sales
lead and seller-link pickers keep their rental exclusions; existing owner and
managed-property selectors preserve saved documents and profiles.

Focused checks: `src/components/location/__tests__/AddressInput.test.jsx`, the
rental tenant/landlord workspace suites, `rentalCrmLeadModel.test.js`, and
`node scripts/address-input-browser.test.mjs`. The browser check uses synthetic
Google responses and local lead ingestion, blocks external requests, and covers
selected addresses, seller property fields, contact preservation, submission,
reset and mobile overflow. SellerLeadCreateDialog, MobileAppointmentWorkspace,
CreateInviteDrawer and DevelopmentMarketingEvents cover the affected capture flows.

## Multiple listing agents (prepared)

Sale and rental listing Overview now offers **Edit additional agents** below the
primary agent. Choose active agents from the same agency, then save. The primary
agent keeps ownership; additional contacts do not receive workspace permissions,
commission allocation or enquiry routing changes. Publish or update each portal
to send the saved selection. Saving contacts alone does not update an advert.

Property24 sends the primary contact first in `contactAgentIds`, followed by each
mapped additional contact. Private Property sends the same selection as a comma
separated `AgentId`. Missing/inactive mappings, another agency's contacts and
incorrect portal environments block submission. Private Property additional
contacts require exact user mappings in the primary contact's agency feed config;
branch defaults cannot substitute for a selected contact. Removing an unavailable
agent is supported. Concurrent saves require refreshing the assignment.

Apply `supabase/migrations/20261012180210_listing_additional_agents.sql` before
releasing the primary app. It adds an empty-by-default UUID array and validates
agency membership in a trigger, without changing existing listing access policies.
No migration, deployment or live portal submission has been performed here.

Contract evidence: the current [P24 v55 schema](https://api.property24.com/swagger/v55-listing/docs)
defines an integer array for listing contact IDs. The supplied Private Property
feed specification documents multiple IDs on page 14. PP distributes revisions
through [feed support](https://helpdesk.privateproperty.co.za/portal/en/kb/articles/getting-started-with-a-feed-integration);
the latest available revision has not been independently confirmed.

Focused checks, from `the-it-guy/`: `node --test scripts/listing-contact-agents.test.mjs`,
`node scripts/property24-listing-agent-reassignment.test.mjs`,
`node scripts/property24-publish-mapping-resolution.test.mjs`,
`node scripts/property24-phase2-mapper.test.mjs`,
`node scripts/rental-property24-backend-adapter.test.mjs`,
`node scripts/private-property-phase8-agent-mapping.test.mjs`,
`node scripts/private-property-listing-preview.test.mjs`, and
`npx vitest run src/components/listings/__tests__/ListingAgentReassignmentPanel.test.jsx`.


High-end React + Vite + Supabase transaction workspace for Samlin Construction.

## Printable mandate and signed upload

Seller lead Documents and listing Sale Documents offer **Create printable
mandate**. This opens the listing's manual-copy preparation with saved seller
facts and terms. Only missing commercial terms are requested; other saved terms
remain visible for review. Preparation saves a frozen reviewed copy before PDF
download and leaves FICA and disclosure unchanged. Upload signed copy saves the
returned file against its exact requirement and copy version; approval remains
a separate agent review. Conflicts are shown inside preparation with a read-only
refresh that retains the agent's edits. The retired packet generator and online
signing endpoints stay disabled.

Checks: `npm run test:listing-seller-canonical-update`, the PrintableMandateTerms
and document-action component suites, `node --test
scripts/document-generator-retirement.test.mjs`, `npm run
test:seller-document-journey`, and root `npm run check:app`.

## Listing publication recovery

A listing under review now explains that no adverts will be sent and directs the
agent to Seller and Documents, activation, then Review. An unconfirmed initial
publication request retains the saved listing ID and form instead of completing
the wizard. The forward migration
`20261012152243_seller_property_address_identity_reconciliation.sql` prevents
formatted addresses with repeated locality fields from resetting the mandate.
Different streets, cities, units and place IDs still retire property-specific
mandates. This correction does not restore an already-retired file or publish
existing listings. Checks: `node scripts/seller-listing-hydration-authority.test.mjs`,
`node --test scripts/create-listing-save-recovery.test.mjs` and the initial
publication service/editor Vitest suites.

## Seller onboarding review conflicts

Seller onboarding preserves explicit No answers for estate/HOA, levies,
document availability and property compliance when reopening or saving a file.
Older aliases populate only absent answers. Ownership locks use the same rule
and parse stored text values, so `"false"` does not lock the form. Current
correction requests take priority in the agent's progress summary; a historical
`mandate_signed` stage cannot replace current mandate signature evidence.
Existing review and signing history remains intact. Focused checks:
`SellerOnboardingCapture.test.jsx`, `sellerOnboardingJourneyStatus.test.js`,
`sellerPostOnboardingDocumentState.test.js`, `sellerDocumentRequirementEngine.test.js`,
`npm run test:seller-onboarding-flow-contract` and
`npm run test:seller-onboarding-review-handoff`.

Manual seller capture now carries the selected ownership route and its
confirmation into saved canonical facts and clears old pending flags. Existing
profiles with a recorded manual-capture source and selected ownership route are
recognised at document review. Unconfirmed legacy defaults still require an
ownership choice. Levies and water billing remain optional follow-ups across
manual and link onboarding and do not block approval or document preparation.
Identity, legal owner, authority, FICA answers and mandate terms retain their
existing checks. Focused checks: `sellerOnboardingReview.test.js`,
`sellerSubjectModel.test.js`, `sellerLeadManualCaptureModel.test.js`, and
`npm run test:seller-onboarding-flow-contract`.

Seller document approval and manual reminders use the portal context's text
listing ID for email-recipient lookup. Release the forward migration
`20261012150343_seller_document_review_portal_listing_text_id.sql` before testing
those actions live. It preserves ownership, exact-requirement, signing-version,
revision and audit guards and does not approve existing files or send mail.
The signed FICA declaration appears under FICA even when its legacy checklist
group is legal. Focused checks: `node scripts/seller-document-journey.test.mjs
--review-only` and `node scripts/seller-document-conditional-logic-phase2.test.mjs`.

Seller document rejection emails cover uploaded files and copies signed through
the seller portal. Both use the existing email queue, include the saved rejection
reason and use the current seller portal entry link. Signed history is retained;
the email explains that the agent must prepare a corrected copy for signature.
Inactive links are omitted, and missing seller emails never fall back to another
listing's recipient. Existing notification preferences remain in effect.

Release `20261013145642_seller_document_rejection_email.sql` with the updated
`send-email` function. The migration changes future decisions only and does not
send historical rejection emails. Released to production on 13 October 2026
with `send-email` version 173.
Focused checks: `npm run test:client-seller-offer-portal-notifications-phase5`
(real local SQL → email dispatcher, with a synthetic sender) and
`deno test --config ../supabase/functions/send-email/deno.json
--allow-env=CLIENT_APP_URL,PUBLIC_APP_URL,APP_BASE_URL,SITE_URL
../supabase/functions/send-email/handlers/clientSellerPortalNotification.test.ts`.

Review submitted seller onboarding keeps the displayed listing version with its
save revision. If another save changes that version, approval and correction
requests pause until the agent selects **Load latest seller details and keep
signing choices**. This read retains document routes and the correction note;
the agent must review the latest facts and approve again. A failed refresh keeps
saving blocked. Refresh does not save, approve, reopen seller onboarding, or send
signing links.

Focused check: `npm run test:listing-seller-canonical-update`.

## Buyer and seller document continuity checks (19 October 2026)

Buyer onboarding draft actions now prepare the canonical transaction document
room before opening or sharing onboarding. Linked buyer leads read, upload and
remove requirements in that same transaction context. Legacy `client` ownership
is treated as buyer ownership by the shared controls, without including seller
requirements. The portal uses persisted onboarding status while profile data
loads, and an absent shared checklist cannot display “all caught up” over an
outstanding saved checklist.

Pre-transaction buyer uploads retain their object and recovery reference after
an uncertain lead save. Direct conversion verifies all staged objects before
writing transaction mirrors. Onboarding upload metadata retains the actual
Storage bucket and buyer audience so saved files remain visible on the lead.

The append-only migration
`20261019210931_buyer_document_upload_continuity.sql` repairs the older buyer
portal upload RPC: require stored bytes, set the buyer audience explicitly,
reopen replacement review, update only the exact requirement and reject
ambiguous type-only matching. This migration is prepared locally and awaits
explicit production approval. It also corrects audience metadata on existing files only where exact buyer-upload provenance and the linked requirement prove buyer-only visibility; shared agreements and all stored bytes are preserved.

Focused checks: `node scripts/buyer-document-upload-continuity.test.mjs`, the
buyer lead staged upload/handoff/read tests, shared requirement read/command
and upload recovery tests, `DocumentRequirementManager.test.jsx`, portal
Phase 4 document trust tests and `node scripts/seller-document-journey.test.mjs
--review-only`. Existing seller continuity, requirement matching and upload
state checks also pass. These local checks do not replace hosted upload tests.

Live evidence is recorded privately in `output/document-flow-audit/`: the
approved synthetic QA buyer upload saved through the token-scoped portal API,
reopened against the same requirement and transaction, appeared in the buyer
lead read model, downloaded with matching SHA-256 and rejected an invalid token.
The production read-only audit found all 46 listing seller objects present,
no unpromoted files on already-linked transactions, and no orphan or mismatched
seller promotion links. A fresh hosted seller upload/conversion test and the
production migrations remain pending approval. Chrome’s native picker allowed
the buyer-lead browser test to reach the save command, where it reproduced the
legacy `client` audience constraint failure. The tested corrective migration
`20261019212951_buyer_document_requirement_audience.sql` normalises buyer/seller
aliases in both command uploads and later promotion. It preserves access,
identity, revision, receipt and Storage checks and awaits production approval.
No successful buyer-lead browser save or fresh hosted seller sign-off is claimed.

## Document upload feedback

Automatically created disclosure drafts and unsigned signing copies do not count
as uploaded files or enter the uploaded-file review queue. An untouched disclosure
offers generate/download, generate/send for signature and upload of an existing
signed copy. Draft download restrictions apply to that draft, not to uploading
evidence against its signed-document requirement. Actual uploads and active
signature requests retain their review and version checks. Focused checks:
`sellerDocumentWorkflow.test.js`, the untouched-disclosure projection regression,
and `SellerDocumentWorkflowActions.test.jsx`.

Seller uploads on listings, leads and contacts show progress through preparation,
transfer and saving, then **Uploaded** when the file and its record are confirmed.
Review and signing completion remain separate. Slow handoff or refresh work does
not hold that confirmation or turn a saved file into an upload failure.

Transfers time out after two minutes and record saves after thirty seconds.
An uncertain response keeps the recovery reference: retry checks the same file
and record before another write. No uploaded bytes are deleted after an uncertain
save. These limits bound the UI wait; they cannot establish that a timed-out
server request was rolled back. Subsequent view refreshes may still be pending.

Focused checks: the document upload recovery/progress tests in `src/lib/__tests__`,
the document requirement command tests, and the document progress/manager tests.

Rental landlord, tenant and listing uploads use the same progress and saved-file
confirmation as Sales. Landlord completion receipts use `documentId`; tenant
receipts use `document.id`. Both are confirmed independently of a later checklist
refresh. Landlord row uploads open the existing upload dialog so the action menu
cannot discard progress or retained files when file selection closes it.

Interrupted signed transfers are checked through the currently authorised rental
API. A confirmed missing object receives a new signed URL for the original path;
an uncertain or denied lookup cannot start another transfer. An uncertain save
retains its bytes and exact completion receipt. Unchanged tenant profiles are not
saved again before uploads or retries. Agreement, signature and move-in evidence
also use the shared recovery and progress contract. Existing rental file limits,
requirement generations, review rules and person/property links still apply.

Focused checks: `rentalApplicationFileUpload.test.js`,
`rentalLeaseDocumentUploadService.test.js`, `rentalDocumentUploadRecovery.test.js`,
`rentalListingDocumentWorkflow.test.js` and `RentalDocumentUploadControl.test.jsx`,
plus the shared document upload recovery tests. Storage transfer in local
acceptance uses an isolated fixture; hosted Storage acceptance remains a release
check. This repair changes no database schema and generates no documents. Release the
matching rental API and app together so signed-transfer recovery is available.

## Client audiences

Clients → Audiences offers starting points for Buyers, Sellers, Investors,
clients by area and clients by tag. Starting points open an editable draft;
nothing is saved until Save audience. Area, lead status and tag choices come
from the organisation's existing marketing contacts. Multiple selected values
match any value within one filter; separate filters match together.

Click a saved audience's matching-contact count, or View matching clients in
the builder, to browse all matches in pages of 25. Closing the matching-client
view preserves the builder draft. Membership uses the existing audience matcher;
campaign consent, suppression and delivery eligibility remain separate checks.
This version adds no nested segments or database changes.

Focused checks: `npx vitest run src/components/clients/ClientAudiences.test.jsx
src/services/__tests__/audienceFilterOptions.test.js
src/services/__tests__/clientAudienceMemberships.test.js --maxWorkers=1`.

## Client enquiry history

Client Overview shows distinct recorded enquiries and a Repeat enquirer badge
after two enquiries. The card shows the five most recent records, with View all
to expand the full history. It reads permanent client-to-lead links within the
organisation, then accessible enquiry logs; it does not match names or phone
numbers or merge profiles. Duplicate deliveries, duplicate reviews and failed
ingestion records do not increase the count. A linked lead with no ingestion
history contributes one enquiry. Missing historical records cannot be recovered,
and an enquiry's property is shown only when recorded on that enquiry.

Focused checks: `npx vitest run src/services/__tests__/clientEnquiryHistory.test.js
src/components/clients/ClientEnquiryHistoryPanel.test.jsx
src/services/__tests__/clientIdentityService.test.js --maxWorkers=1`.

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

## Development inventory

Availability is the shared inventory tab for development stock. Below its stats,
use the contrasting banner to choose Availability for the live unit list or
Interactive site plan for the map.
Both views retain the current filters and selected unit. Expand Manage units in
Availability for bulk setup, catalogue and structure tools, and inline unit edits.
Unit availability can switch between List and Cards without resetting those
filters or the selected unit.
Selecting a unit from List, Cards or the site plan opens a full-screen unit
workspace. Facts and pricing have room to read, while fixed Previous and Next
controls browse the currently filtered units. Close or Escape returns to inventory.

The development Leads tab switches between List and Kanban without changing the
recorded stages. Kanban retains source branding, property images, assigned agent,
last activity and the existing developer lead link. Buyer contact details remain
hidden for users who are not assigned to the lead. The total-leads pill is removed.
The board follows the Revo buyer flow from Captured through Transaction, with
Lost as a separate outcome. Editable cards support drag-and-drop and a keyboard/
touch Move to menu. Follow-up changes save the lead status under its owning
developer and reject concurrent changes. Reservation, onboarding, OTP and
transaction drops open the relevant workflow; they do not fabricate a reservation
or completed sale. Returning from the buyer workspace restores the development
Leads board. Existing confirmed reservations can move into the reservation column.

The development Transactions tab uses the same table and row styling as the
main Transactions module, with property, buyer, progress, agency and Open/Capture
actions. Search and stage filters retain development scope; transaction creation
and backfill use the existing workflows. Smaller screens show each row as a card.

Configuration groups settings under Development, Developer, Bond Originator and
Agents. The contrasting status bar links to general details, seller entity,
deposits, routing and team access. Existing save permissions and confirmations
for discarding unsaved edits remain in place; Advanced settings opens the danger zone.

The development Snags tab shows submitted lists as unit/owner cards with the
recorded handover date, a 90-day countdown and resolution progress. Submissions
and handovers are read only within the selected development using the signed-in
user's permissions. Purchases for the same unit remain separate; missing
handover dates stay marked as not recorded. View snag list opens submitted items
in a larger dialog. Search, status filters and Refresh remain within this development.
Focused checks: `node src/core/developments/__tests__/developmentSnags.test.js`
and `npx vitest run src/services/__tests__/developmentSnagsService.test.js`.

## Development marketing

The development Marketing tab combines listing records and marketing tools.
Its menu is Overview, Listings, Website, Media, Events and Campaigns. Listings
uses the shared listing card design; Website shows analytics only; Media includes
floor plans. Overview combines
listing performance across all linked agents and teams, with channel coverage,
unique buyer leads, viewings and average days on market above a horizontal listing
gallery. Missing statistics remain unavailable or partial; organisation permissions
are preserved. Readiness, activity, events and partner access panels are removed
from Overview. Older marketing section links open the
corresponding new section. The website preview does not publish changes.

Website shows sessions, scene views, property opens and enquiries using existing
tracking, with 7/30/90-day periods, refresh, selectable device breakdowns and
sortable rankings. Harbour Heights has a clearly labelled demo data option;
switch to Tracked activity to read recorded visits. Demo figures never write
visitor events. Website settings, publishing controls and brand panels are hidden
from this tab. Missing tracking remains unavailable rather than appearing as zero.

Events has large Create show day and Create launch actions, each opening a focused
form. Upcoming events and past event history show the date, time, venue, notes,
status and organising agent resolved from the existing event creator. Cancelled
events remain in the history. Event creation retains development permissions.

Campaigns replaces the Marketing Documents tab, including old `documents` links.
Email and WhatsApp actions use the existing campaign builders, with Meta marked
Coming soon. New campaigns retain development context in the existing JSON data:
email `content_json.arch9_context`, WhatsApp `parameter_values.__arch9_context`.
These values stay out of message rendering. History is scoped to the active
organisation and development, with drafts, sent results, delivery and engagement.
Lead attribution is not yet recorded and is shown as Not tracked. Existing
unlinked campaigns are not assigned to a development based on name matching.

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

## Rental lead Kanban

Rentals → Leads supports dragging an active card to its next stage and offers
the same action as a keyboard/touch button. Cards also expose Open and Mark as
lost through the existing lead menu. Stage moves wait for the saved service
result; skipped/backward moves and duplicate submissions are blocked. Viewing,
mandate, application and FICA milestones retain the existing workflow and
evidence checks. Closed and review-needed cards cannot be dragged forward.

Unrecognised saved stages appear in a first **Review needed** column and remain
filterable without rewriting their stored facts. Empty boards have clear
messages, and unavailable CRM data raises an error with the existing Refresh
action. View, role, search and filters are retained for the browser tab, scoped
to the current organisation, agent and permission scope. Changing that scope
remounts the board and discards superseded load responses.

Focused checks: `RentalLeadsPage.kanban.test.jsx`,
`rentalLeadService.list.test.js`, `rentalLeadListModel.test.js`, the existing
`RentalListingOverview.actions.test.jsx` and `rentalLeadJourneyService.test.js`
suites, and `server/tests/rentalLeadJourneyGuards.test.js`. No migration is
required. This source change has not been deployed or used to alter live leads.

## Lead capture from Kanban and listings

Sales lead lists, archives and summary counts exclude rental landlord and tenant
records even though the shared CRM retains legacy seller/buyer categories. Rental
records stay in the rental workspace. In long-term Rentals, the header Create menu
opens native landlord/tenant capture and rental listings, including from shared
pages with the Rentals business line selected. The Link seller lead picker applies the same
separation. `20261014114244_separate_rental_leads_from_seller_linking.sql` adds the
matching check inside the atomic linking function, including records changed after
search, and aligns listing-ID comparisons with the existing text column. It preserves
saved profiles, documents and links and has not been applied
remotely. Checks: `node src/pages/agency/__tests__/agencyLeadLandingMetrics.test.js`,
`agencyLeadListReadRepository.agentScope.test.js`, `listingSellerLeadLinkService.test.js`
and `node --test server/tests/listingSellerLeadLink.test.js`.

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

Existing sales listings include **Link to seller lead** below Seller Profile.
Search by name, email or phone, choose an available seller lead, then link it.
Linked listings show **Open seller lead**. The link preserves saved seller facts,
onboarding, signed documents, lead stages and assignments; it does not merge
profiles or replace an existing lead. Both directions are saved atomically under
the current user's listing and lead permissions. Repeated submissions are safe,
and records linked elsewhere after searching are rejected.
This requires the forward migration
`20261010223242_listing_link_existing_seller_lead.sql` before release.
Focused checks: `npx vitest run src/components/listings/__tests__/ListingSellerLeadLinkPanel.test.jsx
src/services/listings/__tests__/listingSellerLeadLinkService.test.js` and
`node --test server/tests/listingSellerLeadLink.test.js`. They use local fixtures
and an isolated PostgreSQL engine without hosted writes.

## Agent sales portfolio navigation

Sales navigation places Developments directly below Listings. The portfolio uses
existing organisation and development relationship access, and opens the same
development workspace. Development creation remains permission controlled.
Listings uses All, Residential, Commercial and Developments categories, showing
property listing cards rather than project cards. Development links take
precedence over property category; Commercial includes the non-residential
categories. All contains each listing once. Current, Previous and Imported review
are selected through Listing status. Each category retains its filters while
switching tabs. More filters, removable chips and Clear filters keep the selected
criteria visible. Missing price, area or availability never matches a numeric or
stock filter as zero. Phase, block and unit availability appear when recorded.
The existing rental and developer listing workspaces retain their workflows.

Focused checks: `npx vitest run src/services/listings/__tests__/listingIndexFilterModel.test.js
src/components/listings/__tests__/ListingIndexFilters.test.jsx
src/lib/__tests__/agentDevelopmentsNavigation.test.js`, plus the existing
`node scripts/listings-tab-route-containment.test.mjs` and
`node scripts/agent-listings-principal-scope.test.mjs` checks.

## Listing capture and publication

New sales listings on desktop and mobile use Property details → Marketing →
Channels → Review. Seller capture happens after creation in the saved listing;
partially captured sellers in older drafts do not block listing submission.
Seller CRM creation is deferred to seller capture/editing, so its availability
does not hold up a new listing or draft. Extra property features are optional;
mandate, FICA and disclosure preparation remain in the saved listing's Documents area.
A new listing defaults to Active. Submit & activate saves and verifies its
property details and photos, then submits selected, connected channels together.
Listing setup stays open while submissions finish; their receipts distinguish
accepted submissions, failures and uncertain responses. A submission is never
shown as proof that a portal is live. Save Draft does not submit channels.
New submissions and content updates are sent only from listing setup. Confirmed
failures can be retried there; successful channels are excluded after a fresh
receipt check. Unconfirmed requests require a status check and are never
automatically resent. Marketing shows channel lifecycle status and the saved-result summary. Full
sales content review and updates continue in listing setup.
Property24's initial marketing expiry defaults to 90 days, independently of
seller mandate dates.

The saved-listing summary identifies the property and the next action. It keeps
saving, queued requests, sending, accepted requests, confirmed failures and
unconfirmed outcomes separate. Accepted requests still need public-advert
verification. Keep the page open until the advertising request has a durable
receipt; confirmed queued work continues after navigation. Rental publishing
queue failures open the saved rental with an advertising warning rather than
reporting a failed property save. An activation failure retains the confirmed
save and retries the same rental identity and revision.

Rental edits save without sending adverts. Their saved notice and receipt
comparison explain which updates still need sending. Review advertising opens
the existing controls; seller/landlord details and documents have separate
links. Rental results offer a targeted failed-website retry; sales offer it in
listing setup. Every retry rereads durable receipts and excludes successful,
pending and unconfirmed requests. Alternative portal/website publish controls
also check unresolved durable requests before sending. Status watching resumes
when a new request or retry is queued.

Focused browser check: `node scripts/listing-recovery-browser.test.mjs
<output-directory> '' '' publication` covers all seven categories for sales and
rentals, including partial failures, reloads, targeted retries, narrow-screen
results and lost responses. It uses loopback fixtures, actual sales capture and
rental capture/detail screens, and migrated rental SQL; accounts, storage, sales
persistence and portal outcomes are simulated. It does not publish adverts or
certify hosted permissions, real-provider acceptance or first-time-agent usability.

Run the complete local desktop acceptance suite with the existing command:
`npm run test:listing-diagnostic -- --browser --desktop-acceptance`.
It runs the contract/category diagnostic followed by recovery, private-draft
resume, responsive capture, checklist corrections, publication results and
interrupted-save journeys sequentially. Every mode must cover all seven
categories for both sales and rentals with its full set of distinct assertions;
missing, duplicate, failed or interrupted journeys fail acceptance. Each run
removes old result files before launch. Results remain local evidence and never
set `releaseReady` to true.

The `acceptance` mode in `listing-recovery-browser.test.mjs` follows one draft
through offline text input, tab-close photo recovery, interrupted upload, retry
without duplicate creation, confirmed save, a separate browser reopen and
review of a conflicting newer saved edit. Hosted save/reopen, agency/role
permissions, actual portal receipts and photos, editor/save/upload timings and
observed first-time-agent tasks must be recorded separately after an approved
release. A successful provider request or historical public advert cannot stand
in for those checks.

Listing Channels uses one Manage menu and a small Manage listing popup. Sold and
Under offer update all active portals and websites; expiry-date edits, Withdraw
and Expire apply only to the selected advert. Property24 supports expiry;
Private Property and websites offer withdrawal. Save changes sends only lifecycle
changes; an unchanged popup never publishes content. Lifecycle failures remain in
that popup and retry only failed channels.
Website snapshots require the forward migration
`20261010214831_website_listing_sale_status.sql` for their Sold/Under offer labels.
No existing snapshots are rewritten. Release the primary app, Home Seekers site
and public websites renderer together with this migration; local implementation
and fixture checks do not apply it or update live listings.
Focused checks: `npm run test:listing-marketing`,
`node --test scripts/listing-channel-update-state.test.mjs scripts/listing-quick-actions-phase4.test.mjs scripts/website-listing-sale-status.test.mjs`,
and the ListingChannelManageDialog/listingChannelManagement Vitest tests.
Publishing recovery is covered by the listingInitialPublicationService,
listingPublicationEditor and ListingPublicationProgress Vitest tests.
Pull deeds opens the existing property search with the
listing address filled in; supplier setup and paid report confirmation remain
in that workspace.

Rental creation follows the same submit-and-activate policy across residential,
commercial, industrial, retail, agricultural and land categories. Landlord and
mandate capture stay available after creation. Channels can be chosen in the
Property step; channel-specific address, description, photos and rental-term
errors appear in their capture steps. Property24-only rentals do not require a
deposit; Private Property requires a known deposit amount (zero is allowed).
Initial website publication prepares its projection automatically.
See [the field audit](docs/listing-syndication-field-comparison.md) for exact
portal differences, supported categories and remaining provider checks.

Sales listing cards use summaries rather than downloading every seller form and
full document history. Rental list reads omit document requirements, uploaded
documents and mandate packet/version history while retaining scoped stock,
canonical rental terms, media and distribution state. Detail headers load from
the core record before related data; marketing, document and offer actions wait
for their required data.

Property24 photo preparation overlaps two downloads/conversions at a time for
both sales and rentals. Gallery order, cover priority, conversion quality and
per-image/total byte limits remain unchanged. Initial channel receipts appear
individually, with one persisted-detail refresh after all selected submissions
settle instead of a full reload per channel. Browser uploads remain bounded to
two storage operations, preserving successful uploads on retries.
Property24 requirements checks recognise saved gallery photos without downloading
their bytes. An intentionally empty preview byte payload no longer reports
missing photos or keeps Publish disabled. Submission still downloads every
selected photo and blocks on failed downloads or a genuinely empty gallery.
Focused check: `npm run test:property24-preview-listing`, including sale/rental
requirements, successful submission preparation, failed photos and empty galleries.
Deployed to the primary app on 19 October 2026. Kingdom's existing rental passed
all 20 photos and Property24 confirmed listing 117731148 on its portal. The
focused checks and Vercel production build passed; no database migration was needed.
The forward migration `20261010094542_seller_existing_evidence_agent_access.sql`
fixes agent uploads of existing signed evidence through an authorized boolean
signing-conflict check. Private signing documents remain unreadable to agents;
online signing conflicts and evidence review checks remain enforced.

Focused checks: `node --test scripts/create-listing-save-recovery.test.mjs
scripts/phase3-listings-canvassing-performance.test.mjs
scripts/direct-listing-persistence-phase3.test.mjs
scripts/quick-add-listing-bypass.test.mjs
scripts/listing-detail-progressive-loading.test.mjs`,
`npx vitest run src/services/listings/__tests__/listingInitialPublicationService.test.js
src/services/__tests__/privateListingService.previousDetails.test.js`, and
`node --test src/core/documents/__tests__/sellerExistingSignedEvidence.test.js`.
These checks use local fixtures; deployment and hosted migration application
are separate release actions.

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

## Seller capture in leads and listings

Seller Lead → Capture Seller Onboarding Manually uses the same questionnaire as
seller onboarding, embedded in the agent workspace. Identity, entity authority,
FICA answers, mandate preferences, property details, occupancy, bond details and
all disclosure questions therefore share their fields, draft saving and submission
checks. Permissions are recorded as the agent's confirmation of the seller's
permission; disclosure signatures remain the seller's own action.

Listing → Seller Profile can link an existing seller lead or capture details
without one. Capture and correction use the same seller editor. Incomplete facts
can save as progress, including missing email or ownership information; document
preparation still checks the required identity, owners and signing authority.
Full manual intake can be opened without emailing a seller onboarding link.
A claimed existing mandate is not signature evidence: upload its signed copy
through the existing document workflow. Backdated capture does not create a new
mandate or change the original document's date.

Mandate, disclosure and FICA declaration retain upload, generate/download and
generate/send-for-signature routes. Supporting documents remain conditional on
the entity, people, ownership and property facts. Saving does not complete FICA
verification or approve uploaded evidence.

Canonical seller saving is authoritative. A later checklist or CRM projection
failure is reported as a follow-up after a successful save; it does not keep a
saved draft open asking for another save. A rejected save retains the entries.
Real concurrent seller changes are still protected, while the pending seller-save
migration compares the onboarding revision rather than unrelated listing changes.

Read-only production audit on 11 October 2026: Kingdom Real Estate's latest sales
listing was the Bergvallei property, with seller facts saved on 8 October and no
seller lead link. This proves the profile exists, not the cause of every browser
error. Production lacks `save_private_listing_seller_onboarding_profile` and still
uses the older listing-wide concurrency check. Release prerequisites are
`20261010215549_seller_save_concurrency_guards.sql`, its listing timestamp
correction `20261010225607_seller_canonical_revision_scope.sql`, and, for linking an existing
lead, `20261010223242_listing_link_existing_seller_lead.sql`. Neither was applied
by this audit. Do not replace missing database functions with direct table writes.

Focused checks: `npm run verify:seller-onboarding-profile-sync`,
`node scripts/listing-seller-profile-capture-phase2.test.mjs`,
`node scripts/listing-seller-canonical-update.test.mjs`,
`npm run test:seller-document-journey`, and
`npx vitest run src/components/onboarding/__tests__/SellerOnboardingCapture.test.jsx src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx`.
These use local fixtures and do not send mail or write hosted records.

The unreleased seller alignment repair now uses one current profile model in
the lead, listing, seller portal and transaction seller details. Entity/person
handoff preserves saved source ids and full captured fields; ambiguous legacy
links require review. Its guarded-save and current-profile SQL migrations must
ship with the compatible frontend after approval. Local checks and remaining
legacy/release work are recorded in
[the seller saving repair report](docs/audits/seller-saving-repair-2026-10-11.md#phase-3-profile-alignment).

`npm run test:seller-profile-alignment-journey` checks the current seller editors
against isolated PostgreSQL migration RPCs in two browser sessions. It covers
conflicts, retained drafts, rollback, retry receipts, clearing and entity/person
continuity. Auth, navigation and initial transaction creation are synthetic;
the check makes no hosted writes. Evidence and the final app-check result are
recorded in the report's Phase 5 checkpoint.

Phase 6 separates information submission from document preparation. Seller
onboarding has three steps: seller information, property information and review/
submission. Disclosure answers and signatures are captured afterwards through
Documents. Mandate, disclosure and FICA each offer **Upload manually**, **Generate
and download**, and **Generate and send for signature**. Preparing one does not
implicitly generate the other two. Agent review, protected fact corrections,
accepted version history and the portal's agency-managed upload permissions remain
in force. Listing preparation uses the same guarded canonical save as profile
editing and only downloads or sends after that save is confirmed.

The local `20261011111846_seller_portal_document_progress.sql` migration extends
the existing protected seller readers with current document versions, signature
counts and review state. It delegates token/session checks to the existing readers
and exposes no recipient identities, signing tokens or document HTML. Release it
with the compatible frontend and the required alignment guards after approval.
The Phase 6 checkpoint in the saving report records local checks and limitations;
no hosted migrations or deployment were performed.

## Transaction overview

Overview highlights one immediate saved workflow step in a contrasting green
Current Progress card. It follows the saved active workflow, otherwise the first
unfinished subprocess, and opens its relevant workspace. OTP, finance, transfer,
bond registration and cancellation use the same saved facts; missing or legacy-only
facts remain unavailable.
Deal Summary sits alongside at the same desktop height and shows purchase price,
finance type and the seller's existing bond answer (Yes/No/Not confirmed). Recent
activity and its composer remain in Activity. Focused checks:
`node --test src/core/transactions/__tests__/overviewWorkflowProgress.test.js` and
`npx vitest run src/components/transaction/__tests__/TransactionOverviewProgress.test.jsx`.

## Transaction buyer capture

Deal Setup → Buyer contains buyer details, deal basics and funding. Document
requirements and readiness stay in Documents. Buyer profiles edit inline, and
manual capture reuses the lead/onboarding personal, spouse, company and trustee
questions. Existing onboarding answers appear only for an explicitly identified
buyer; they are never assigned using a shared name or email address.

Manual capture saves a reusable buyer profile, without creating a CRM lead,
sending onboarding or marking onboarding complete. Capturing an existing
transaction buyer retains their participant ID, ownership, signature setting and
metadata. An email/phone profile match requires an explicit link action before
using that saved profile. Linked-listing sellers retain their existing guarded
listing profile authority.

Focused checks: DealSetupPanel, TransactionBuyerPartiesPanel.links,
buyerCaptureDetails and buyerProfileCapturedParty Vitest tests.

## Transaction seller capture

Deal Setup → Seller supports full manual seller capture for transactions without
linked listings. It reuses the seller editor for personal and spouse details,
multiple owners, companies/directors, trusts/trustees/beneficial owners,
representatives and FICA answers. Partial details may be saved without email.
Property/mandate editing and document requirements are excluded from this form.
Existing seller bond allocation remains in the transaction routing editor.

The canonical source is the transaction's existing
`onboarding_form_data.__bridge_transaction_parties.seller` snapshot. Contact
projections and the primary seller contact update in one guarded command with
an original revision and retry receipt. Buyers, unrelated form answers,
professional assignments and unidentified legacy participants are preserved.
Additional seller people appear in Parties from the full profile, without
creating additional access or invitation rows.
Capturing a seller creates no CRM lead, listing, portal invitation, document
verification, signature or onboarding submission.

Requires `20261019192602_transaction_seller_manual_capture.sql`. A missing
migration is shown as a load error and never treated as an empty seller profile.
Linked listings continue through their established seller capture authority.

Focused verification: `node scripts/transaction-seller-manual-capture.test.mjs`
installs the real migrations in isolated PostgreSQL with synthetic permissions.
The TransactionSellerCapturePanel, transactionSellerCaptureService and
DealSetupPanel Vitest suites cover the editor and its integration.
The optional local preview is
`node scripts/fixtures/transaction-seller-capture-browser.mjs`; it uses only
synthetic local PostgreSQL and never connects to hosted data or email.

## Transaction parties

Transaction Parties combines buyers, sellers and professional roleplayers in one
contact directory. Cards open name, entity/company, email and phone details;
professional assignments remain available on their cards. Old Parties navigation
resolves to the combined tab. Documents and onboarding summaries remain in their
dedicated workspaces. Focused check:
`npx vitest run src/components/transaction/__tests__/TransactionPartiesDirectory.test.jsx src/components/transaction/__tests__/TransactionRoleAllocationDialog.test.jsx`.

## Historical transaction milestones

Transaction Overview → Record historical progress records only the milestones
explicitly confirmed by the transaction team, with optional historical dates.
Other milestones remain unknown unless confirmed by the normal workflow. The
same confirmations feed professional and party journey views; they do not mark
documents/legal tasks complete, restart onboarding or send messages. Unchecking
a milestone removes its historical confirmation while retaining the audit trail.
Concurrent edits require reopening the form rather than overwriting another save.

Saving requires `supabase/migrations/20261019183254_transaction_historical_journey.sql`
from the repository root. This migration is prepared locally and requires an
approved database release before use. Focused checks:
`node scripts/transaction-historical-journey.test.mjs` (isolated PostgreSQL),
`npx vitest run src/components/transaction/__tests__/TransactionHistoricalJourneyDialog.test.jsx src/services/__tests__/transactionHistoricalJourneyService.test.js`.

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
source drafts and their hashes. Exact wording approvals are recorded in the
release manifest; the separate agency approval register is currently empty. An
old template approval or client flag cannot bypass these gates. Exact business/counsel wording approval, matching agency-schedule approval,
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

A sixteenth journey saves agent-captured disclosure without a seller signature,
downloads the three prepared copies, and records separate existing signed files.
Each upload remains incomplete and blocks a conflicting online request until the
actual browser review records the required signature confirmation. Reopening uses
the reviewed files and preserves all generated versions. This is synthetic
external evidence; the check does not establish wet-ink authenticity. The same
command now also checks shared identity/FICA/POPI fields, explicit clears, consent
history and the full agent disclosure questionnaire.

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

The agent document workspace uses the same three actions for mandate, FICA and
outstanding disclosure: **Generate and download**, **Generate and send for online
signature**, and **Upload existing**. Each document can use a different action;
preparing copies does not mark a mandate sent, and an upload does not mark it
signed. Progress distinguishes prepared copies, online signer counts, failed or
expired requests, signed/uploaded evidence awaiting review, and reviewed completion.
Failed sends retry the frozen version with fresh links while retaining the revoked
request. An active online request prevents switching to uploaded evidence.

The approved per-document portal route is enabled by default in source. Explicit
`VITE_SELLER_PORTAL_SIGNING_ENABLED=false` and `SELLER_PORTAL_SIGNING_ENABLED=false`
remain operator kill switches. The retired listing-mandate route stays disabled;
wording, agency approval, authority, FFC and exact-version checks still apply.
The additive migration `20261009150000_seller_existing_signed_evidence.sql` must
be released with this workflow before agents use **Upload existing**. It records
existing evidence separately from returned generated copies, requires a signature
review, protects active online evidence, and preserves the exact-version guard.
No historical documents or approvals are changed by this migration.

Focused checks: the seller workflow model/component/service tests, the actual SQL
existing-evidence test, `test:listing-seller-canonical-update`,
`test:seller-reviewed-document-versions`, and the connected document journey above.
These checks use synthetic local fixtures and send no live email.

Phase 4 adds the complete workflow to the existing release candidate and check.
The candidate locks the new existing-evidence migration, onboarding/profile and
consent changes, the assisted-disclosure editor and the three document actions.
Release readiness requires a complete matching 16-journey run, all three existing
uploads reviewed and unsigned agent capture; a partial rerun or earlier report
cannot satisfy it. Run `npm run check:seller-document-release` after the full
journey, and export a fresh candidate/pending decision using the release commands
below. Do not reuse the older saved mandate candidate or its decision.

The local acceptance checks use the actual signing handler and relevant PostgreSQL
commands with synthetic Auth, email and Storage transport. The app baseline, lint
and Vite production build must pass for the same candidate. On this machine the
build uses `NODE_OPTIONS=--max-old-space-size=4096 npx vite build`; the knowledge
login probe is explicitly disabled to avoid an unapproved live login.
Complete migration replay, target/recovery and scoped dry-run evidence, exact
agency-schedule approvals, hosted UI/Storage/session acceptance and real delivery
remain release requirements. The full replay currently cannot start because the
local Docker engine is unavailable. Nothing in this phase deploys, applies remote
SQL, sends email or grants an agency approval. Follow the
[seller action release steps](../docs/database-release-runbook.md#seller-document-action-update)
when a release is explicitly requested.

Local acceptance on 9 October 2026 passed: 16 journeys, 54 actual PDFs across
293 pages, nine browser signatures, five browser signature reviews, all three
independent signed uploads and unsigned agent capture. Workflow/SQL, canonical
save, correction, access and release-package checks passed, along with the app
baseline, lint (zero errors; existing warnings) and production build. The fresh
candidate matches the tested source. Full clean replay could not start without
a running Docker daemon; target, hosted delivery and human approval evidence
remain pending. These results grant no deployment approval.

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

The desktop appointment editor groups appointment type, organisers, clients,
time and address in aligned rows. Type choices follow the active organisation;
an existing specialist booking keeps its type when edited. Organisers use an
avatar picker with a primary organiser and optional co-organisers. The client
picker searches loaded leads locally and supports several clients. Create new
client saves through the existing CRM lead service before selecting that client,
with agent notification emails disabled for this quick capture. Extra guests,
notes and invitation preferences remain optional. Focused checks:
`AppointmentPeopleFields.test.jsx` and
`AgencyPipelinePage.calendarRefresh.test.jsx`. These changes are local only.

The request limits now also cover mobile calendars, listing viewings, connected
calendar status, delivery receipts, health/support panels, rental calendars and
attorney scheduling. The shared `useCalendarRead` hook uses stable viewer/scope
keys, one active read and one trailing refresh, five-second automatic request
spacing and a thirty-second error pause. Explicit Retry bypasses that pause but
waits for an outstanding read to settle. Deadlines abort supported transports;
legacy reads keep their queue occupied until they settle and do not start later
enrichment stages after cancellation. Hidden/offline tabs pause automatic work.
Rental and listing calendars remain event-driven without periodic polling.
Rental management shares one listing-history read between lease and event data.
These changes are local only; no deployment, migration or live-data repair is
included. Focused regression coverage is in `useCalendarRead.test.jsx`,
`CalendarRequestBudget.test.jsx`, `calendarReadCancellation.test.js` and
`rentalCalendarReads.test.js`, alongside the existing calendar and attorney suites.


Calendar refreshes now share one active read and at most one follow-up, with a
five-second minimum between automatic requests and a longer pause after errors.
Explicit retries remain available. Leaving the screen, changing viewer or range,
and reaching the read deadline abort the underlying appointment and attendance
requests. Routine polling, tab focus and calendar navigation reload appointments
without refetching the CRM or listing catalogue. CRM change notifications share a
separate queue that waits for outstanding reads to settle, including reads whose
screen deadline has expired. This fix is prepared locally and is not yet deployed.

Focused verification: `npx vitest run src/lib/__tests__/coalescedRefresh.test.js
src/hooks/__tests__/usePipelineAppointments.test.jsx
src/lib/__tests__/leadAppointmentHistory.test.js
src/pages/agency/__tests__/AgencyPipelinePage.calendarRefresh.test.jsx --maxWorkers=1`.

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

## Appointment time-change workflow foundation

Phase 1 of the new time-change workflow is implemented locally in
`20261019165256_calendar_time_change_workflow.sql`. It adds one active request per
ordinary managed appointment, organiser review, individual required-attendee
approval, withdrawal, decline, expiry and server-written decision history. A
request retains the original duration. The original reservation stays in place
until the replacement receives every required approval and passes a fresh
conflict check. Internal appointments with only the organiser can move when the
organiser proposes the replacement. Existing specialist scheduling keeps its own
workflow.

`get_calendar_time_change` returns authorised state and history.
`mutate_calendar_time_change` uses the displayed revision and a repeatable command
ID for request/propose/decline/withdraw/accept/decline_proposal actions. The
invitation-token request/withdraw endpoint exposes only the token holder's safe
schedule context. The existing hold-expiry worker closes expired requests without
reopening cancelled or archived appointments. No historical rows are rewritten by
the migration.

Phase 2 adds a shared time-change panel to the desktop appointment card and mobile
appointment workspace. It provides a preferred date/time and optional message,
organiser review (propose the requested time, suggest another, or keep the current
time), individual approval/decline, withdrawal, expiry feedback and collapsed
actor history. Issued ordinary appointments keep their schedule read-only in the
normal edit form; drafts and dedicated specialist workflows retain their existing
schedule controls. Other appointment details remain editable independently.

Reads use the shared calendar queue with stable viewer/appointment scope; changing
form fields or rerendering does not issue another read. Mutations retain a command
ID after a lost response and block double submissions. A newer revision requires
fresh state, and late results are discarded after switching appointments. Existing
proposal-response controls defer to the new panel to avoid duplicate reads and
actions. An absent migration shows a release-pending message.

Phase 3 adds the local `20261019172522_calendar_time_change_notifications.sql`
migration and six branded HTML/plain-text email events: requested, proposed,
confirmed, declined, withdrawn and expired. Request notices go to the organiser
and requester; proposed/final outcomes go to permitted current attendees.
Organisers receive the existing authenticated `appointmentId` calendar deep link;
attendees receive their own expiring invitation capability. Proposed replacements
have no ICS attachment; the agreed confirmation can update the same calendar UID.
Private appointment notes and instructions are excluded from lifecycle emails.

The public response page supports accepted guests requesting another time,
withdrawal of their pending request, and individual proposal acceptance/decline.
Email-link GETs never submit a response. A proposal response checks its exact ID
and version, with a hashed-token command receipt that survives token rotation on
the last required approval. A retry reports the current request outcome rather
than stale pending approval. Replaced/revoked/expired invitations cannot submit
new responses. Public pages do one scoped read and explicit refreshes, without
focus polling or browser-side notification delivery. Specialist invitations keep
their existing response owner.

Lifecycle jobs share the existing durable worker, saved notification choices,
visibility rules, claim leases, frozen provider payloads and provider idempotency
keys. A partial attendee approval preserves other attendees' pending messages;
material edits/token rotation supersede stale payloads. No message jobs or
historical data are backfilled by this migration. The updated send-email function,
delivery worker, app and migrations must be released together after approval;
none were deployed and no real messages were sent during this local work.
Phase 4 adds `20261019174614_calendar_time_change_alignment.sql`. Reminder
receipts follow a private snapshot of the actual booking and recipient rather
than proposal/vote revisions. Requests, partial approvals, withdrawal, decline and
expiry keep original reminders; final agreement retires them and schedules only
future reminders at the agreed time. Repeated reconciliation and reviewed recovery
retain existing receipts and frozen idempotency keys. Material edits, privacy,
preferences, cancellation, archive and repair suppression remain dispatch gates.
Reminder emails have no ICS attachment or invitation-response buttons, so a
reminder cannot create a stale copy or carry a rotated proposal capability.

Google/Outlook copies retain their copy key and material version while a request
is under review. Only the committed schedule changes their target; existing
provider lease checks fence claims for the old time after confirmation. Synced
legacy copy hashes are adopted locally without sending an external update;
active claims, frozen creates and outside-change reviews are preserved. Existing
provider polling, disconnection, retries and conflict-review ownership continue.

The scoped support timeline includes request decisions and individual votes.
In-app lifecycle messages use clear titles and the existing appointment deep link.
Delivery UI retains valid reminder/lifecycle receipts across partial approvals,
with stable read scope and no read triggered by ordinary rerenders. The existing
health scanner and reviewed recovery recognise retained reminder receipts.
Phases 1–4 remain local and require an explicitly approved migration/function
release. Live email delivery and real provider updates have not been exercised.

Phase 5 extends the existing acceptance runner and its A01–A42 evidence matrix
with all time-change checks. It adds independent PostgreSQL races for duplicate
requests, final approval retries, cancellation/withdrawal/expiry and conflicting
bookings, plus real public-screen lost-response recovery and organiser conflict
feedback. Negative permission checks resulted in the append-only
`20261019175522_calendar_time_change_access_guards.sql` migration: an external
client loses workflow/token access when a booking becomes internal-only, and a
revoked participant cannot use an old response receipt to read the current time.
Permitted attendees retain safe retry after final confirmation rotates tokens.

Run the existing complete local acceptance command with an isolated test socket:

```sh
CALENDAR_LOCAL_PG_SOCKET=/absolute/path/to/calendar-phase3-local/socket node scripts/check-calendar-acceptance.mjs --output ../tmp/calendar-time-change-acceptance-<unique-run>
```

It runs both UTC and SAST, native concurrency, attorney compatibility, operator,
Edge and app checks, with immutable logs and per-case assertion evidence. A
skipped/missing test, failed app check or changed source is not a pass. Read the
[time-change acceptance boundaries](docs/appointment-behaviour-contract.md#time-change-workflow-acceptance-19-october-2026).
No hosted migrations, provider writes or real email are authorised by this work.

Run the real migrations and existing reservation/delivery regressions in an
isolated local PostgreSQL fixture from this package with:

```sh
npx vitest run supabase-tests/calendarTimeChange.test.js supabase-tests/calendarReservations.test.js supabase-tests/calendarDelivery.test.js --maxWorkers=1 --testTimeout=30000
```

Reminder/provider/history integration checks:

```sh
npx vitest run supabase-tests/calendarTimeChangeAlignment.test.js supabase-tests/calendarProviderSync.test.js supabase-tests/calendarHealth.test.js src/components/appointments/__tests__/AppointmentDeliveryStatus.test.jsx src/components/appointments/__tests__/AppointmentSupportPanel.test.jsx --maxWorkers=1 --testTimeout=30000
```

Email/capability checks:

```sh
npx vitest run supabase-tests/calendarTimeChangeNotifications.test.js supabase-tests/calendarTimeChangeEmail.test.js src/pages/__tests__/AppointmentRsvpPage.test.jsx --maxWorkers=1 --testTimeout=30000
```

Screen/API/local-SQL journey checks:

```sh
npx vitest run src/components/appointments/__tests__/AppointmentTimeChange.test.jsx src/services/__tests__/calendarTimeChangeService.test.js src/pages/agency/__tests__/AgencyPipelinePage.calendarRefresh.test.jsx src/components/appointments/__tests__/MobileAppointmentWorkspace.test.jsx supabase-tests/calendarJourney.test.jsx --maxWorkers=1 --testTimeout=30000
```


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

## Instagram listing posts

Listing → Marketing now includes Instagram beside Facebook. Staff who can access
and publish the reviewed listing select a professional account linked to an agency
Facebook Page, a saved gallery or public listing photo, and a caption. They review the exact
account, photo and caption before publishing. Recent results retain the account,
processing/published/failed/unconfirmed state and verified Instagram permalink.
Drafts and previews clear on user, role, agency and listing changes.

This first version publishes one JPEG photo to the feed. Photo bytes are fetched
only from configured Supabase Storage without redirects, capped at 8 MB, checked
for JPEG dimensions/aspect ratio, and fingerprinted. Existing public
`listing-media` URLs remain supported. Gallery uploads in the private `documents`
bucket use the saved object identity under `private-listings/<listing>/gallery/`;
old viewing links are refreshed through the caller's storage permissions.
One-hour signed links are returned for viewing and passed to Meta only after
explicit Publish. Saved snapshots retain a canonical object URL without a signed
token. The original photo stays private; no public copy, bucket-policy change or
service-role storage signing is used. Missing or changed gallery photos and
revoked storage access block publishing. Deploy this gallery handoff with the
Meta integration function and frontend, then run a controlled live test. Captions are
limited to 2,200 Unicode characters including any public listing link. Private
addresses and notes are never used in generated captions. A changed listing,
photo, connection or linked account requires a new reviewed preview. Reels,
Stories, carousels and Instagram scheduling are outside this version.

The existing encrypted Facebook Page connection is reused. At combined release,
the Facebook Login for Business configuration and app review must include
`instagram_basic`, `instagram_content_publish` and `pages_read_engagement`.
Each agency links its professional Instagram account to its own Page and
reconnects Meta to grant these permissions. Missing permissions, personal accounts
and missing Page links show connection guidance; Arch9 never accepts a pasted
Instagram account/token as publishing authority.

The two provider writes (create media container, then publish it) each have a
service-only PostgreSQL claim. Current membership, preview author, tenant and
connection version are checked transactionally. Processing containers can be
finished later after all listing/photo checks repeat. Status refreshes never
publish. Lost responses or abandoned claims remain unconfirmed and never repeat
provider writes. A `PUBLISHED` container can confirm a lost publish response
without guessing a post from its caption; a missing permalink can be retrieved
later without publishing again. Instagram and Facebook job IDs/history remain
separate. Meta access tokens and connection ciphertext never appear in preview/history data.

Release migration `20261018140502_instagram_listing_posts.sql`, the
`meta-integrations` function and the primary frontend with the combined package.
Run an approved real-account photo publication and permalink/status check after
release, including the Meta review demonstration. The local build does not change
Meta permissions, connect an account, or publish any live post.

Focused checks extend `scripts/meta-integrations.test.mjs` and use
`ListingInstagramPostPanel.test.jsx`. Provider behavior follows Meta's
[content publishing guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing)
and [photo media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media).

## WhatsApp audiences and campaign routing (stage 5, built locally, unreleased)

Marketing → WhatsApp → Audiences saves Buyer, Seller and Recruitment filters for
areas, stages and agents. Areas match stored CRM values exactly, ignoring letter
case: active Buyer requirements, seller listing locations and Recruitment areas.
Closed records are excluded unless deliberately included. Previews show current
matches, invalid/shared phones and existing WhatsApp campaign permission. No
contact or permission is created by an audience. Email subscriptions, requirement
matching consent and one-to-one permission do not supply campaign opt-in.

The campaign builder previews a saved audience and reviews at most 500 selected
phones. A shared phone needs a specific CRM record choice, including when search
narrows the visible rows. Larger previews require narrowing rather than silently
truncating. Saving freezes the reviewed record, phone, assignment and filter
version. Readiness, transactional enqueue and final worker claims recheck them;
changed CRM records, permission or archived/edited audience definitions block or
skip unsent recipients. Audience edits never add recipients to an existing send.
Management controls CRM audiences and campaign reply routes; Recruitment audiences,
campaigns and recipient results retain its stricter management access. Browser
clients cannot read the per-message CRM snapshots.

Exact campaign replies use Meta's reply-to message ID, sending number, WABA and
recipient phone. They can link the reviewed existing CRM record and route to its
agent, a chosen active agent or the agency queue. Manual campaigns can route to
an agent without inventing a CRM link. Existing manual handoffs and different CRM
links are preserved. Changed or ambiguous routes show an agency-review notice in
the inbox. Signed provider receipts reconcile replies arriving before their
campaign's delivery callback. Duplicate callbacks never repeat routing. Bulk
campaigns continue to require agency-owned numbers.

Lead Capture settings keeps each form's default Buyer/Seller/Recruitment route.
An exact Meta campaign ID can override its type and agent for that form; other
campaigns use the default. Names are labels, not classifiers. The normal signed
webhook and historical ingestion share the same resolver. Existing Meta lead IDs
retain their first destination after routing edits. Historical imports retain
suppression of new-lead messaging/notifications. Active imports must finish before
route changes. Saving form choices is atomic and disables unchecked forms; an
empty selection stops form intake while preserving the Page connection. The full
Page form list is verified before saving, with bounded pagination and explicit
failure rather than partial changes.

Release `20261018133534_whatsapp_campaign_audiences_and_routing.sql`, then
`meta-integrations`, `whatsapp-campaigns`, `whatsapp-campaign-worker`,
`meta-lead-ads-admin`, `meta-lead-ads-webhook` and the primary frontend with the
combined package. No live rules, provider settings or recipients were changed by
this local implementation. Verify real campaign reply context, lead form routing
and the worker on approved review data after the combined release.

Focused checks use the existing `scripts/meta-integrations.test.mjs`,
`scripts/whatsapp-campaigns.test.mjs`, `WhatsAppAudiences.test.jsx` and
`supabase/functions/_shared/metaLeadAds.test.ts`.

## WhatsApp lead automations (built locally, unreleased)

Marketing → WhatsApp → Automations lets agency management configure new-lead
acknowledgements and assignment, one delayed follow-up after a sent message, and
stage-change messages or tasks. Buyer, Seller and Recruitment use their own rules;
Recruitment configuration, activity and tasks retain its management restriction.
New rules and edits save switched off. Enabling applies only to future events;
historical Meta imports and WhatsApp history do not start new-lead outreach.
Assignment fills an empty Buyer/Seller primary agent and unassigned contact at
capture; it preserves existing assignments. Message/task delays and configurable
weekdays, hours and IANA time zone apply to the queued action. The default window
is Monday–Friday, 09:00–17:00 Africa/Johannesburg.

Automated messages use a live approved text template with fixed text or contact
name variables, plus recorded one-to-one permission for the selected sender.
CRM capture and bulk permission do not supply that permission. Agent senders must
belong to the lead's current agent. An agency queue is preserved. A sent message
in an explicitly linked conversation can start one follow-up for the current
stage/assignment/contact; follow-ups do not start another follow-up. Customer
replies, opt-outs, CRM/phone/assignment changes, closing a conversation and
switching off or editing a rule stop pending work. Imported history does not act
as a new customer reply. Tasks use the existing task list, with Recruitment
restricted to its managers. Actions waiting more than seven days beyond their
initial due time expire.

The latest 100 actions show the lead, outcome and skip reason. Sent means Meta
accepted submission; inbox receipts report delivery. A durable claim permits one
provider attempt. An uncertain send is never automatically repeated; a later
signed delivery receipt reconciles it. Unsent worker leases can recover safely.

Release `20261018131742_whatsapp_crm_automations.sql`, `meta-integrations`,
`whatsapp-automation-worker` and the primary frontend with Stages 1–3. The private
scheduler uses the existing Vault entries `arch9_project_url` and
`arch9_service_role_key`, pg_net and a one-minute pg_cron job. All new tables have
RLS and browser access revoked. Nothing in this local build enables a live rule
or contacts Meta recipients. Verify the deployed worker, scheduler and a permitted
review recipient during the combined release.

Focused checks use the existing `scripts/meta-integrations.test.mjs` and
`scripts/whatsapp-campaigns.test.mjs`, plus
`src/components/marketing/__tests__/WhatsAppAutomations.test.jsx`.

## WhatsApp campaigns

Agency administrators connect their own sender in Settings → Integrations →
WhatsApp using Meta Embedded Signup. A new number can be activated with the
administrator's six-digit registration PIN, which is sent to Meta without being
stored. Marketing → WhatsApp → Inbox receives customer messages, supports
attachments up to 8 MB and permits replies during Meta's 24-hour customer-service
window. Connection tokens are encrypted and inaccessible to browser database
queries. All inbox and connection operations require active workspace membership.

Listings → Marketing → Post to Facebook prepares a server-generated preview from
saved public listing details and requires a separate Publish action. It checks
listing access, seller-review blocks and the Page's posting permission. A claimed
reply or post is never automatically retried after an uncertain provider response.
Page posting requires `pages_manage_posts`; lead webhook subscriptions require
`pages_manage_metadata`. Each agency authorizes and selects its own Page.

Apply `20261017172424_meta_inbox_and_listing_posts.sql` before deploying
`meta-integrations` and the corresponding WhatsApp/Meta function updates. Embedded
Signup uses `META_WHATSAPP_LOGIN_CONFIG_ID` (the Arch9 configuration is the default).
The WhatsApp webhook accepts `WHATSAPP_WEBHOOK_APP_SECRET` or `META_APP_SECRET` for
signature verification. The provider app must be published and obtain the relevant
advanced access before agencies outside the app's roles can onboard.

Focused checks: `node --test scripts/meta-integrations.test.mjs
scripts/whatsapp-campaigns.test.mjs` and the Vitest `MetaIntegrations`,
`metaIntegrationSignup` and `WhatsAppCampaigns` tests.


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

Campaigns now use a durable server queue. In the final Review step, choose
**Send now** or **Schedule for later**; the date/time field states the browser's
time zone and is stored as a UTC instant. Changing the time invalidates readiness
and confirmation. Confirmation snapshots the audience and approved message and
atomically creates a delivery job. Once confirmation succeeds, the browser can
close. Results show scheduled, sending, paused and cancelled states, with pause,
resume and cancel controls. Messages already in progress may finish after a pause
or cancellation. Historical unfinished campaigns require an explicit **Resume**;
the migration does not enqueue them automatically.

The `whatsapp-campaign-worker` checks current sender identity and template approval
on every invocation and consent/phone immediately before each recipient claim.
It leases up to three campaigns, sends up to 50 recipients per campaign in groups
of five within a bounded time budget, and leaves remaining recipients for another
minute tick. Leases expire after three minutes if a worker stops. An interrupted
or ambiguous recipient attempt is never returned to the queue; it appears as
unconfirmed and must be investigated before sending another campaign. Delivery
and read callbacks remain monotonic and correlated using message IDs or
`biz_opaque_callback_data`. STOP, unsubscribe and opt-out replies revoke permission.
Acceptance by Meta is not delivery, and read receipts may be unavailable.

For an approved rollout, apply
`20261018082522_whatsapp_campaign_background_delivery.sql`, deploy the
`whatsapp-campaign-worker` and updated `whatsapp-campaigns` functions, and deploy
the primary app. The worker authenticates server credentials itself; browser user
JWTs and public keys cannot invoke it. Reuse Vault secrets `arch9_project_url`
and `arch9_service_role_key`, with `pg_cron` and `pg_net` enabled. The migration
registers `whatsapp-campaign-worker` once per minute when pg_cron is available;
otherwise it emits a setup notice. Opaque service keys use the `apikey` header;
legacy service JWTs also use Bearer. No secrets belong in a migration or browser.

Release verification must confirm that the cron job exists and its runs reach the
worker successfully, then check a consented test recipient in **Arch9 Meta Review**
with the campaign page closed. Verify scheduled sending, opt-out suppression and
actual provider callbacks. The local checks use isolated SQL and a fake Meta
provider and do not prove live scheduler or delivery configuration. No real
messages, migrations or deployments are performed by those checks.

To halt delivery during recovery, unschedule `whatsapp-campaign-worker` and pause
active campaigns using their results controls. Already claimed requests may
finish. Keep recipient attempts and provider IDs intact; never reset processing,
sent or unconfirmed recipients to queued. Restore the worker and browser endpoint
as a compatible pair before allowing new confirmations.

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

Agent-assisted seller onboarding includes the same 20 Annexure A questions as
seller self-service, question explanations, remote quantities and final comments.
**Save Draft** keeps partial answers for reopening; **Save and Submit Onboarding**
requires the complete questionnaire. Capturing or submitting answers never records
a seller signature or declaration acknowledgements. The seller reviews the captured
answers on their signing link, then signs. Existing signed disclosures, co-owner
signature evidence and reviewed uploads remain locked during assisted capture.

Focused assisted-capture checks (local fixtures; no client messages or remote writes):

```bash
node --test src/lib/__tests__/sellerAgentAssistedDisclosure.test.js src/lib/__tests__/sellerLeadManualCaptureModel.test.js scripts/seller-onboarding-access.test.mjs
./node_modules/.bin/vitest run src/components/listings/__tests__/ListingSellerInformationEditor.test.jsx src/services/__tests__/privateListingService.sellerAccess.test.js
```

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

The listing editor now reads the saved Seller ownership structure before the
listing's broad entity field. It retains marriage and signing-authority detail,
and successful seller receipts refresh both the displayed and stored canonical
facts before another save. This prevents stale local ownership comparisons;
genuine entity changes and inconsistent single-owner records remain blocked.
The correction is local pending a primary-app release. Focused regression check:
`node --test src/services/listings/__tests__/listingEditorSellerOwnership.test.js`.

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

The `marketing-event-worker` processes queued RSVP CRM handoffs and due
confirmation/morning-reminder messages. Its service authentication accepts only
exact configured `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY` values;
decoded JWT claims never authorize it. `verify_jwt = false` lets modern secret
keys reach that explicit check. The scheduler correction
`20261013181842_marketing_event_worker_service_key_headers.sql` uses `apikey`
alone for opaque keys and keeps Bearer headers for legacy service JWTs. It
preserves the minute schedule and existing queue records. The internal database
and JWT-protected `send-email` calls retain the injected legacy service key.
Changing the incoming scheduler credential does not rotate shared secrets.

An authenticated POST with `{"mode":"health"}` reads queued handoff and due
message counts without creating CRM records, claiming messages or sending email.
Use Vault credentials server-side for production probes; never expose them in
browser code or logs. Invalid modes are rejected. A successful health probe does
not prove provider delivery; verify that when an eligible registration exists.

Focused worker check, from the repository root:
`deno test --allow-env --config supabase/functions/marketing-event-worker/deno.json supabase/functions/marketing-event-worker/index.test.ts`.
Scheduler checks, from this package:
`node scripts/marketing-event-worker-scheduler.test.mjs`.
These fixtures cover exact-key authentication, forged/conflicting credentials,
read-only health, bounded batches, due selection, protected internal email calls,
provider success/failure, service-only scheduler access and unchanged queues.
They send no live communications.

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

The rental operations dashboard's occupancy and portfolio totals include units
from all active, accessible rental portfolio properties, including properties
without confirmed management mandates. Units marked notice given remain occupied.
Release `20261019152345_rental_dashboard_active_portfolio.sql` with the dashboard
change; this updates dashboard reads without changing mandate authority rules.
Failed sections show an unavailable state while successful sections retain their
figures. Refresh dashboard, window focus and a visible-page 60-second refresh
reload saved data; older filter responses cannot replace the current results.
Focused checks: `npx vitest run server/tests/rentalDashboardMandates.test.js
src/pages/rentals/__tests__/RentalOperationsDashboardPage.test.jsx --maxWorkers=1`
and `npm run test:rentals-phase16r`. Local verification does not release the app
or apply this migration to production.

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
checks, scoped ESLint, and the Vite production build. The lease-signing check also verifies that maintenance and inspection links
retain the selected tenancy context.

## Reliable landlord profile saving

The primary rental lead's Landlord profile autosaves after an 800 ms pause.
Requests are serialised; typing during a request remains editable and queues the
latest answers. Manual Save flushes the queue. A failed request retains the draft
and offers Retry; reconnecting resumes an offline draft. Partial invalid answers
stay in memory and in actor/organisation/branch/lead-scoped sessionStorage for up
to eight hours. Before-unload protection remains active until saving is confirmed.
Blocked sessionStorage is reported, with the draft retained in memory.

Workspace refreshes merge unrelated saved changes without replacing local edits.
Overlapping changes pause saving and show the saved and draft values for an
explicit choice. A late acknowledgement cannot discard newer typing or another
mounted editor's recovery draft. Confirmed readback and lost-acknowledgement retry
checks determine the saved indicator; a failed workspace refresh is distinguished
from a failed profile save.

`20261015083559_rental_landlord_profile_consistent_saving.sql` is a release
dependency after landlord onboarding and the permanent Client identity foundation.
It projects name/contact/type into exact linked Client/contact and rental listing
records in the same versioned transaction, including listing capture drafts. A
shared Client's other draft landlord journeys keep their private fields while core
contact changes are aligned. Existing Client edits retain the owner/principal
permission and version checks. Email collisions, conflicting legal structures,
submitted journeys and unavailable linked listings roll back the complete change.
Aliases, record IDs, consent, signed documents, roles and workflow progress are
preserved. There is no historical backfill, identity merge, publishing or email.
The API advertises schema capability; profile writes are refused before this
database update is available. Linked listing editors read the committed result
instead of following it with stale contact/listing writes.

Focused checks: `rentalLandlordProfileConsistency`, `rentalLandlordProfileSaving`,
`useRentalLandlordProfileAutosave`, existing landlord workspace/onboarding/listing
checks and the primary app baseline. The isolated browser fixture under
`tmp/landlord-profile-verification-20261015` uses real UI/API/SQL with synthetic
in-memory records. Prepared locally; the migration is not applied remotely.

## Shared landlord conditional rules

The primary app agent profile, invited landlord form and listing onboarding editor
use `rentalLandlordProfileRules.js` for the same fields, labels, options, applicability
and validation. Internal notes stay internal. Public projection and merging now
include tax/VAT, marital and signing-authority answers while preserving private
notes and exact person/property references.

A draft needs a landlord name and email or phone to maintain the permanent Client
connection. Identity, entity registration, authority and partially completed people
can be saved and recovered without a submission declaration. Captured email, date,
selection and share values are checked when applicable. Hidden answers are retained
when changing an option but do not drive validation or evidence applicability.

Submission checks address and identity for an individual; registration, signer and
relevant ownership/control parties for an entity; each owner's identity/address,
shares totaling 100% and an authorised signer for multiple owners. Spouse details
apply to a recorded marriage in community, VAT number to VAT registration, and
representative details to an entity or selected representative. These are product
completion rules; agency risk and evidence review remain separate. The invited
landlord sees the outstanding answers before the declaration button is enabled.

Foreign and other classifications retain their original type and explicitly select
an underlying individual/company/trust/close-corporation/multiple-owner structure.
Foreign owners supply the country; other entities describe their arrangement.
“Needs agent review” is a valid incomplete draft, never a completed submission.
The resolved structure drives evidence and listing readiness. Group identity packs
use the captured owners, avoiding an extra invisible primary-contact ID question.
Ownership/control changes supersede the affected evidence generation on a discovery
save, preserving original files and review history. When an existing matrix first
adopts these rules, its affected entity/group checks also require fresh review on
the next save. The migration itself does not rewrite saved checklists or files.

`20261015100645_rental_landlord_shared_conditional_rules.sql` depends on the
conditional document matrix and consistent-saving migrations. It adds matching
server-command draft/submission guards and compares resolved legal structures when
aligning exact shared Client journeys. Apply the reviewed migration before deploying
the new capture screens. Prepared and verified locally; no hosted data was changed.

Focused checks: `rentalLandlordProfileRules`, `RentalLandlordSharedFields`,
`rentalLandlordSharedRules`, the existing landlord portal/workspace/listing/autosave
regressions, SQL/browser evidence parity and the primary app baseline.

## Compact landlord profile layout

The three primary-app capture routes use `RentalLandlordProfileEditor` for grouped
contact, identity/family, entity, tax/VAT, people, signing authority and internal-note
sections. Contact opens first; the other applicable sections show Ready, Details
needed or Optional badges and can be expanded independently. Completion follows the
shared submission rules, with saving and evidence review reported separately.
Invited-landlord property details and listing rental settings are collapsed until
requested. Submitted sections remain browsable, with editing controls disabled.

People appear as compact summary rows. New people open immediately for entry;
existing rows expand on demand without changing person references or discarding
values. Agency-only notes remain outside the invited landlord projection.

The primary signatory can be selected from captured people. Selection records
`primarySignatoryId`, marks that person authorised, and updates the existing scalar
signing fields together. Later edits keep the linked signing details aligned;
removal or revoked authority clears the reference and copied details. Separate
manual signatories remain supported for older journeys and uncaptured parties.
The autosave hook applies these linked fields in one change and retains later typing
while a request is pending. Authority references and evidence still need review.

`20261015103158_rental_landlord_selected_signatories.sql` depends on the shared
conditional-rules migration. It checks stable references and copied values inside
the existing scoped versioned command, and fingerprints selected-person changes
only for affected signatory/authority evidence. No existing data or file history
is rewritten by the migration. Prepared locally; apply before the matching release.

Focused checks: `RentalLandlordProfileEditor`, `rentalLandlordProfileLayout`,
`rentalLandlordSelectedSignatories`, the autosave and existing capture regressions,
local browser UI/API/SQL verification, and `check:app`.

## Landlord profile acceptance

`npm run test:rentals-application-handoff` now includes the current landlord
profile acceptance matrix, draft recovery and shared-editor field checks alongside
the existing landlord-to-tenancy journey and portal activation retry checks.
The full journey installs the consistent-saving, conditional-rule and selected-
signatory migrations; it cannot silently verify the older profile contract.

The isolated PostgreSQL/API matrix covers all five legal structures, each foreign
classification and each other-entity classification (15 resolved combinations).
Two additional unresolved cases retain drafts while denying submission and any
completed listing-ready evidence claim. For each resolved combination it verifies:

- Partial drafts, saved reopening, invalid-answer rejection and explicit clears.
- Stable Client/contact IDs, private answers and exact selected-person references.
- Version and discovery conflicts, explicit fresh-save decisions, staff versus
  landlord declaration permissions, submission locks and requested corrections.
- Real upload tickets and byte metadata, completion retries, signed-disclosure
  review, rejection/replacement, changed identity generations and retained history.
- Signed-mandate and exact property/unit/vacancy listing handoff, wrong-property
  rejection, idempotent links, and reopened listing evidence.
- The actual listing-editor save service, no stale second contact/listing write,
  permanent Client edits, reverse alignment and rejected stale Client edits.

Autosave exercises pending-request failure, later typing, blank answers, scoped
recovery and confirmed retry for every resolved combination. All three capture
surfaces render the same applicable fields. The expanded landlord evidence matrix
retains its existing policy-preview status: accepted uploads do not silently turn
it into an active compliance approval. The prescribed disclosure mandate gate is
verified independently.

This check creates only synthetic in-memory records and fixture file bytes. It
uses the actual API, SQL migrations, triggers, scoped commands and save service;
Auth and Storage transports are local adapters. It does not prove hosted login,
email delivery, actual Storage transfers or deployment. No new database migration
is required by this test-only change. The existing before-production migrations
remain unapplied remotely. Current results and release limits are recorded in
`../docs/rental-lead-pilot-acceptance.md`.

## Landlord next best actions

The landlord Overview offers the action for each saved journey step: review a
new lead, confirm contact, schedule or complete appraisal, prepare the mandate,
record it as sent/completed, upload the signed mandate, create a draft listing,
and view the linked listing. Review moves New to Contacted. Confirming contact
opens Appraisal scheduled before the appointment is booked; the existing
appointment form captures its date. Manual send records the agent, property
and time without sending a message or advancing the stage. Mandate completion
uses the existing property/signature recording flow. Signed uploads advance to
Listing ready only after the saved document is returned and the mandate record
passes verification. Existing files can be reused on retry, including submitted
onboarding. Multi-property leads require an explicit property choice. Draft
creation and listing links retain their saved lead/property identities.

Release `20261015074830_rental_landlord_next_action_contact_step.sql` before this
primary-app change. This append-only migration retains the role, scope, history,
mandate and listing guards while permitting explicit contact confirmation without
an invented appointment date. It has not been applied remotely. Focused checks:
`RentalLandlordNextAction`, `RentalLandlordOnboardingPanel`,
`RentalLandlordLeadWorkspace`, `rentalLandlordWorkspace`, `rentalLeadJourneyService`
and the local database `rentalLeadJourneyGuards` Vitest suites.

## Rental onboarding discovery

Tenant application first version adds gross/net income, monthly expense categories,
funding contributions and sponsors, other adult occupants and a dependent count,
employment arrangements/verification contacts, and a first-time-renter history
route. The final review displays saved answers with section edit links. Tenant
onboarding reuses buyer/seller welcome, mobile header, illustration, option card,
section header and action components, with the buyer form dimensions and inputs.

New applications reuse the saved qualification move date, occupants, pets,
employment and deposit availability. Existing drafts offer **Use saved qualification
answers**, which fills only missing answers. Neither path imports screening consent
or internal call notes. Tenant edits and submitted snapshots are retained.

Rental application settings now include optional rent/net-income guidance, income
document periods and sponsor/guarantor preferences. These are review guidance;
no automatic approval or decline rule is introduced. New applications snapshot
these settings; existing applications keep their policy. Explicit net income is
projected into the legacy income field for existing review/evidence readers.
Sponsors retain separate identity, permission and income evidence requirements.

Release requires `20261019204416_rental_application_first_version.sql` with the
matching primary app. This migration is prepared locally, not applied remotely.
Focused checks include `rentalApplicationFirstVersion`, field mapping, wizard,
applicant journey, tenant profile and application settings tests, plus the existing
rental qualification/application connection and handoff acceptance checks.


The repaired rental flow now has one joined acceptance check covering new landlord
and tenant leads, saved discovery/uploads and mandate, listing/vacancy, attended
viewing, current application review, uploaded agreements, move-in activation and
both portal audiences. `npm run test:rentals-application-handoff` runs it for five
tenant/entity types, alongside activation retry checks and the existing handoff
contract. The other established move-in, signing and migration integrity checks
remain the focused verification entry points.

An accepted portal invitation can now be retried by the same signed-in person
without another membership or changed acceptance timestamps. Old tokens cannot
restore revoked or replaced membership access. Release
`20261014221411_rental_client_portal_activation_retry.sql` after the five repairs
below. See [repair acceptance and release handoff](../docs/rental-lead-pilot-acceptance.md)
for migration order, source/evidence scope and remaining hosted acceptance.
No production release or remote data change was performed by this acceptance.


Tenant and landlord private-link portals and signed-in portals now read the same
saved tenancy progress: current lease version, received signatures, verified
move-in payments and incoming inspection/handover. Draft or unsigned leases no
longer appear active. The tenant overview shows the actual outstanding move-in
step; landlord tabs show saved property records instead of sample portfolio,
statement, document and messaging screens. Tenant snapshots, identity evidence,
internal notes, contractor costs and access arrangements stay outside landlord
responses.

Shared lease files, linked payment proofs and handover uploads open through a
relationship-checked server request and a five-minute private download link.
Unreviewed agreement drafts and unlinked uploads stay private to staff. Historical
HTTPS lease links remain available; unknown bucket references and unsafe URLs
are excluded. Existing property document records with no shared file are shown
as records, without inventing a download. Supporting application uploads continue
through their existing application/person links; no documents are generated.

Signed-in tenants can now use the same real maintenance queue as private-link
tenants. A saved receipt makes retries idempotent, request creation and the first
tenant-visible event commit together, and failures keep the form and entered
answers open. Token expiry, membership revocation, user, audience and organisation
scope are checked before returning progress or signing a file URL.

Release `20261014214622_rental_portal_journey_parity.sql` after the four rental
repair migrations below, with the matching primary app/API. It adds membership
provenance and a server-only maintenance command; it does not grant portal clients
direct maintenance or tenancy writes. Focused checks: `rentalPortalJourneyParity`,
`rentalLandlordPortalSnapshot`, `RentalClientPortalParity`, the existing application
acceptance and uploaded-agreement/move-in suites, plus `npm run check:app`.
The isolated browser verifies portal reads against real PostgreSQL; hosted Auth,
Storage downloads and release acceptance remain separate. No migration, live
upload, invitation, publication or deployment has been performed remotely.


Tenancy preparation now uses one application-backed path from the approved
application or the Placement Handoff screen. A new tenancy requires the tenant’s
fixed **Placement ready** stage, reserves the selected unit and atomically saves
the tenancy/lease links on the lead. Retries reuse those records and preserve the
approved answers. Existing listing-activity lease entries remain history; new
placement no longer creates an activity ID that cannot open a tenancy.

Lease setup uses uploaded agency agreements and signed copies. Save changed terms
before uploading the agreement for that exact version, review the saved parties,
then upload and confirm each person’s signed copy. Private immutable file receipts
bind evidence to the lease version and signer. A file that uploaded but failed to
link can be retried without uploading again or deleting a potentially saved file.
Generated lease schedules and raw agreement/signature URL capture are retired from
this journey. Existing signed evidence and historical lease references are retained.

Move-in payment evidence uses the same private upload and retry path.
Activation still requires every signature, verified deposit/first-rent evidence
and completed incoming inspection/handover. Changed payment amounts invalidate
previous verification while retaining its evidence for review. Incoming handover
now exposes its actual saved checklist and uploaded evidence in the tenancy and
its context-bound Inspections screen. Maintenance links retain the scoped tenancy
when logging an issue. A reserved unit is
excluded from new tenant intake. The tenancy workspace shows current-version dates
and rent, and opens the canonical listing, managed property and approved application.

Release dependency: `20261014210353_rental_tenancy_handoff_uploaded_agreements.sql`
after the lead, listing/vacancy and tenant application connection migrations, with
the matching primary app. The new private `rental-lease-files` bucket and its scoped
read/insert policies are part of that migration. No historical data backfill,
remote migration, storage upload or deployment has been performed for this repair.
Focused coverage: `rentalTenancyUploadedAgreements`, lease signing and conversion
panels, placement and tenancy pages, application journey and handoff compatibility,
plus the established move-in and app checks.

Tenant application setup now connects the saved tenant lead, monthly rental
listing, managed property/unit and available vacancy in one transaction. The
selector displays property names and unit labels. New drafts require the fixed
journey's **Application pending** stage; retries reopen the same application and
retain the original enquiry when another property is selected. Existing submitted
applications are read through their vacancy connection without rewriting signed
answers or uploads to retrofit a listing reference.

Preparing or revoking a draft invitation saves its access token and onboarding
metadata together. Replacement links invalidate earlier main invitations while
retaining per-person document collection links. Preparing/copying a link does not
send it or advance the lead. Public submission saves consent evidence and the
submitted snapshot atomically; a lost submission response can be retried safely.
Public property confirmation uses the same visible fields as the application so
internal connection metadata cannot trap the tenant on the confirmation step.
Outstanding evidence remains uploadable after submission, through the existing
saved checklist and review controls. This phase adds no document generation.

Release dependency: `20261014203952_rental_tenant_application_connections.sql`
after the lead journey guards and listing/vacancy handoff, with the matching
primary app/API. No remote data backfill is required. Focused coverage includes
`rentalTenantApplicationConnections`, `RentalLeadApplicationSetup`,
`RentalTenantApplicationPanel`, the public API and existing application journey,
upload, reviewer and listing overview checks. Prepared locally; deployment and
remote migration remain separate release work.

Landlord listing handoff now carries the managed property, selected unit and saved
vacancy into the listing and landlord portfolio. Completed monthly listing saves
connect one draft vacancy through `rental_ensure_listing_vacancy`; retries retain
the same listing, uploaded photos and confirmed save revision. An existing open
vacancy is reused without overwriting its application/letting terms. Saving or
linking does not open applications or publish an advert. Non-monthly rentals keep
their existing pricing flow. Loading a listing performs no repair writes.

The property Landlord tab searches existing organisation contacts by name, email
or phone, then records the chosen owner's share and primary-contact choice.
Contacts are reused without changing their sales or tenant identity. Portfolio
entries can select a managed unit and open the managed property, ownership and
vacancy screens. Submitted landlord declarations remain intact when bookkeeping
links are recorded. Both landlord portal access paths show the same saved listing
and vacancy status, with applicant details and supplier payloads excluded.

Release dependency: `20261014200329_rental_listing_vacancy_handoff.sql` after the
lead journey guards, with the matching primary app/API. The migration makes
no historical backfill. It retains existing RLS, rejects foreign property/unit/
contact links and prevents replacement of a saved vacancy. Prepared and checked
locally; no remote migration, publication or deployment was performed.
Focused checks: `rentalListingVacancyHandoff`, `rentalLandlordPortalSnapshot`,
`RentalListingInventoryPanel`, `RentalLandlordListingProgress`,
`RentalLandlordMandatePanel`, listing save/recovery and landlord portfolio handoff
tests, plus the existing landlord onboarding and rental foundation checks.

Rental lead journeys keep a fixed tenant or landlord role. Tenant milestones run
from New, Contacted and Qualified through viewing, application, screening and FICA
to Placement ready. Landlord milestones run through contact, appraisal and the
signed mandate to Listing ready and Listing created. Each advance retains its
actor and evidence in the lead's saved workflow history. Qualification uses the
saved answers; viewing, mandate, application and review milestones verify their
linked records. Placement readiness requires an approved application. Unknown
saved stages require review rather than restarting at New, and an activity-only
tenancy reference does not complete the Lease milestone.
The tenant overview exposes confirmation of a submitted application, continuation
to FICA after screening, and FICA completion after its application review. These
actions retain the current stage and show the missing-record/review reason when
the saved evidence does not permit advancement.

Rental classification survives legacy/nested metadata, editing and portal imports.
Tenant records are excluded from buyer stage conversion. Sales lists and seller
linking exclude rental leads; old sales workspace links redirect to Rentals.
Rental assignment notices use the rental route and role. Sales CSV import rejects
explicit tenant/landlord rows before category locking; rental import requires a
supported, unambiguous role. Historical Lost/Withdrawn outcomes stay closed unless
an explicit rental reactivation is saved. No document generation is added here.

Release the primary app with the append-only migration
`20261014185302_rental_lead_journey_guards.sql`. It guards classification, role,
scope, one-step transitions, append-only milestone history and record-backed
evidence at the database boundary. It performs no backfill. Existing contacts,
documents and lead identities remain intact. This change is prepared locally;
the migration has not been applied remotely and the app has not been deployed.

Focused checks: `rentalLeadJourneyGuards.test.js`, `rentalLeadJourneyService.test.js`,
`RentalLeadSalesBoundary.test.jsx`, `leadSourceRentalImportBoundary.test.js`, the
existing rental CRM/pipeline/handoff/import/outcome model checks, buyer migration,
seller-link/sales-list checks, and Property24 lead import checks.

The rental listing Landlord tab shows a saved profile summary, contact and ownership
cards, and native landlord onboarding. Contact edits update the client and listing
with readback; linked onboarding is saved through its versioned API first. The
capture draft receives the same landlord fields so a later listing edit cannot
restore an older contact. A partial save remains an error with a retryable form.
Submitted onboarding stays locked until the agent requests corrections.

**Start landlord onboarding** explicitly creates a rental Landlord Lead for an
existing saved contact and listing. Loading the page does not create records.
Creation uses an insert and scoped readback; retries reuse committed records,
and the saved landlord lead ID resolves the connection when other leads exist.
The editor preserves other portfolio properties and untouched identity fields.
Secure links can be copied and revoked; these controls do not send email.
Uploads remain in Documents. The listing profile prefers saved onboarding facts
and distinguishes basic details captured from approved document evidence.
Focused checks: `RentalListingLandlordPanel`, `rentalListingLandlordService`,
`rentalListingLandlordModel`, `RentalListingDetailPage.overview`,
`rentalLandlordOnboardingApi` and `rentalListingConditionalRequirements`.

The landlord lead Documents tab and landlord onboarding reuse the sales document
workspace presentation: the same header, category tabs, progress, status/activity
columns, row Actions menus and secure-storage footer. Rental categories are FICA,
Property Documents and Rental. Upload/Request opens an exact saved-requirement
selector; evidence reviews retain the required note and explicit signed-disclosure
confirmation. Suggested supporting documents remain distinct from the
prescribed-disclosure mandate gate. Existing references and linked listings are
retained, with new reference entry collapsed by default. Saved requirement IDs,
generations, uploads, review commands and collection policy are unchanged.
Focused checks: the shared `LeadDocumentWorkspace` and `ListingDocumentActions`
suites plus `RentalLandlordOnboardingDocuments`, `RentalLandlordOnboardingPanel`,
`RentalLandlordOnboardingPage` and `RentalLandlordLeadWorkspace` Vitest suites.

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

### Split calculator local review (21 October 2026, not released)

`HomeSeekersSplitCalculator` sits immediately after `#maths` on the join page.
All seven brokerage formulas are in `homeSeekersSplitCalculatorModel.js`.
Defaults use ten sales, R1.5 million average price, 6% commission and 70/30:
R900 000 gross, R270 000 current fees, R123 000 Home Seekers fees and R147 000
annual difference. Results are ungated, update live and include explicit
higher-cost, equal-cost, invalid-input and zero-sales states. The 70/30 break-even
uses the current price/rate; other models receive their own accurate loss wording.
The calculator alone uses Poppins and the requested orange/black palette.

The two buttons open the existing local session/qualifier forms. Optional email
capture recomputes and saves all inputs/result to local preview records with
source `homeseeker_join_split_calculator`. An expandable email/input preview is
shown; nothing is mailed or written to the remote CRM. The two distinct events
are `calculator_completed` (once on initial result) and
`calculator_email_submitted` (after local capture). Production tracking helpers
respect existing domain/consent checks, send no contact/financial data and use
only the configured Google ID. Local review never sends ad conversions.

Before release, add real server-side capture/delivery with CRM persistence and
fire the email conversion only after confirmed delivery acceptance. The current
local draft fails closed for email capture outside localhost. Focused checks:
`HomeSeekersSplitCalculator.test.jsx`, `homeSeekersSplitCalculatorModel.test.js`,
existing next-steps, signup and pixel tests, scoped ESLint, standalone build and
desktop/mobile browser verification.

### Next steps local review (21 October 2026, not released)

The join page’s `HomeSeekersNextSteps` section replaces the earlier booking-card
draft above the FAQ. It has the founder qualifier (valid FFC plus five sales OR
R6 million sold), all three outcomes, eight sample founder slots per week, four
sample Thursday 18:00 SAST sessions, registration, confirmation and an ICS file.
The standalone localhost application uses the existing questionnaire in explicit
preview mode, accepting any six-digit verification code without an account.

All new booking flows are local review fixtures. Their records, source, outcome
and six distinct milestone names are stored only under
`home-seekers-next-steps-review-v1` in this browser. The section includes an
expandable records/events inspector and a reset action. No CRM write, reservation,
email/SMS send or reminder job occurs. Non-local booking requests fail closed.
The custom pixel helper respects the existing consent/domain restrictions and
never emits test events from localhost; `application_completed` is separate from
signup, verification and document completion.

Before release, configure the real founder calendar and global weekly cap, confirm
the actual session schedule and webinar attendee privacy, implement tenant-scoped
CRM persistence and durable confirmation/reminder delivery with the join link,
and replace the sample availability. The current local preview must not be
published as a working booking system. No schema change is included.

Focused checks: `HomeSeekersNextSteps.test.jsx`,
`homeSeekersNextStepsModel.test.js`, `HomeSeekersJoin.test.jsx`,
`homeSeekersPixel.test.js`, and `RecruitmentSignupModal.test.jsx`; standalone build
and desktop/mobile browser review.


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
`src/homeSeekersMain.jsx`), containing only Home Seekers routes. The standalone
homepage is `/`, with clean links such as `/buying`, `/selling` and `/join`.
The builder sets `VITE_HOME_SEEKERS_STANDALONE` for this entry only; the same page
components retain `/demo/homeseekers` links inside the Arch9 app. Old standalone
demo URLs redirect in the browser, preserving search parameters and fragments.
The standalone entry excludes the private app, CRM pages and staff
authentication. The builder disables dotenv loading for this public entry
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
The root serves the homepage directly; real files and functions resolve before
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

The local Vite preview reads the public listing feed from
`https://www.homeseeker.co.za/api/home-seekers/site` through a GET-only local route.
This lets `/demo/homeseekers` show current published homes without production
credentials. It requires internet access and an available public website;
local analytics remain disabled.

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

### Home Seekers public traffic reporting (prepared)

The Marketing website report now reads `home_seekers_public_dashboard_analytics`
for the Home Seekers site only. The standalone analytics endpoint requires the
new tracker version and the actual request hostname to be `homeseeker.co.za` or
`www.homeseeker.co.za`. Arch9 demo paths, hosted previews, embedded pages,
marked staff-preview tabs and known automated browsers are excluded. Preview
links from Marketing mark the tab so following its public-page links remains
excluded. Visits expire after 30 minutes of inactivity in the same browser tab;
they are browser sessions rather than unique people. Unidentified bots or staff
who independently open the normal public URL cannot be distinguished from public
visitors by this aggregate-only tracker.

New aggregate dimensions use a `public-v1:` hostname prefix and South African
calendar dates. Historical mixed traffic remains stored but is not reported as
verified public traffic. Public enquiry/lead counters likewise require the new
hostname/version attribution; older submissions remain available in the enquiry
workspace. The visit chart uses visits, and zero days remain zero. The report
does not substitute legacy counts when its new RPC is unavailable.

Release migration `20261012124805_homeseekers_public_traffic_analytics.sql` before
the primary-app Marketing screen and the separate Home Seekers website package.
No migration or deployment has been performed for this correction. Use
`node --test server/tests/homeSeekersPublicTraffic.test.js
server/tests/homeSeekersWebsiteBridge.test.js server/tests/homeSeekersLeads.test.js
server/tests/homeSeekersWebsiteDeployment.test.js` and the HomeSeekersListings
and HomeSeekersLeadForms Vitest checks. Database checks run in isolated PGlite;
the deployment fixture builds the standalone site and calls only loopback APIs.

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

Meta Pixel `2613784669083210` is configured for `homeseeker.co.za` and
`www.homeseeker.co.za`, plus the Home Seekers applicant portal at
`app.arch9.co.za/applicant/my-profile`. Google Analytics remains optional through
`VITE_HOME_SEEKERS_GOOGLE_ANALYTICS_ID`. Scripts load only after the visitor opts
into measurement; the preference is remembered on each origin and can be changed
through Tracking preferences or the existing Join checkbox. Preview hosts, the
embedded demo, internal preview visits and other private app routes are excluded.
The unconditional noscript image is deliberately omitted so it cannot bypass the
visitor's choice. Meta automatic form configuration and automatic history tracking
are disabled; explicit events contain no application answers, contact details,
passwords, file names, document paths or document contents. First-party
application conversions are recorded only by successful database capture; client
requests cannot manufacture that event. Guarantee clicks have a separate event.
The PPRA event is reserved; no letter link or section appears until an approved
PDF is supplied.

The Meta events requested on 17 October 2026 are PageView on each page visit,
ViewContent (`Agent Join Page`) on Join, Lead (`Agent Application`) after a
successful initial signup, CompleteRegistration (`Agent Email Verified`) after a
successful email-code verification, and SubmitApplication
(`Agent Documents Uploaded`) only after a confirmed upload returns a complete
required document pack. Failed requests, incomplete packs, context/resume calls
and preview walkthroughs do not trigger these milestones. Random receipt/owner
UUIDs are retained locally for retry/reload deduplication and are never sent to
Meta. Browser-only deduplication does not span devices or cleared browser storage.
The website and primary app both need release for the full upload journey; no
database migration is required. Local checks use fixture responses and an
intercepted Meta script, not real applications or advertising conversions.
Focused checks include `src/pages/__tests__/homeSeekersPixel.test.js` and the
existing recruitment signup, popup and applicant setup Vitest suites. After an
approved release, the pixel owner should confirm receipt in Meta Events Manager.

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

The FFC transfer correction confirmed on 18 October 2026 restores R700 for the
runner plus R640 payable directly to the PPRA (R1,340 in total). The earlier
R950 total came from the supplied plan and was superseded by this confirmation.
The 17 October 2026 copy alignment uses debit order on the 1st for Prepaid
throughout the page and option dialogs,
and explicitly welcomes agents from anywhere in South Africa. The 45-day
hit-rate copy states that 97% of our mandates sell within 45 days. Guarantee copy
consistently specifies a 50% reduction in the agreed commission, borne by the agent,
and requires an exclusive mandate
with a listing price within 2.5% of the recommendation, alongside the existing
viewing-access and good-faith-offer conditions. The comparison retains its
calculated 5.1-sales break-even (six whole sales) at R1.5m and 5% commission;
4.6–4.7 cannot be derived from those assumptions. The growth illustration
updated on 18 October 2026 explicitly uses 6% commission and shows rounded costs
of 26%, 17%, 14%, 10% and 8% at five, eight, ten, fifteen and twenty sales. Its
ten-sale annual cost remains R123,000. These are public copy changes;
they do not configure billing or update an externally managed bot.

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
`arch9_project_url`/`arch9_service_role_key` configuration. The forward correction
`20261013180117_transaction_handoff_worker_service_key_headers.sql` sends opaque
`sb_secret_` credentials in `apikey` only, retaining Bearer headers for legacy
JWT credentials. The worker verifies exact configured `SUPABASE_SECRET_KEYS`
or `SUPABASE_SERVICE_ROLE_KEY` credentials before accessing the queue; decoded
JWT claims alone never authorize it. Its existing `verify_jwt = false` setting
allows that explicit service authentication. No shared key rotation is needed.

An authenticated POST with `{"mode":"health"}` checks required configuration
and reads pending/blocked counts without claiming jobs, preparing matters or
contacting the email provider. Use Vault credentials server-side for the probe;
never copy them into logs or client code. Unknown modes are rejected. The header
correction preserves the existing minute schedule, service-only access, queued
history and buyer/signed-offer prerequisites, and does not release historical
holds. The schedule invokes service-only claims every minute.
Verify a new authorised instruction, its native
intake/matter, inbox/journey records, provider receipt and pending organisation
acceptance after release when eligible work exists; a health check alone does not
verify provider delivery. The focused scheduler fixture covers opaque/legacy
headers, missing Vault configuration, access denial and unchanged queue/schedule
state. Its controlled provider fixtures send no live communications.

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

Permanent deletion now distinguishes protected workflow links from an inactive
partner-website projection left by withdrawal. The forward migration
`20261012083836_listing_delete_unpublished_partner_cleanup.sql` removes only
unpublished partner projections inside the same transaction as permanent listing
deletion. Published adverts, ownership checks, website launches and genuine
workflow references remain protected. A linked-workflow failure restores the
projection too. This migration is prepared locally and requires release approval;
it has not been applied to the hosted database.

Sales and rental delete dialogs offer **Open withdrawal controls** when permanent
deletion is blocked. Sales Quick listing actions also expose **Withdraw listing**.
Withdrawal preserves linked history and archives working stock only after active
channels confirm removal; it does not call the deletion RPC.

Sold listings retain their Sold outcome when archived from either the listings
menu or withdrawal controls. Kingdom's Recently sold collection continues to
show them after operational archival and advert removal. Archive confirmation
checks the saved outcome so a stale listing card cannot replace Sold with Withdrawn.

Focused checks:
`node --test scripts/private-listing-deletion.test.mjs`,
`node src/services/listings/__tests__/listingWithdrawalModel.test.js`,
`node scripts/agent-listings-delete-ui.test.mjs`, and the Vitest
`ListingDeletionBlockedNotice`, `RentalListingsPage.actions` and
`rentalListingDeletionService` tests.

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
URL; saved links open from Marketing. These
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

Private Property rental withdrawal and status refresh use the saved feed property ID
and branch when the public advert number is missing. The channel remains an existing
advert, so it offers updates rather than a new publication. Inactive adverts, failed
status loads and unresolved requests retain their existing safeguards. Activation
event parsing now captures both sale (`T…`) and rental (`RR…`) advert numbers from
Private Property's description field and saves them to the sync and listing records. Late events can repair a missing
number without overwriting a newer status check or withdrawal.
Focused regression coverage uses the existing Private Property post-submit monitor
and operational checks, rental publication recovery, channel model, management panel
and rental listing page tests. No migration is required.

Sales Listing Channels now offer **Relist** and **Update and relist** for existing
portal adverts, including withdrawn/inactive adverts. **Update and relist** opens
the property editor and retains the chosen portal. **Save and continue to relist**
saves and verifies the edited property and publication details without sending
ordinary portal updates, then returns to Marketing with that portal selected in
the relist confirmation. A failed save stays in the editor; cancelling does not
relist. Relisting sends the newly saved content against the existing identity.

Quick listing actions also offer **Relist listing**
for an existing Property24 or Private Property advert. Confirm that it is the
same property and choose the portals to restore. Edited details and materialized
photos are saved before readiness is checked. Property24 receives an Active
content update against its existing advert number and the chosen future expiry
date. Private Property verifies its retained address, requests ForSale (or ToLet
for a rental record), waits for confirmed activation, and then sends the saved
content against the existing feed identity. An address mismatch blocks that
portal and shows both addresses; Relist does not create a fresh identity or
promise a new listing date. Sold/under-offer listings require outcome review.

Each portal has its own result. **Check and continue** observes an accepted
activation/content request without repeating it, and skips completed portals.
Send intent and acceptance are retained in existing listing activity so a page
refresh cannot silently repeat a request whose response was lost. An ambiguous
content send requires checking the advert rather than an automatic retry.
Accepted content and active status still require checking the public page's
displayed details. Restoring a withdrawn Arch9 listing makes it private working
stock; website publication is a separate action. No new migration is required.

Private Property readiness, content updates and reactivation also check the
province in a saved public advert link. A conflicting province blocks sending
even when `GetListingsDetails` returns matching feed address fields. Status
refresh reports Needs attention and records the error while preserving the true
active status, so withdrawal remains available. This is a province conflict
check against the saved link, not full public address verification. Missing or
unrecognised links do not establish the public location. Activated location
corrections require Private Property support; an ordinary resend is insufficient.
The 15 October Capital Park incident safeguard is prepared locally, with no
deployment, live advert change or support message sent. Its regression coverage
uses the existing readiness, controlled-publish and post-submit-monitor checks.

Focused checks: `npx vitest run src/services/listings/__tests__/listingRelistService.test.js
src/components/listings/__tests__/ListingRelistDialog.test.jsx --maxWorkers=1`,
plus the existing Private Property readiness, post-submit monitor and controlled
publish checks. These use fixtures and make no hosted writes.

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
the three wording hashes, fifteen synthetic PDF proofs, all three scoped migrations,
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

Applicants waiting for verification can choose **Edit email address** in the shared
signup and Home Seekers flows, including after account preparation fails or a
signup response is lost. The contact form retains their name, phone and email for
correction, clears the password and asks for consent again. Continuing captures
the corrected address with a fresh receipt and requests its verification code;
the earlier capture remains intact. Ordinary retries keep the original receipt.
Focused checks: `RecruitmentSignupModal.test.jsx`, `recruitmentSignup.test.js` and
`recruitmentApplicantAccess.test.js`. This correction is prepared locally.

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

Meta forms can be classified as **Buyer**, **Seller** or **Recruitment** in
**Settings → Facebook Pages & Meta Lead Ads**. Recruitment routes to the agency's
management-only Recruitment pipeline at **Lead Received**; property-agent and
branch assignment do not apply. The Overview retains the Meta form, campaign,
ad, original submission date and form answers. An enquiry creates no applicant
account, application, membership, invitation or automatic message. Email addresses
from Meta are not marked verified or used to merge separate enquiries.

Live webhooks and historical imports use the same server-only routed ingestion.
Repeated Meta lead IDs recover the original destination even after a form is
reclassified. Historical imports keep their original submission time in the Meta
receipt; the Recruitment receipt time records when Arch9 received the import.
Finish an active historical import before changing its form routing. Recruitment
event payloads follow the same agency management roles as Recruitment records.

Release order: apply `20261018092935_meta_lead_ads_recruitment_routing.sql`, deploy
`meta-lead-ads-admin` and `meta-lead-ads-webhook`, then release the primary app.
The existing property ingestion RPC deliberately rejects Recruitment mappings to
prevent an older handler from creating a Buyer lead. Local validation also uses
`src/components/marketing/__tests__/MetaLeadFormRouting.test.jsx`,
`node --test scripts/meta-integrations.test.mjs`, and the Deno
`supabase/functions/_shared/metaLeadAds.test.ts` tests from the repository root.

Phase 1 captures staff and referral enquiries at **Lead Received**. Name and at
least one contact method are required; source, preferred area, referrer and notes
can be saved. Receipt time, capturing user, intake channel and an intake key are
stamped by the database. Repeating the same draft creation recovers its original
record. An append-only activity history records receipt, edits, closure and
reopening; receipt metadata cannot be changed by callers.

The Overview shows **Lead Received → Application Submitted → Documents Uploaded →
Under Review → Application Approved → Contract Sent → Contract Signed → Agent
Activated**. Documents Uploaded reflects saved supporting files after application
submission; later records without files show “Not uploaded” for that milestone.
Onboarding checks remain part of the work between Contract Signed and actual
activation. A completed onboarding record stays at Contract Signed in the journey
until activation is recorded. Historical joined records are retained separately
without implying that an agent account was activated. The onboarding readiness
indicator does not advance the journey.
The Next best action box provides contact recording, a document reminder,
manual document upload, application review and approval/rejection, contract
delivery and signature recording, and activation. Contact recording keeps the
lead at Lead Received; only a completed, verified application reaches Application
Submitted. Review requires saved files or recorded exceptions for all four
required document types. Approval queues the notice automatically. Contract and
activation actions open the existing evidence checks before advancing the stage.
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

**Home Seekers contact-first refinement (10 October 2026, phase 1):** the
Home Seekers wrapper now advertises `verificationMethod: email_code`. Its form
collects name, surname, email, mobile, a login password and contact consent without a
package commitment. `signup` saves the contact enquiry first and prepares an
unconfirmed Auth account with that password; existing accounts are never reset or
given organisation membership. The same contact receipt and submission key
recover uncertain responses without another lead.

**Submission and document handoff (10 October 2026):** Home Seekers final review
uses **Submit Application**, followed by **Application under review** and a
**Log in & upload documents** link. The initial password is sent only to Auth,
never to contact capture, questionnaire JSON or email. The account is still
unconfirmed until the numeric email code is verified. Existing accounts retain
their password; returning applicants can continue using an email code.

`/applicant/my-profile` now offers email/password login first, with code recovery.
Its server endpoint accepts `sign_in` through the existing canonical applicant
session checks. It exposes the submitted application and protected uploads,
including ID/passport guidance for FICA, an FFC certificate under registration
evidence, and supporting FICA/proof-of-address files under the existing `Other`
document type. It does not grant agency membership or approve an application.

The existing submission queue and dispatcher send a Home Seekers confirmation
with the canonical login link, password login instructions and FICA/FFC next
steps. The message never contains the password and retains the queued delivery's
idempotency and recovery behavior. No new migration is needed for these changes;
the existing applicant setup/document and submission queue migrations must be
present. Release the website/API, primary app and email handler together. Local
previews simulate submission and send no accounts, applications or emails.

Home Seekers `send_verification` uses the existing request budget and invokes
the server-only `home_seekers_recruitment_code` route in `send-email`. That route
loads the immutable contact capture within the fixed Home Seekers organisation,
generates the Auth OTP without sending the shared Auth email, and sends only
the numeric code through Resend. No activation link or button is included.
The applicant stays in the open form, can request another code after the
cooldown, and continues on the same saved enquiry after canonical Auth
verification. Send failures acknowledge the saved contact; invalid, used or
expired codes offer same-form recovery. Both six- and eight-digit provider
codes are supported; expiry follows the deployed Auth configuration. Shared
recruitment links retain their existing password and Auth-email behaviour.

Release requires the updated `send-email` function before the Home Seekers
website/API artifact and the primary app. No database migration or global Auth
template change is required. A real-inbox verification check remains necessary
after an explicitly approved release; local checks send no email. In addition
to the focused checks below, run `deno test --allow-env --allow-read --allow-net
--config ../supabase/functions/send-email/deno.json --no-lock
../supabase/functions/send-email/handlers/recruitmentVerificationCode.test.ts`.

The earlier shared-popup foundation is described below for context.

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

### Home Seekers questionnaire refinement (phase 2)

The Home Seekers popup saves valid partial answers after a 1.5-second pause,
shows whether the draft is saved, and restores both answers and the saved step.
Named steps let applicants revisit earlier sections; required answers still gate
progress. Save & close and sign-out save changed answers first. Refreshing or
closing the browser warns while there are unsaved changes. Draft saving never
submits an application, and answers are not stored in browser storage.

An expired session offers email-code verification inside the same popup while
retaining the unsaved answers. The server returns the original contact receipt
only after checking canonical applicant access, so recovery stays attached to
that enquiry. A draft changed elsewhere requires an explicit reload. Uncertain
save responses retain the exact request for retry before saving newer typing;
automatic saves never replace answers typed while a request is in flight.
Review declarations must be confirmed again after verification recovery.

This refinement uses the existing questionnaire and session migrations. No new
schema or global Auth configuration is needed. The recruitment Vitest directory
and standalone Home Seekers packaging checks cover saves, resume, conflicts,
retries and session recovery using isolated SQL and synthetic Auth responses.
Desktop and mobile browser checks use a synthetic local applicant; live email
delivery and the production journey still need an approved release and check.

### Home Seekers package preference (phase 3)

The last questionnaire screen asks which of the website's three payment options
interests the applicant: Paid from your deals, Monthly debit order, or Annual
upfront payment. Decide later is an equal choice. No option is preselected. A
valid partial draft can be saved without a choice; final review requires an
explicit preference or Decide later. The wording makes clear this is not a
commitment, and there is no payment or package activation in this flow.

The choice saves and resumes with the existing lead, appears in final review and
the Recruitment questionnaire/application summary, and is copied from the saved
draft into the immutable submitted application. Browser-supplied answers cannot
override the reviewed choice during submission. Older complete drafts retain
their answers and return to the last screen to choose; already submitted
applications remain unchanged.

Apply `20261010131128_home_seekers_recruitment_package_preference.sql` after the
existing verified-submission migration before releasing this frontend/API change.
It extends the existing JSON normalizer, draft/submission validation and guards;
no table or column is added. Home Seekers is matched by its canonical organisation
ID, and package fields are rejected for other organisations. Function privileges,
verified session checks, revision conflicts and idempotent retries remain in place.

Use the recruitment Vitest directory and standalone Home Seekers packaging check.
The isolated database journey covers all four choices, missing/invalid choices,
partial saves, resume, retries, immutable submission, old-record compatibility and
agency/role isolation. Browser checks use a synthetic local applicant. No remote
migration, email, payment or deployment has been performed for this phase.

### Home Seekers final journey checks (refinement phase 4)

Code entry accepts a complete pasted six- or eight-digit code even when copied
with spaces. Missing email, code or password errors describe the relevant field,
focus it and associate the message with it for assistive technology. Home Seekers
never asks for a password in this journey.

Before verification, **Use a different email** lets an applicant correct a typo.
The original contact capture is retained; the corrected email requires fresh
consent and a new receipt. A request in flight cannot be interrupted by this
action. Closing and reopening the popup before verification retains the original
receipt without another capture or automatic email. Returning after a page reload
uses **Already started? Continue with an email code**. Verified applicants resume
through their opaque session; submitted applications reopen as confirmation.

Run the existing recruitment Vitest directory, standalone Home Seekers packaging
check and code-email handler tests described above. Browser acceptance covers
contact capture, invalid/expired codes and resend, all questionnaire screens,
save/close/reopen, verification recovery, package preference, review consent and
submission on desktop and mobile. The fixtures are local and send no email.

Local acceptance on 10 October 2026 passed 324 recruitment checks, 16 standalone
packaging checks, five code-email checks and `check:app` (lint has existing
warnings and no errors). The browser rehearsal retained all 26 normalized answer
fields through expiry/reopen and produced one capture and one submission, with
Decide later retained. At 390px, the popup's client and scroll widths were both
344px. Evidence is in `output/playwright/home-seekers-phase4/`; this is synthetic
local acceptance, with the real-inbox check still outstanding.

For an approved release, first confirm the target and recovery evidence using the
[database release runbook](../docs/database-release-runbook.md), and inspect the
exact pending migration scope. Apply the phase 3 package-preference migration
before dependent code, release the code-email `send-email` handler, then deploy
the Home Seekers website/API and matching primary app. Build from an approved
production base with the scoped recruitment changes; do not release unrelated
work from the active working tree.

After release, an approved real-inbox canary must prove delivery, the provider's
actual code length/expiry and latest-code recovery, same-tab completion, resumed
answers, one unchanged lead through retries, and the chosen non-binding preference
in Recruitment. Check all four preferences, including Decide later. Local tests
do not prove hosted Auth configuration, inbox delivery or production behaviour.
No remote migration, email or deployment is performed by the local checks.

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

Home Seekers verified Join Us submissions queue **Thank you for your application**
followed by separate **Log in and upload your documents** instructions. The controlled login link opens
`/applicant/my-profile`, with one navigation item, **My Profile**. It shows a
private profile picture, the submitted questionnaire snapshot and the four
required document uploads, plus the required supporting FICA/proof-of-address upload
(retained as the `Other` upload type).
The website confirmation points to this profile screen. Applicants log in with
their application email and password, with an email code available for recovery.
A normal app login also redirects a pending
applicant here and opens their restricted session using a server-validated Auth
identity. Invitation acceptance remains reachable, while agency navigation stays
locked until the latest submitted application reaches Agent Activated.

The applicant login and My Profile screens use Home Seekers' logo, charcoal and
orange palette, typography, browser icon and page title. The responsive profile
puts the saved application status and document checklist first, with custom file
controls, saved filenames and downloads. Submitted answers stay available in an
expandable summary. These presentation changes retain the existing restricted
login, private uploads and activation gate; other organisations' signup forms
keep their current presentation.

Profile pictures use a separate private `recruitment-profile-photos` bucket
(JPG/PNG up to 2 MB). Prepared immutable upload requests and actual Storage
metadata must match before confirmation. They do not count toward Documents
Uploaded, change the submitted questionnaire, create membership or publish agent
media. Documents and pictures are preserved after approval. The submission email
queue uses the verified applicant binding, its own server-only dispatcher, saved
provider attempts and the existing 23-hour retry window. Older submissions are
not automatically emailed.

Apply the append-only migrations `20261010145840_recruitment_applicant_arch9_setup`,
`20261010150417_recruitment_applicant_login_gate` and
`20261010151044_recruitment_activation_access_gate` after the recruitment journey
migration. Deploy the updated `send-email` function and
`recruitment-submission-dispatcher` before the updated app and Home Seekers website.
The new dispatcher uses the existing Vault project URL/service key and pg_cron
schedule. Verify a new submission's queue, provider receipt and applicant setup
after an approved release; local tests use simulated storage and email providers.

New Home Seekers **first-screen contact receipts** also queue three separate staff
notifications: `thomas@homeseekers.co.za`, `admin@homeseekers.co.za` and
`alex@arch9.co.za`. The event is the committed contact save, before account
preparation, email verification or full questionnaire submission. Notifications
include the original contact details and a link to the saved recruitment lead.
Manual leads, other agencies and historical contacts are excluded. Contact-save
retries reuse the same three jobs. Each recipient has a saved provider payload,
lease and receipt; failed recipients retry independently and uncertain sends stop
before Resend's 24-hour idempotency window expires. Controlled test contacts are
suppressed before notifying real staff addresses.

This follow-up requires the append-only
`20261010153201_home_seekers_recruitment_contact_notifications.sql` migration and
`recruitment-contact-dispatcher` Edge Function. Deploy the function before applying
the migration after approval. The existing Vault project URL/service key and
pg_cron invoke the worker every minute when notifications are pending. No frontend
change is required. Verify a new contact's three queue rows, provider receipts and
recipient inboxes after release; local checks do not send actual emails.

The append-only `20261010154503_home_seekers_recruitment_email_flow.sql` migration
extends the existing queues and workers with the complete Home Seekers email flow:

- **New Lead Received** is queued when the first contact form commits to the CRM.
- **New Application Received** is queued when the complete verified questionnaire commits.
- **{Applicant} has uploaded their documents** is queued when the requested document
  pack becomes complete, including proof of address and any recorded exceptions
  for the four original document categories.
- All three staff events have separate retained jobs for `thomas@homeseekers.co.za`,
  `admin@homeseekers.co.za` and `alex@arch9.co.za`.
- Applicants receive a thank-you explaining the second email, followed by a
  My Profile login link and a checklist explaining each requested document. A single
  follow-up becomes due 24 hours after submission if files are missing. It lists
  remaining files and stops after completion, approval, closure or activation.

The instructions wait for the thank-you's provider acceptance (or an explicit
suppression/review state), and the one-day reminder requires accepted instructions.
Every email has its own provider attempt and queue lease. Retry payloads stay
frozen. The reminder's 23-hour retry window starts with its first provider attempt,
so being scheduled a day later does not expire it before it can send. Historical
emails are not backfilled. Proof of address is included in Home Seekers readiness
and review checks; other agencies retain their existing document rules. Private
queues remain inaccessible to applicants and managers.

Release requires the updated `send-email`, `recruitment-contact-dispatcher` and
`recruitment-submission-dispatcher` functions, this migration and the primary app.
Stop the workers during the schema/function cutover because the submission
completion RPC now carries a queue lease. Resume the existing one-minute schedules
once versions match. Apply and dispatch only after release approval. Confirm
recipient inboxes separately from provider acceptance; local database/provider
fixtures and email previews do not establish inbox delivery.

Home Seekers recruitment branding is shared across these six notifications,
verification codes, approval notices and recruitment invitations. Staff recipients
use the same Home Seekers sender as applicants, including notifications addressed
to `alex@arch9.co.za`. Fresh sends require an unpaused, verified Resend identity
in `email_sender_identities` for the Home Seekers organisation, using
`homeseekers.co.za` or its sending subdomain. They cannot fall back to an Arch9
mailbox. A missing identity leaves automated notifications pending and prevents
verification code generation; configure the verified domain and identity before
releasing this change. Frozen provider retries retain their original payload.

Branding resolves server-side from the saved organisation. The black
light-background logo is used on white. Saved SVG logos fall back to the email
PNG at `public/brand/homeseekers/recruitment-logo-on-white.png`, exported from
the existing black wordmark with an opaque white background. Publish this asset
with the primary app before releasing the handlers. Orange buttons use dark
text; support links use dark text on white and point to Home Seekers. Approval
and code messages provide the appropriate next step without an activation CTA.
The browser previews use a local copy of the same asset and do not send email.

Focused branding checks: `deno test --allow-env --allow-read --import-map
supabase/functions/send-email/deno.json
supabase/functions/send-email/services/homeSeekersRecruitmentBranding.test.ts`
from the repository root, together with the recruitment handler/dispatcher and
shared email branding/layout tests. A post-release inbox review in Gmail/Outlook
is still required; browser rendering does not establish inbox delivery or
client-specific dark-mode behaviour.

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


## Agency client profiles

The primary agency Clients directory uses permanent client profiles after applying
`20261009113042_agency_client_identity_and_reviewed_merge.sql`. Existing contacts,
enquiries, prospects, buyers, transaction parties and listing sellers are indexed
without rewriting their source records. Source-table triggers maintain those
associations for later intake. Only a valid known email or an existing source
relationship matches automatically; names and shared phones suggest a review.
The same email can belong to independent profiles in different agencies.

Open a client to see alternative emails/phones and links to their enquiries and
transactions. Owners and principals can edit primary contact details and review
two profiles before merging. A merge requires a reason, explicit confirmation
and unchanged versions of both profiles. It preserves source records and email
marketing preferences, retains alternative identifiers, redirects former profile
references and records the approving account and original associations. There
is no self-service undo. Staff access cannot widen through a merged profile;
profiles containing inaccessible source records remain restricted. Missing
identity tables show setup pending and leave existing records accessible.

Focused local checks (no hosted writes or communications):
`node scripts/client-identity.test.mjs` and
`npx vitest run src/core/clients/__tests__/agentClientDirectory.test.js src/components/clients/ClientIdentityPanel.test.jsx src/services/__tests__/clientIdentityService.test.js`.
The SQL check executes the migration in an isolated PostgreSQL fixture and tests
intake, aliases, merges, audit, old references, version conflicts, preserved
records, denied bypasses and agency/staff boundaries. Apply the migration and
release the primary app only through an explicitly approved release; this work
does not deploy itself or add activity/campaign tracking.

## Agency client activity

The primary agency client workspace has an Activity tab. Apply
`20261009121124_agency_client_activity_timeline.sql` after the client identity
migration to activate it. No hosted migration or deployment is performed by
this implementation.

Source-table triggers journal enquiries, contact changes, CRM interactions,
tasks, appointments/responses, offers, transaction updates, documents, buyer
and seller onboarding, viewing responses, snags, alterations, service reviews,
handover, finance application status and operational notification responses.
The journal is append-only for app users. Profiles retain both histories through
reviewed merges and old profile references. Owners, principals and assigned
staff can log calls, notes, emails, messages and meetings for an accessible
client; logging an email/message does not send it. Request IDs prevent duplicate
interaction entries after uncertain saves, including retries after a merge.

Existing source records are imported with their original dates and explicitly
marked as historical. Earlier browser actions that were never recorded cannot
be reconstructed. New authenticated buyer/seller portal navigation and document
access requests are recorded on a best-effort basis, once per source/section per
minute. Demo portals are excluded. Portal credentials resolve their own client;
invalid, expired or revoked credentials cannot record activity. The timeline
never copies access tokens, URLs, passwords, raw onboarding forms or bank data.

Client and source permissions apply to every read. Restricted documents and
professional notes remain restricted; removing a source can hide its original
content while generic CRM removal evidence remains. Each page is bounded and
uses a timestamp/ID cursor; latest activity in the directory includes accessible
journal entries. Missing setup and load failures are shown explicitly. Source
attribution and detailed campaign reporting have their own tabs; recorded campaign
milestones also appear in Activity.

The Activity screen groups entries by day, with Incoming, Outgoing, In progress
and Campaigns views, expandable details, local search and inclusive date filters.
Campaign provider milestones are grouped only by the exact recipient ID; confirmed
staff responses remain separate because their journal rows have no recipient ID.
Search, dates and view counts describe loaded history; Load older activity extends
that history. In progress shows workflow events, including completed milestones,
not a live count of unfinished tasks. Last logged interaction is drawn from manual/CRM
interaction entries in the loaded category. Auto update reads every 30 seconds
while visible, preserving expanded entries and older pages; it pauses during
logging and can be switched off. Quick contact actions open the existing logger.

Read-only local design preview:
`http://127.0.0.1:5173/server/tests/fixtures/client-activity-preview.html`.
The preview includes illustrative campaign milestones and disables all writes.
Existing capture boundaries still apply: offline contact requires manual logging,
portal visits are best effort, and repeated campaign opens/clicks are not all copied
to the journal. Mailbox replies need a connector or a staff-confirmed response.
No database migration is required for this presentation change.

Focused verification: `node scripts/client-activity.test.mjs` executes the actual
identity and activity migrations in an isolated PostgreSQL fixture. It checks
history, new intake, aliases/merges, immutable entries, uncertain-save retries,
source permissions, cross-agency isolation, late linking, cursor pagination,
and buyer/seller portal access guards. Also run the existing identity check and
`npx vitest run src/components/clients/ClientActivityPanel.test.jsx src/services/__tests__/clientActivityService.test.js src/core/clients/__tests__/agentClientDirectory.test.js src/components/clients/ClientIdentityPanel.test.jsx src/services/__tests__/clientIdentityService.test.js`.

## Agency client source attribution

The primary app's client workspace has a Sources tab showing the first known source, latest known enquiry source and paged enquiry
source history. Apply `20261009131638_agency_client_utm_attribution.sql` after the
identity and activity migrations to activate it. This implementation does not
apply hosted migrations, release the app or send campaigns.

Five UTM fields normalize from existing snake-case public intake and camel-case
website enquiries. Each enquiry matches through the permanent profile's exact
known email/source relationships. UTM values, names, shared phones and supplied
client IDs never establish identity. Reviewed merges retain source evidence and
old profile references; reassigning an enquiry to a different person cannot
transfer the previous person's attribution. Agency and client/source access
permissions apply to summaries and every history page.

Public agency intake keeps first and latest evidence within an agency-scoped
browser session for up to 24 hours. Tagged navigation updates the latest source;
untagged navigation retains it. Storage failures fall back to the current link.
There is no persistent visitor ID or cross-agency browser matching. The first
known source is captured browser-session/enquiry evidence, not a claim about
unrecorded earlier visits. Historical rows keep original enquiry dates. Untagged
enquiries remain visibly untagged instead of being labelled as a paid campaign.

Lead and linked intake/website receipt triggers maintain one first-source and
one enquiry-source record per enquiry. Late receipts can fill missing fields or
replace a first-source fallback with explicit browser evidence. Existing known
UTM values are preserved, conflicting campaigns are not mixed, and repeated
hydration does not duplicate history. The journal contains bounded allowlisted
campaign strings and website hostnames; it never copies raw forms, URL queries,
access credentials, email addresses or contact IDs. Newly attributed enquiries
also appear in the activity timeline. Campaign delivery/response tracking is described below.

Sources & discovery now presents a first/latest source journey, clickable channel
counts, a chronological/recent enquiry switch, search, tracking-tag filters and
expandable evidence. First/latest and tracking coverage use the server summary
across accessible history; channel counts and search use loaded enquiry pages.
Load older enquiries extends that scope. A channel is derived from recorded
source/medium values; no source is invented for an untagged enquiry. Tracking
coverage measures completeness, not conversion, revenue or marketing causality.
UTM codes, content, search terms and website hosts remain in the evidence inspector.
Refresh retains filters and expanded entries. Source records are read-only here.

Local design preview:
`http://127.0.0.1:5173/server/tests/fixtures/client-sources-preview.html`.
It uses illustrative data only on localhost during development and opens no fake
lead routes. The source redesign adds no schema changes or provider connections.

Focused checks: `node scripts/client-attribution.test.mjs` executes all three
client migrations in an isolated PostgreSQL fixture. It verifies historical
dates, normalisation, automatic matching, late receipt enrichment, merges, old
references, source reassignment, pagination and denied bypasses. Run the existing
identity/activity checks plus
`npx vitest run src/core/clients/__tests__/utmAttribution.test.js src/services/__tests__/agencyIntakeAttribution.test.js src/services/__tests__/clientAttributionService.test.js src/components/clients/ClientAttributionPanel.test.jsx`
and `node server/tests/publicAgencyIntakeApi.test.js` for browser transport and
server normalization. These checks use fixtures and send no communications.


## Agency client campaign history

The primary app includes a Campaigns tab in the full agent client workspace. Apply
`20261009135332_agency_client_campaign_engagement.sql` after the existing email
campaign foundation and the client identity/activity migrations. This is local
implementation only; no hosted schema change, deployment or email delivery is
performed by these checks.

One addressed recipient row links to the client's exact known email alias within
the agency. Existing deliveries are backfilled; later identifiers hydrate older
history. Reviewed merges preserve original bindings and resolve old profile IDs.
Recipient reassignment cannot transfer the previous person's history. All reads
retain both client and existing campaign permissions, including the Activity
entries; restricted campaigns can therefore be absent for an assigned agent.
Draft campaign membership, contact names, shared phones and UTM campaign names
never count as a send or a confirmed response.

Campaign history shows recorded sent/delivered/opened/clicked timestamps,
recipient status, open/click observations and response evidence. Its summaries
count addressed emails for delivery/engagement and distinct campaigns for
campaign/response totals. Timestamp/ID pagination stays stable when later events
arrive. Provider payloads, bodies, tracking tokens and redirect URLs are excluded.
First-observed milestones enter Activity once per recipient/type; repeated opens,
clicks and ordinary saves do not flood the journal. Historical capture keeps the
original occurrence dates. Provider evidence may arrive out of order; the panel
uses the earliest timestamp available from recipient fields and event records.

The Campaigns & engagement view presents one card per addressed email, with
saved campaign artwork (when available), a designed text cover otherwise, and
independent sent/delivered/opened/clicked milestones. Search and status filters
apply to loaded recipient history, with newest-added and latest-activity order.
Campaign totals remain distinct from addressed email counts. Delivery evidence
expands inside each card; Open campaign links to the existing Marketing detail.
Refresh preserves loaded older cards, filters and expanded delivery details.

Artwork enrichment reads only the permitted page's campaign IDs within the
selected organisation under existing RLS. It projects a cover from authored
image/property blocks and preview text, and does not render email HTML or fetch
tracking pixels. Artwork lookup failures retain delivery history. The artwork
is from the saved design, not an exact rendering of the delivered email.

Read-only local design preview:
`http://127.0.0.1:5173/server/tests/fixtures/client-campaigns-preview.html`.
Its campaign artwork is illustrative; response logging and navigation to mock
campaigns are disabled. No remote writes or campaign sends occur in the preview.

A staff member with access to the client and campaign can record a confirmed
email reply, phone response, enquiry, RSVP or other response, with details and its
occurrence time. This is an auditable staff assertion, clearly labelled in the
panel. It requires an actual recorded send, validates the time and records the
response in Activity atomically. A retry reuses its request ID even after a merge.
Opens/clicks never mark a client as responded. Mailbox reply import and automatic
form-to-campaign response linkage are not included: the existing inbox does not
retain a verified campaign reply reference. UTM attribution remains available in
Sources; matching a campaign name alone cannot establish response evidence.

Run from `the-it-guy/`: `node scripts/client-campaign.test.mjs` executes the actual
client migrations and original campaign table/policy definitions in isolated
PostgreSQL. It checks permissions, recipient matching, safe projections, delayed
and duplicate events, late identity links, validation, retry IDs, merged aliases,
reassignment and pagination. Also run
`npx vitest run src/components/clients/ClientCampaignPanel.test.jsx src/services/__tests__/clientCampaignService.test.js src/components/clients/ClientActivityPanel.test.jsx src/services/__tests__/clientActivityService.test.js`
and the earlier identity/activity/attribution checks. Use root `npm run check:app`
for the full app baseline before an approved release. Provider tracking/domain
configuration still determines which open/click evidence is available; this
change does not enable provider tracking or send campaigns.


Client selection opens a full workspace at `/clients/:clientId`, from both the
Clients cards and list rows, including the Open workspace action menu. The agent
workspace retains contact identity/merge controls, linked records and transactions,
Activity, Sources, Campaigns and bulk-email tags (in Overview). Client links are
encoded safely and work when opened directly. Back to Clients preserves the
originating directory's URL filters, search, filter selections and grid/list
view; a direct link returns to Clients. Tag editing
uses the selected client's agency and email, blocks writes after a failed load,
and keeps edits for retry after an uncertain save. Client-switch guards discard
late profile and tag responses from the previous workspace.

Focused navigation checks: `node scripts/client-marketing-directory.test.mjs`
and `npx vitest run src/pages/__tests__/ClientWorkspaceNavigation.test.jsx src/components/clients/ClientMarketingTagsPanel.test.jsx`.
This navigation change requires no new database migration. Deployment is separate.

### Home Seekers common login (10 October 2026)

The public desktop menu, mobile drawer and shared footer link to
`https://app.arch9.co.za/homeseekers/login`. This is a Home Seekers-branded page
in the primary app, using its existing password login and password recovery.
It does not create a second account or an embedded cross-domain session.

After authentication, the validated Auth identity and existing database
applicant gate determine the destination. Verified drafts and submitted
applications open My Profile; approved, contracted and onboarding applicants
remain there until staff activation. Activated users continue to `/dashboard`,
where existing workspace membership and permission checks still apply.
No application status is disclosed through an anonymous email lookup.
Invitation acceptance remains reachable through the established invite routes.

`20261010162130_home_seekers_unified_login.sql` extends the existing gate and
server-only account receipt to verified saved drafts. The primary applicant
API can then open that owned draft using the usual restricted cookie. Uploads
still require a submitted application. This migration changes no records,
memberships, approval rules, email queues or document permissions.

Verify with the Home Seekers login/listing/form checks, applicant setup checks,
`homeSeekersLoginTarget.test.js`, `recruitmentApplicantGateCheck.test.js`, and
`recruitmentDatabase.test.js`. Run `npm run check:app` from the repository root
for the shared login change and rebuild the standalone website. Release needs
this migration and the updated primary app and website together; local checks
and the login layout preview do not confirm a production login or deployment.

## Recruitment contracts in My Profile

Home Seekers managers choose a PDF and select **Upload and share contract** after
application approval. One database transaction retains the original PDF version,
publishes that version in the applicant’s restricted My Profile, records Contract
Sent and queues the `contract_available` applicant email. Existing prepared PDFs
can be shared without uploading them again. Publishing is availability in the
portal, not proof of email delivery. Other organisations retain manual delivery.

My Profile shows Download → Sign → Upload signed copy. Signed PDFs are limited to
10 MB. The server checks the verified applicant session, the published contract
version, immutable upload request, Storage metadata and actual PDF header before
confirming the return. Corrected copies retain earlier files. Each confirmed
return queues one notice per existing agency recipient; retries reuse its request
and provider keys. Download URLs expire after five minutes and require an owning
applicant session. Applicant return metadata exposes no Storage paths.

A return stays at Contract Sent. Managers download it and verify all pages and
both signatures before recording Contract Signed. The saved applicant PDF can be
used directly, or a manager can upload a completed countersigned copy. Stale
records, foreign files, edits to retained returns and subsequent applicant uploads
after verification are rejected. Applicant portal access creates no agency role.

Release the append-only `20261010205014_recruitment_contract_portal.sql` migration,
the primary app/API, and `recruitment-submission-dispatcher` plus
`recruitment-contact-dispatcher` together after explicit target approval. Refresh
`recruitment-approval-dispatcher` as well when its bundled sender helper predates
the configured temporary Home Seekers sender fallback. Follow the database release
runbook; pause the three existing schedules during the schema/worker cutover.
No historical contract notices are backfilled. Applying the migration does not
publish existing prepared contracts or send emails. Restarting workers processes
already queued recruitment notifications. Confirm the production portal and
recipient inboxes separately from local checks and provider acceptance.

Focused checks cover the recruitment database, applicant API, contract component,
workspace, signing model and service in `src/pages/recruitment/__tests__`, plus the
recruitment email content and dispatcher tests. `npm run check:app` covers the
primary app lint, established service baseline and production build.

## Flexible document requirements: identity foundation

Stage 1 extends the existing `document_requirement_instances` records. Standard
items retain their definition key. Custom items have `requirement_origin: manual`,
a local `custom_label`, and no global definition; their type key is derived from
the instance UUID using `documentRequirementTypeKey`. Person, entity and property
subjects retain their explicit identity. Requests, files and reviews remain
separate records linked to the requirement.

An explicit removal uses `applicability_override: removed`, a reason, actor and
timestamp. It reserves the original identity, preserves the previous status and
evidence, and survives both JavaScript and database matrix recalculation. Clearing
the override restores the previous status. Ordinary rule-driven inapplicability
can still reactivate when the transaction facts change. Removal/restoration is
recorded in the existing requirement history.

During transaction requirement generation, eligible manual items and explicit
removals from linked buyer leads, seller leads and private listings retain their
instance IDs. Handover verifies the organisation, source access and buyer/seller
role. `document_requirement_context_links` preserves the originating context.
The authorised reconciliation reader follows these links, so regenerating the
original lead/listing cannot reintroduce an item handed over to the transaction.
Retries reuse the same records; another transaction does not inherit that
transaction's decisions. Conflicting existing target identities stop the handover
for explicit reconciliation rather than merging evidence by name.

The append-only migration is
`supabase/migrations/20261011112703_flexible_document_requirement_identity.sql`.
Apply it before releasing these service changes. It introduces no browser write
permissions or public handover endpoint. The stage 2 command layer below adds
authorised mutations. All workspace readers following context links, portal
controls and reliable notification delivery remain later stages. This foundation does not send email or delete stored files.

Focused local checks (no hosted writes):

- `node --test src/services/documents/__tests__/documentRequirementIdentity.database.test.js src/services/documents/__tests__/documentRequestCanonicalRequiredDocumentSyncService.test.js`
- `node --test src/services/documents/__tests__/documentRequirementIdentity.adapters.test.js`
- `node scripts/canonical-document-resolver.test.mjs`
- `node scripts/transaction-canonical-document-engine.test.mjs`

The database test executes the migration and real resolver in isolated PGlite,
including persistence, exact-party identity, handover rollback and browser access
denial. Hosted migration application, security advisors and live cross-workspace
verification remain release checks.


### Flexible document requirements: shared commands (stage 2)

`src/services/documents/documentRequirementCommandService.js` is the common
service for adding, removing, restoring and uploading a requirement. Apply
`supabase/migrations/20261011114048_flexible_document_requirement_commands.sql`
after the stage 1 identity migration before wiring callers to this service.
No existing screens have switched to these commands yet.

Each operation requires a caller-retained UUID `commandId`, a context type/ID,
and a payload. Remove, restore and upload also require the requirement ID and
its current `command_revision` as `expectedRevision`. Reuse the **entire same
command** after an unconfirmed response; a new intent needs a new ID. Receipts
return the original result, and access is rechecked even on replay. Refresh the
authoritative requirements after confirmation; receipt rows are save receipts,
not the latest state. `refreshContexts` includes versions for all retained
source contexts. Transaction changes also use the existing refresh triggers.

- Add accepts `party`, optional `definitionKey` or custom `label`, and optional
  `subjectKind`/`subjectId`. Person/entity identities must already belong to the
  scoped party (including transaction onboarding people); unknown identities
  are rejected. It creates a local type, never a global catalogue definition.
- Remove and restore require a reason. Removal preserves evidence/reviews and
  cancels active linked requests and pending canonical reminders. Restoring
  revives the same checklist identity and prior status; cancelled solicitations
  remain cancelled until explicitly requested again. Attorney removals retain
  the principal/conveyancer boundary.
- `prepareDocumentRequirementUpload` validates the file and returns a serializable
  command with a content digest. Callers must retain it until confirmed and use
  `uploadDocumentRequirementFile` to save. Bytes upload to a private immutable
  path first; the database then verifies the storage metadata and atomically saves
  the file link, request state, audit event, refresh versions and receipt. A lost
  response never triggers file deletion. Retrying checks for a receipt before
  uploading; an already uploaded path can complete its original save.
- Pre-transaction evidence lives in a private upload registry. Handover creates
  transaction document records with the same UUID/path, without copying bytes.
  Replacement keeps previous evidence and reopens review. SQL metadata validation
  is not malware scanning or server-side hashing of the file contents.

The stage 3 readers and stage 4 controls must consume these commands; notification
outbox integration, legacy listing projections and automatic email delivery are
not introduced here. No hosted migration, storage write or email was performed.

Focused command checks, from `the-it-guy/`:

- `node --test src/services/documents/__tests__/documentRequirementCommands.database.test.js src/services/documents/__tests__/documentRequirementCommandService.test.js`
- `npx eslint src/services/documents/documentRequirementCommandService.js src/services/documents/__tests__/documentRequirementCommandService.test.js src/services/documents/__tests__/documentRequirementCommands.database.test.js`

The database suite executes the real migrations and request lifecycle triggers in
isolated PostgreSQL (PGlite), including denied access, stale revisions, receipt
replay, rollback after audit failure, storage immutability and upload handover.
It does not replace hosted storage/portal or concurrent-connection release checks.

### Flexible document requirements: shared readers (stage 3)

Apply `supabase/migrations/20261011115118_flexible_document_requirement_read_model.sql`
after stages 1 and 2, before deploying these readers. The new read-only
`bridge_document_requirement_context` returns requirements, permitted evidence
(including retained versions), and a context version. It follows saved handover
links and explicit same-organisation lead/listing relationships. It does not
match people by name or copy documents between matters. Source access cannot
bypass revoked transaction access; requirement audiences and stored-file
permissions still apply.

The primary workspace now consumes this shared model in buyer/seller lead
checklists, the single-listing seller document view, the transaction requirement
reader and canonical document workspace. Custom names retain their instance IDs;
removal tombstones replace older linked checklist rows before filtering. Only a
unique known standard type with the same party/contact can replace an unlinked
legacy row. Unrelated legacy documents remain visible. Current evidence is
selected explicitly; older approved files cannot replace a newer pending review.
The existing buyer and transaction seller/professional portal projections now
include custom requirements without changing their token/session authorisation.

Seller Lead Documents uses the same Property Documents, FICA and Sale groups
as listing Documents. Its Actions menu holds signing, printable mandate, portal
link and requirement-management actions; Upload / Request document opens the
shared requirement dialog inside Documents. Existing file IDs, requirements and
review state remain the saved source of truth.

Open lead/listing document views refresh the full saved document records alongside
the shared checklist after uploads, review and requirement commands, on focus,
and every 15 seconds while visible. A timestamp-only storage signal refreshes
other open browser tabs without storing document or contact details. Hidden tabs
refresh when visible again. Refresh failures are surfaced. Private requirement
tables remain inaccessible to browser subscriptions.

Focused stage 3 checks, from `the-it-guy/`:

- `node --test src/services/documents/__tests__/documentRequirementRead.database.test.js src/services/documents/__tests__/documentRequirementReadService.test.js src/services/documents/__tests__/buyerLeadDocumentReadService.test.js`
- `npm run test:canonical-document-workspace`
- `node scripts/canonical-document-resolver.test.mjs`
- `node scripts/transaction-canonical-document-engine.test.mjs`
- `node scripts/canonical-document-required-role.test.mjs`

The PostgreSQL suite exercises the real read migration and both existing portal
projection functions, alongside stages 1–2. It covers shared identity, removal,
restore, upload history, scoped links, role audiences and access revocation.
Hosted migration application and real portal/storage smoke checks are release
work; no deployment or hosted data change is implied by these local checks.

### Flexible document requirements: professional controls (stage 4)

Document-type suggestions (phase 1): the shared add/request form searches active
catalogue names, keys and descriptions for the selected buyer or seller role.
Agents explicitly choose an existing type or **Create a custom document**.
Selecting a type sends its catalogue identity and retains its standard name;
editing the search or changing the requested party clears the selection. Custom
names stay scoped to the matter. Catalogue failures are visible and still allow
explicit custom requests. This uses the existing command API with no migration.
Phase 2 detects exact duplicates in the current source workspace or handed-over
transaction, for the same buyer/seller and person, entity, property or party.
Catalogue identities match by key; custom names match ignoring case and repeated
whitespace. Similar names and different subjects stay separate. Choosing a
custom name identical to an existing catalogue requirement also offers reuse.
The form blocks another add and opens the existing upload/replacement controls;
removed requirements offer review and restoration. Historical duplicates remain
separate choices and are never silently merged or deleted.

Migration `20261011124827_prevent_duplicate_document_requests.sql` adds the same
check inside the existing add command, after receipt recovery and under its
existing transaction/source lock. A rejected duplicate creates no receipt,
request or email job. The form refreshes after rejection so the existing request
can be selected. Deploy the migration with the UI for save-time enforcement;
it has not been applied to a hosted database. Local Supabase advisors were
unavailable because no local stack was running; the migration was exercised in
the isolated PostgreSQL delivery tests.

Focused checks: the existing `DocumentRequirementManager.test.jsx` suite and
`node --test src/services/documents/__tests__/documentTypeSuggestionService.test.js`.
Phase 2 additionally uses `documentRequirementDuplicateService.test.js` and
`documentRequirementDelivery.database.test.js` in that service test directory,
the portal document-trust suite and the existing Deno email-dispatcher tests.

The Documents views on buyer/seller leads, private listings and transaction
workspaces now include **Manage document requirements**. Staff can add a named
requirement for the buyer or seller, reuse an existing requirement's authoritative
person/entity/property scope, upload or replace its evidence, remove it with a
reason, and restore an explicitly removed requirement. These controls manage
canonical instances; legacy-only rows still use their existing workflow until
reconciled. Removed instances stay available in the selector with their reason.
Evidence and review history are retained by the shared commands.

New requirements use the current transaction after an unambiguous handover.
When a source spans multiple transactions, staff must open the intended matter.
Existing requirement changes use that instance's current context and revision.
The database remains the authority for professional access, protected attorney
requirements and stale-change rejection. No browser role bypass is introduced.

Each save retains its immutable command envelope in browser local storage,
scoped to the project, signed-in account and source workspace. This contains
the document name/reason and file metadata needed for retries, never file bytes
or credentials. An uncertain result blocks new changes until the same command
is recovered. Upload recovery checks the server receipt first; if still unsaved,
staff reselect the original file and its digest is verified. Confirmed saves and
definite database rejections clear the envelope. A stale revision refreshes the
workspace and requires a new user action. If recovery storage is unavailable,
the controls fail before attempting a save.

Shared readers refresh lead/listing views. The transaction manager also reloads
the document workspace when its shared context version changes. Browser session
or workspace changes recheck access rather than reusing another account's form.
Stages 1–3 migrations are prerequisites; this stage adds no schema migration.
Automatic email requests and seller pre-transaction portal uploads remain in the
subsequent request/portal stage. No hosted changes or email delivery are implied.

Focused checks, from `the-it-guy/`:

- `npx vitest run src/components/documents/__tests__/DocumentRequirementManager.test.jsx`
- `node --test src/services/documents/__tests__/documentRequirementCommandService.test.js src/services/documents/__tests__/documentRequirementCommands.database.test.js src/services/documents/__tests__/documentRequirementRead.database.test.js src/services/documents/__tests__/documentRequirementReadService.test.js`

The interaction checks cover scoped additions, immutable retry after remount,
stale removal, restoration, replacement, account isolation and context changes.
The PostgreSQL checks continue to cover command permissions and the shared read
model. Hosted storage and authenticated browser smoke checks remain release work.

### Flexible document requirements: portal requests and delivery (stage 5)

New add commands now create a durable email job in the same database transaction.
Transaction requirements also link to the existing document-request module.
Replayed commands create neither duplicate requests nor duplicate jobs. Historical
requirements are not backfilled with emails, and restoring a removed requirement
does not send another request. Removing or satisfying a requirement cancels its
pending delivery; an email already submitted to the provider cannot be recalled.

The dispatcher uses the existing branded additional-document email and Resend
transport. It resolves an active portal and matching recipient, rechecks them
before sending, freezes the provider payload, and retries with one idempotency
key. Leases fence competing workers. Unknown provider outcomes stop before the
24-hour idempotency window expires (23-hour cutoff), with at most eight attempts.
The professional document manager shows queue status. “Sent” means provider
acceptance, not confirmed inbox delivery. Missing portal details remain in
`waiting_portal`; exhausted attempts require operational attention.

Seller listing and explicitly linked seller-lead requirements are available in
the authenticated seller portal before handover. Custom labels survive checklist
generation, removed requirements stay removed, and uploads use immutable paths,
revision checks and recoverable command receipts. Handover retains the same file
and requirement IDs. Existing signed-document workflows remain protected.
Buyer transaction portals retain custom labels and stable upload keys; custom
uploads require review. Buyer-lead email jobs wait until a transaction has a
supported active buyer portal. Person-specific requests require the portal
recipient to match that contact; no fallback recipient is silently substituted.

Release prerequisites (not performed by implementation):

- Apply stages 1–3 and migrations `20261011121724`, `20261011121850` and
  `20261011122133` through the database release procedure.
- Deploy `supabase/functions/document-requirement-dispatcher`. It needs the
  existing Supabase service credentials and `RESEND_API_KEY`; `ARCH9_APP_URL`
  defaults to `https://app.arch9.co.za`. Set `DOCUMENT_REQUEST_EMAILS_ENABLED=false`
  to pause sending while retaining queued requests.
- The minute scheduler uses existing `pg_cron`, `pg_net`, and Vault secrets
  `arch9_project_url` and `arch9_service_role_key`. Missing secrets skip dispatch.
- Verify authenticated seller upload/download before and after handover, buyer
  custom upload, removal across views, and one controlled provider receipt in
  the approved target environment. No hosted migration or live email was run here.

Focused local checks:

- `node --test src/services/documents/__tests__/documentRequirementDelivery.database.test.js src/services/documents/__tests__/sellerRequirementUploadService.test.js src/services/documents/__tests__/documentRequirementReadService.test.js`
- `npx vitest run src/services/__tests__/clientPortalWorkspacePhase4DocumentTrust.test.js`
- `node --test src/services/__tests__/clientPortalWorkspaceService.sellerDocumentVisibility.test.js`
- From the repository root: `deno test --allow-env --config supabase/functions/document-requirement-dispatcher/deno.json supabase/functions/_shared/documentRequirementDelivery.test.ts`

The database checks execute the migrations in isolated PostgreSQL (PGlite),
including replay, cancellation, portal session isolation, immutable uploads,
handover, recipient changes and retry cutoff. The local Supabase advisors require
a running local stack and were unavailable during this implementation.


Relist now performs a coordinated withdrawal and republish for the selected
Property24/Private Property adverts. Both existing portals are selected by
default from the sales Marketing menu and editor return. All selected portals
pass readiness/address checks before withdrawal; every selected advert must be
confirmed offline before any content is republished. Already inactive adverts
skip withdrawal. Withdrawal intent/confirmation uses the existing relist activity
checkpoints, so a lost response or a refreshed page cannot repeat a withdrawal.
Check and continue includes portals already offline in the same run. Existing
activation/content checkpoints resume without withdrawing a republished advert.
Private Property's retained address and advert identity rules still apply.
This change does not delete listings or add/apply a database migration.


The prepared migration `20261012101600_listing_delete_completed_portal_history.sql`
allows an authorised permanent delete to retain completed portal attempts in
`rental_publication_attempt_archives`. It copies the complete journal row and a
small listing identity snapshot before releasing the original journal link.
Pending/uncertain attempts and terminal attempts without a resolution timestamp
block deletion. The existing live-channel, ownership, signing/document and
linked-workflow guards remain. A later deletion failure rolls back the archive
and all housekeeping. Archived receipts have RLS and no browser grants; only
server-side audit reads/inserts are allowed. The migration has not been applied
to a hosted database. No live listing is deleted by preparing this change.
Focused verification: `node --test scripts/private-listing-deletion.test.mjs`.

### Kingdom seller upload and review correction (12 October 2026, prepared)

The primary app now prepares an exact missing seller checklist target from the
saved property/ownership model before Storage is touched. Current optional
requirements can accept files without being made mandatory. Explicit request
IDs, retired requests and version-bound signing uploads retain their strict
identity checks. Seller document review controls appear beside uploaded files,
outside the Actions menu; signed evidence confirmation is unchanged. Rental
stock that is published on Property24 or Private Property no longer opens as a
capture draft merely because its internal seller-lead workflow is unfinished.

`20261012114500_seller_optional_document_upload_review.sql` corrects the database
upload-link and review guards for optional items while retaining the current
function bodies, grants, review conflicts and audit behavior. It does not
backfill requirements, review mandates or alter stored documents. It must be
applied with the app release; this correction has not been deployed.

The read-only Kingdom audit found three saved seller files, all present in
Storage and linked to exact checklist requests. The mandate is under review;
the electric-fence and solar documents await review. Optional checklist rows
were offered for upload although both the service and database rejected them.
This confirms a code defect, but the original failed file cannot be identified
from a pre-storage validation error alone.

Focused verification uses the seller-access Vitest suite, generator-retirement
upload preflight suite, seller-document journey (real local PostgreSQL commands
and browser signing/upload/review), document action component suites, rental
listing data contract, and app build. Local acceptance uses synthetic Auth,
Storage and email infrastructure; it is not a production upload or delivery.

Verification passed: 65 seller-access tests, 13 upload preflight/retirement
tests, 6 document presentation tests, 6 review/action component tests, rental
data-contract and upload-persistence checks, and 17 connected document journeys
with 54 actual PDF downloads. The app build passed; focused ESLint had zero
errors and existing warnings. No production writes or email delivery occurred.
Evidence logs: `tmp/kingdom-document-journey-20261012.log`,
`tmp/kingdom-upload-preflight-20261012.log`,
`tmp/kingdom-document-lint-20261012.log`, and
`tmp/kingdom-document-build-20261012.log`.

### Seller lead/listing document feedback follow-up (12 October 2026, prepared)

Lead and listing document screens now show saved-file and awaiting-review
counts separately from checklist approval. The same stored file is counted
once, and an empty requirement or unsigned generated draft cannot contribute a
saved-file count. Lead uploads keep the server-confirmed requirement ID and
refresh the linked listing after normal uploads as well as signing-copy uploads.
The mandate upload route now refreshes the linked listing too. File/display row
IDs no longer stand in for requirement IDs in these upload handlers.

The read-only Kingdom contact audit found 56 leads, all linked to existing
Kingdom contacts, with no dangling contact links. There were no document
requirement instances in those lead contexts. This establishes the relationship
links but does not establish which lead Kevin was viewing. All three known
seller uploads remain saved against A9-KING-000245 and awaiting review.

Both remaining active adverts were confirmed in Private Property and Property24
branch feeds. Neither active listing has saved public portal URLs; the Kingdom
rental is missing its local PP reference too. Verified PP public pages match
RR4789012 and T5650610. A scoped, rollback-only repair is prepared in
`tmp/kingdom-private-property-link-repair-20261012.sql`; it has not been executed.
Property24's public URLs have not been independently resolved. No URL is guessed
and no portal publication is changed by these prepared corrections.

Focused evidence: `tmp/kingdom-lead-upload-tests-20261012.log`,
`tmp/kingdom-lead-link-lint-20261012.log`,
`tmp/kingdom-lead-contact-audit-20261012.jsonl`, and
`tmp/kingdom-active-links-20261012.jsonl`. No current follow-up changes have been
deployed or applied to production.

### Website-to-listing statistics correction (12 October 2026, prepared)

Listing statistics now preserve a separate same-day website view count and date
without adding them to completed-day portal comparisons. The website RPC
correction in `20261012110258_listing_website_partner_statistics.sql` scopes
partner view history and enquiry receipts to approved publication sites and the
listing owner; other organisations and ungranted websites stay excluded.
The website property page also enables tracking for published partner listings.
No production analytics, publication records or migrations were changed.

Verification: focused database, service, component and connected statistics
tests; `npm run check:website`; focused ESLint; and the primary app build. Logs
are `tmp/website-statistics-tests-final-20261012.log`,
`tmp/website-statistics-website-check-20261012.log`,
`tmp/website-statistics-lint-20261012.log`, and
`tmp/website-statistics-app-build-20261012.log`. Release the database correction
before the separate website/app changes. Historic visits that were never
recorded cannot be filled in with assumed traffic.

### FICA preparation timeout confirmation (12 October 2026, prepared)

The 12:33 report was traced to A9-ISELLPROPERT-000008. Read-only records confirm
the FICA-only preparation committed at 12:32:39 SAST and its matching reviewed
version has one current signing request, marked Sent at 12:32:40 SAST. This
verifies the saved/request state, not inbox delivery or a completed signature.
No request was resent and no saved evidence was changed during the audit.

The timeout-recovery verifier compared every property summary field, although
the guarded seller save only projects property fields explicitly changed by
the mutation. The saved onboarding's formatted address differs from the
listing's first address line, and address was not changed by this FICA request.
Recovery now compares address, price and mandate type only for actual changes,
while still requiring the exact mutation on both records, full canonical facts,
onboarding state and frozen document contents. This corrects an identified
confirmation defect; the initial browser-side timeout itself is not explained
by the successful server request alone.

Verification passed: 52 canonical-update checks, 66 seller-access/service tests,
focused ESLint and primary app build. Logs are
`tmp/fica-timeout-model-20261012.log`,
`tmp/fica-timeout-service-20261012.log`,
`tmp/fica-timeout-lint-20261012.log` and
`tmp/fica-timeout-build-20261012.log`. The read-only evidence is
`tmp/fica-preparation-audit-20261012.json`. No production release or migration
was performed for this correction.

## Photos selected during listing capture

New-listing capture uploads photos as soon as they are selected. It first creates
one private draft receipt, stays in the wizard, and reuses that draft on final
save. Each photo shows upload status and offers retry after failure. Final save
joins in-flight uploads and reuses completed ones before saving and verifying the
marketing record. Selecting photos never queues advertising; photos still need
Save draft or Save and publish to be attached to the durable marketing record.
Focused checks: `node --test src/lib/__tests__/listingMediaUploads.test.js
scripts/create-listing-save-recovery.test.mjs`.

The sale listing editor's Where to advertise step uses full-width website rows.
Publishing receipts, connection issues, missing fields and per-website retry
controls appear inside their respective row. The separate saved-result card and
advert preview are hidden on this step. Retries save edits first and request only
the failed website; accepted and uncertain requests are not replayed.


## Seller lead capture and optional onboarding

Create Seller Lead in the lead list and lead workspace now opens the actual
seller onboarding form in stages. Seller identity, ownership, people, property,
finance and mandate fields use the same controls, normalizer, form-data keys and
canonical save paths as the seller link. No table or parallel seller/property
profile has been added. The existing internal `seller_lead_intake` listing holds
the capture; it is not a published or activated market listing.

All capture questions can be skipped. Save and finish later is available from
the earlier steps. Blank ownership/property choices stay unknown, explicit
clears beat older fallback values, and zero property amounts survive reopening.
Entered email addresses are checked. Partial seller-link submissions save an
`in_progress` draft and remain editable; existing information-completion,
review, signing, publication and transaction checks remain in force.

The final step records reported progress as an existing lead activity, then
lets the agent open the lead, request the seller link, or open documents for
review. Reported progress never asserts a signed mandate. Optional agent uploads
use the existing exact checklist request, Storage upload and seller-visible file
record; mandate uploads defer signing status. The seller link shows those same
seller-visible file receipts. Internal file names remain excluded. Retry uses
the same lead/contact IDs and intake link; revision conflicts stay visible.

Focused checks: `npx vitest run
src/components/leads/__tests__/SellerLeadCreateDialog.test.jsx
src/components/onboarding/__tests__/SellerOnboardingCapture.test.jsx
src/services/__tests__/sellerLeadCaptureService.test.js --maxWorkers=1`, plus the
existing seller profile alignment journey, portal alignment, guarded canonical
update, lead route/lifecycle boundaries and document transaction continuity
checks. `npm run check:app` is the broad app check. These checks use local or
synthetic data; implementation does not apply migrations, deploy, publish or
send a live seller invitation.


## Address-only seller draft listings

Seller Lead → Property offers Create Draft Listing once the saved property
address is available. Incomplete onboarding is allowed. The action promotes the
existing linked intake into an internal, inactive `listing_review` draft with
`private_listing` source, so it appears in Listings as a draft. It retains the
same onboarding record, token, people, documents, review history and mandate
status. It does not invite the seller, publish, sign or create a transaction.

The handoff reads fresh linked capture before the lead's cached snapshot. Its
full saved seller/profile JSON is retained, rather than rebuilt with capture
aliases or synthetic compliance declarations. Bedrooms, bathrooms, garages,
parking, sizes, rates, levies and features are projected into the existing
listing publication-data fields. Zero values and explicit blanks survive.
Existing operational listings are opened without reapplying onboarding over
later marketing edits. A changed capture revision blocks draft promotion;
failed draft preparation can retry against the same linked property record.

Focused checks: `npx vitest run
src/services/__tests__/sellerLeadDraftListingService.test.js
src/components/onboarding/__tests__/SellerOnboardingCapture.test.jsx
src/components/leads/__tests__/SellerLeadCreateDialog.test.jsx --maxWorkers=1`,
`npm run test:seller-lead-listing-prefill-alignment`, the seller lead/listing
boundary tests, seller alignment journey, guarded canonical update, portal
alignment and document transaction continuity. No new tables or migrations are
needed; no live data change, invitation or publication was performed.


## Listing advertising expiry (released, 13 October 2026)

Listing setup → Where to advertise captures **Listing expiry** separately from
mandate dates. Drafts retain the date without scheduling an advert action.
Property24 and Private Property send the date in their native expiry fields;
a successful first publication creates a channel-specific removal schedule.
Website publication creates the same schedule for that website.

Marketing → Manage listing → **Listing expiry** replaces immediate expiry with
a date editor, then an explicit choice to apply it to this channel or all active
channels. Dates remain independent after a channel-only edit. Setup date changes
apply only when publishing the selected channels again. Unchanged setup never
resets a date deliberately changed through Manage. Inactive channels are never
published by an expiry save; concurrent or uncertain requests require review.

The existing minute-by-minute listing publication cron dispatches native date
updates and, after the selected day in Africa/Johannesburg, sends Property24
Expired, Private Property Inactive, or website unpublish. Saved, accepted and
uncertain results are distinct. A lost provider response is not automatically
replayed. Removal acceptance still requires checking the public advert.
Expired website adverts cannot be resurrected by an ordinary content update.

Release the new `20261013121907_listing_channel_expiry_schedule.sql` migration,
both website publication Edge Functions (with the shared job helper), and the
primary app/API together; apply the database migration first. The native preview
services intentionally block publication when expiry settings cannot be read.
Released to production on 13 October 2026 with the primary app/API and both
website publication Edge Functions. No historical expiry schedules were created.

Focused verification: `node --test server/tests/listingChannelExpiry.test.js`,
ListingChannelManageDialog component/integration and listingChannelExpiry service
Vitest suites, `node scripts/listing-channel-manage-browser.test.mjs`, and
`deno test --allow-read --allow-env ../supabase/functions/_shared/listingPublicationJob.test.ts`.
The browser fixture uses local portal doubles and blocks external requests.
`npm run check:app` at the repository root is the normal broad app check.

Local verification passed: the focused dialog/service suites, five real-SQL/worker
checks, shared Edge Function delegation tests and twenty loopback browser checks.
The broad app lint and baseline tests passed. Its build was stopped before completion after more than thirteen minutes.
The log records 4,924 modules transformed, but no successful build completion;
a full build remains unverified before release. No release has been performed.


## Sales listing final publication action (prepared)

The final sales setup action activates eligible saved/restored drafts and queues
the selected advertising channels after the property save is verified. New sale
records explicitly persist their active flag; resumed drafts also receive active
market visibility. Step navigation and the separate Save draft action keep the
record inactive and send no adverts. Missing advertising requirements return to
their setup step, and closed listings retain their separate relist workflow.
No production listing was activated or published by this local change.

Focused checks: `node scripts/create-listing-save-recovery.test.mjs` and the
listingInitialPublicationService, listingPublicationEditor and
listingFieldRequirements Vitest suites.

## Mobile home tasks and new leads protocol

The agent and principal home scroller has two panels: a black task checklist
and a light new-lead panel. Today uses Africa/Johannesburg calendar days.
The checklist includes saved CRM follow-ups due today and overdue work, in
existing priority order. Future, undated and cancelled tasks are excluded.
Agents see assigned tasks; principals retain their existing team scope.
Appointments and transaction workflow steps are not checklist tasks.

Checking a task updates its existing CRM task ID to Completed, scoped to the
current organisation through the existing repository and database permissions.
The checkbox waits for the save response, blocks duplicate taps, and only then
crosses out the title. A rejected/offline save leaves the prior state and shows
an inline retry message. Unchecking restores the prior open status (Pending
for a task loaded as Completed). No automatic retry or offline completion queue
is used. Saved tasks remain visible for undo during the current visit. Reloading
shows completed tasks due today and overdue tasks updated today; older completed
work stays in CRM history and drops out of this daily checklist.

Completed tasks sort below open work, retaining their relative priority within
each group. Panels cap at 420px and scroll internally for longer lists.

New leads use the same saved New-stage and assignment filters as the header
counter. Names and phone numbers come from the linked contact, source logos
use the shared source presentation, and each card opens its exact lead. Valid
phone numbers enable a call link and a WhatsApp chat link; missing or invalid
numbers hide those actions. Opening WhatsApp does not send a message. Empty
and unavailable data have separate states and unavailable sources offer retry.
Developer dashboards retain their existing portfolio and protected lead views.

Buyer cards offer Mark contacted as an explicit confirmation, independent of
opening Call or WhatsApp. It reloads the saved buyer lead, requires its current
New stage, and uses the existing guarded CRM update to record Contacted, Active,
firstContactedAt and ownershipStatus=contacted. These are the same contact facts
used by the buyer journey. Qualification and later milestones are not completed.
An expected-updated-at conflict or failed save keeps the card actionable and
shows an error. After success, the home reload removes it from New leads and
updates the counter. A Buyer Contacted history entry is attempted separately;
the saved lead status remains authoritative if that history write fails.

### Mobile momentum and sound (local first version)

Mobile agent/principal home adds a Today’s progress panel with a daily ring, an original Arch9
three-note new-lead chime, a soft task tick, contact confirmation feedback and
an all-due-tasks-complete celebration. The ring counts completed due/overdue
tasks plus buyer leads first contacted today against those tasks and the union
of contacted-today and still-new buyer leads. It uses saved CRM records on load,
confirmed successful actions during the visit, and SAST days. Undo lowers the
ring; it never adds a second reward. Empty work starts at zero and unavailable
sources show unknown progress, rather than a false 100% day.

Existing leads and completed tasks silently baseline on page load. An arrival
after that baseline pulses New leads and attempts one chime for that batch.
Home refreshes once a minute while visible, as well as on existing CRM events
and when returning to the app. Task/contact feedback only runs after the save
resolves. Feedback deduplication is scoped to organisation, user and SAST day
on this browser; it is not a cross-device points/rewards system. It stores IDs
and preference settings, without contact details or audio files. The all-clear
celebration needs at least one real task and fires once a day.

Sound is off by default. Mobile home no longer displays a sound control;
saved device preferences still govern playback and quiet hours (20:00–08:00
SAST by default). Overnight, daytime and equal
start/end (all-day quiet) ranges are supported. Audio contexts are created or
resumed from a user gesture, following browser autoplay restrictions; if a
browser suspends audio, the next deliberate task/contact action can unlock it.
Muted, quiet-hour, hidden-tab and blocked audio is never queued for later.
This release plays foreground browser audio, not custom background push
notification sounds. Sound preferences persist on this device. Reduced-motion
preferences disable reward animations while keeping status text and progress.

Mandate, signed-OTP and earned-commission celebrations are later milestones;
this first version does not infer them from pipeline estimates or clicks.
Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

Focused verification: MobileTodayLeadScroller, AgentDashboard,
mobileTodayModel and mobileDashboardService Vitest suites. Local preview only;
no live tasks, adverts or messages are changed by verification.

### Mobile buyer journey progress

The mobile lead workspace uses the desktop buyer journey definition, evidence rules
and saved journey overrides. It reads this lead’s appointments, qualification answers,
onboarding, signed OTP, linked transaction and canonical document requirements.
A scheduled viewing is not a completed viewing, and a prepared onboarding link does
not count as sent. Progress counts completed milestones, including the captured lead.
The refresh control reloads the saved lead and its evidence. Failed evidence reads
show a retry state instead of a default progress percentage.

Focused checks: `npx vitest run src/services/__tests__/mobileBuyerJourneyService.test.js src/components/mobile-shell/__tests__/MobileBuyerJourney.test.jsx --maxWorkers=1`
and `node src/services/__tests__/buyerJourneyAlignmentService.test.js`.

### Mobile lead action module

Tap a journey step or its next-action button to open the shared desktop workflow
inside a mobile modal. Buyer actions reuse the agency lead workspace; rental
classifications use the tenant workspace, its saved qualification answers and
application/lease/tenancy journey. Existing role, workspace and rental module gates
still apply. Closing the module reloads the lead and progress. Opening it alone
never records contact, sends an invitation or completes a milestone.

Focused checks: the MobileLeadActionProvider, MobileBuyerJourney,
MobileLeadWorkspaceHeader, MobileLeadContextCards and mobileBuyerJourneyService
Vitest suites, plus `npm run test:mobile-shell-routing`.
