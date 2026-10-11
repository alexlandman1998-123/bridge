# Seller data alignment: phased repair plan

11 October 2026. Primary Arch9 seller lead, listing, seller portal and transaction workspaces, with the shared Supabase layer.

The recommendation is to keep the tables that represent different business records, give each seller fact one authoritative home, and make the screens use the same current profile. Multiple tables are appropriate for leads, properties, transactions, participants and signed evidence. The confirmed problem is that copied seller fields can be read or changed independently, without complete mapping or synchronisation.

The intended result is that equivalent current seller fields have the same meaning and value on the seller lead, listing and transaction, and the seller portal uses those same facts. The legal owner, primary contact and signing representative remain distinct. An update to current details must not alter an earlier signed document or silently change a transaction legal decision.

Phases 1–3 are implemented locally: ownership/relationship inspection, guarded saves, shared profile views and corrected transaction handoff. The frontend remains unreleased. Phase 4's read-only production audit confirms the earlier listing/capture guards in the hosted ledger, while the Phase 2 transaction guard and Phase 3 profile reader remain absent. The audit and review packet are ready; live reconciliation remains pending. Onboarding and document changes follow only after the saving and alignment work has been checked and shown to the requester.

## What the tables should do

These roles are proposed from the inspected repository schema and save paths. They do not certify the deployed schema or the number of affected live records.

| Existing records | Proper responsibility | Alignment requirement |
| --- | --- | --- |
| `contacts`, `leads` | CRM contact and acquisition history | Link the correct person/entity and lead journey. Once linked, an older CRM snapshot must not override the reviewed current seller facts. |
| `agency_client_profiles`, `agency_client_identifiers`, `agency_client_links` | Agency identity and links between source records | Reuse the identity/link mechanism where appropriate. It currently indexes sources; it is not a complete seller profile synchroniser. Shared email or phone alone must not decide who owns or signs for a property. |
| `private_listing_seller_onboarding` | Captured seller facts for the linked listing journey, including people, entity and ownership/authority information | Use its current captured facts as the starting authority for that journey; distinguish draft, submitted and reviewed facts. Token/access fields do not define identity. |
| `private_listings` | Property, marketing and listing operations; projection of seller facts | Keep property-specific ownership linked to the right seller people/entities. Treat the copied seller facts as a projection of the authoritative profile, with a revision. |
| `transactions`, `onboarding_form_data` | Sale/conveyancing state and transaction-specific information | Read equivalent current seller fields through the shared profile. Keep deal decisions and historical snapshots explicitly separate; repair the current seller projection rather than maintaining an independent contact editor. |
| `transaction_participants` | Individual people and their roles/access in a transaction | Preserve stable person identities and update only the intended participant. One contact correction must not rename every owner. |
| `client_portal_contexts` | Portal access and connection to a journey/transaction | Resolve the correct linked profile; do not become another seller data store. |
| Document versions and signing evidence | The facts and signatures accepted for a particular document version | Preserve accepted versions. Later profile changes can require a reviewed correction or replacement document, rather than rewriting the earlier evidence. |

One person can sell multiple properties, and one property can have several owners. A person's reusable identity and contact information must therefore be distinguished from their role, ownership share or authority in a specific property or deal. We should not collapse these relationships into one undifferentiated seller row.

## Phase 1 — Establish ownership and the field contract

**Implementation status — 11 October:** the primary app now contains the
executable field/table ownership contract and a read-only offline relationship
report, with explicit person source references and complete/incomplete snapshot
coverage. The existing [source-of-truth guide](../seller-lead-listing-source-of-truth.md)
contains the authority matrix, correction rules, current read/write inventory
and report usage. No schema change or deployment was required. Display/save
integration and live legacy reconciliation remain the later phases below.

Map every relevant read and write across the four workspaces. For each field, record its meaning, authoritative record, person/entity identifier, permitted editors, review requirement, empty-value behaviour and downstream projections. Cover individual identity/contact/address, company and trust registration, tax/FICA facts, spouse and marital relationships, multiple owners, directors/trustees and principals/representatives.

Start with the existing listing-linked onboarding facts rather than creating another competing master table. Identify the boundary between reusable client identity and property-specific facts before choosing any schema change. Explicitly define which historical transaction values remain frozen and which represent current contact details.

**Done when:** every shared seller field has one authority and every linked journey can identify its lead, listing, current profile, people and transaction. Ambiguous or missing links are reported, not guessed. The field contract describes the same fact consistently on all screens.

## Phase 2 — Finish safe saving before expanding the workflow

**Implementation status — 11 October:** implemented locally in the primary app
and a new append-only shared migration. Transaction contact edits now load the
saved values/revisions together and use one permission-checked command. The
command commits captured primary contact facts, listing facts, transaction
summary, current party snapshot and the identified participant together. Existing
agent/portal saves project the same current contacts in their own database
transaction. Stale forms, older direct contact writers and uncertain saves cannot
silently overwrite newer values. The editor retains the losing draft and advances
only from its confirmed receipt.

This phase also removes the two whole-form workflow status writes, guards link
preparation (including its deferred path), removes its unsafe direct-write
fallback, and prevents contact saves from restoring older listing operational
values. Linked legal names remain editable through the listing identity/review
workflow; the transaction contact editor cannot independently rename the legal
seller. Missing/ambiguous person links are blocked for review. Full roster field
mapping and legacy reconciliation remain Phases 3 and 4.

The current evidence and release dependencies are recorded in the
[saving repair report](seller-saving-repair-2026-10-11.md#phase-2-extension).
Nothing was deployed or applied to hosted data.

Retain and verify the local lead/listing/portal revision guards, draft/submission queue, input retention and protection against delayed drafts reopening completed onboarding. Extend this protection to transaction seller editing, which the audit found still accepts stale forms and saves several copies through separate requests.

Use a server command that checks the revision originally displayed by the editor, validates the actor's field permissions and commits the authoritative change and required current projections together. Update the identified person, including their phone, rather than every participant with a seller role. Propagate current profile changes to the linked screens without letting a background refresh authorise an older draft. Where review is required, retain a pending proposal separately from accepted facts.

Start with explicit conflict handling: retain the person's entries and show that someone else saved first. Do not automatically choose the last request or merge conflicting identity/authority fields. Prevent duplicate submission or uncertain timeout recovery from claiming an unconfirmed save.

**Done when:** simultaneous agent, seller and transaction edits cannot silently overwrite a newer save; partial failure rolls back the required database changes; successful saves advance the editor's confirmed revision; and another owner's data remains intact.

## Phase 3 — Align the profile views and transaction handoff

**Implementation status — 11 October:** implemented locally in the primary app
and the append-only `20261011073408_seller_current_profile_alignment.sql`
migration. Lead, listing, seller portal and the transaction current-profile panel
use the same saved-field reader and field groups. Current captured values win
over older CRM/snapshot aliases, including deliberate blanks and removed people.
Entity registration, identity/address/tax fields, spouses, all supported rosters,
marriage regime and stable saved person ids survive the handoff. SA/tax residency
and registered section/unit number remain separate fields.

The transaction reads its linked current profile through a read-only RPC with
existing transaction/listing/capture permissions. Missing, restricted or ambiguous
captures are shown explicitly. Legal corrections open the displayed linked
listing's guarded profile; transaction signer choices remain separate. Legacy
people without a saved source id require review, and existing participant links
are not inferred from email/name/array order. No hosted backfill was performed.

The [saving repair report](seller-saving-repair-2026-10-11.md#phase-3-profile-alignment)
records the change comparison, focused checks and browser evidence. The
information-first onboarding and document workflow redesign remains Phase 6.

Use one shared seller profile model and common field definitions for the lead profile, listing profile, transaction seller section and relevant seller portal view. Make equivalent fields show the same saved values. Present the applicable groups for the seller's entity/ownership route, subject to existing access rules.

Repair the listing-to-transaction converter against the actual canonical shape, including nested company/trust registration, contact, directors/trustees, spouses and person roles. Preserve stable person identifiers. Add explicit adapters for supported legacy shapes rather than letting each screen invent its own fallback order. Surface saved identity, address and tax fields that are currently omitted from some views or discarded by the transaction person model.

**Done when:** saving and reopening a shared field from each permitted screen gives the same current value across the linked journey. Company/trust and married/multiple-owner handoffs retain all required people and fields. Missing values, deliberate clearing and fields awaiting review are displayed consistently.

## Phase 4 — Reconcile existing records safely

**Implementation status — 11 October:** the existing ownership report now
exports a labelled repeatable-read snapshot query and produces a bounded,
private correction/recovery packet. The read-only production audit covers
169 active sale listings and 99 captures. It finds 53 capture/canonical
disagreements, 46 listing display differences and 54 broken references
(overlapping counts), with **zero automatic correction candidates**. The
transaction guard/current-profile schema is still missing. No hosted record
was repaired or deployed. Record review and separately approved release/live
reconciliation remain required; the full Phase 4 completion criteria are not
yet met. See the [reconciliation audit](seller-data-reconciliation-audit-2026-10-11.md).

After the corrected paths stop creating new divergence, run a read-only comparison of the deployed schema, relationships and existing linked records in the intended environment. Use the existing relationship-integrity checks and historical normalisation patterns. Count missing links, duplicate identities, stale projections, missing handoff fields and conflicting identity/authority facts.

Produce a dry-run report with the proposed value, its source and the reason for each correction. Automatically repair only cases with an unambiguous authoritative source and identity. Send conflicting identities, ownership, marriage and signing authority for review. Do not pick a winner solely because its row timestamp is later: it could be a later stale overwrite.

Any approved repair must be bounded, repeatable and auditable, with recovery evidence and a before/after comparison. Use a new migration where required; do not rewrite previous migrations or signed evidence. Stop using obsolete write paths before considering removal of redundant columns or tables.

**Done when:** straightforward current projections agree, unresolved cases have an explicit review status, and the repair has preserved people, agency boundaries, transaction decisions and document history. The read-only production impact count is now available; correction and hosted verification remain pending.

## Phase 5 — Verify and show the saving/alignment result

Phase 5's local verification is implemented. The previously failing lead workspace and mandate checks now target `AgencyPipelinePage` and its shared models instead of the retired wrapper editor. The listing checklist check recognises a committed seller save with a failed checklist refresh, and the wizard tests match the current accessible upload label. All 11 wizard checks pass.

The existing SQL access check now shares its synthetic database setup with an isolated browser fixture. `npm run test:seller-profile-alignment-journey` runs actual listing, seller intake and transaction editor/profile components against the repository's migration RPCs in PGlite. Its lead host uses the shared profile editor and actual canonical save service. Navigation, Auth, the HTTP adapter, initial transaction creation and buyer panels are synthetic; this does not certify complete hosted routes, portal authentication or the full migration chain.

The browser check passes **15 scenarios**: saves/reopen through the lead service path, listing, transaction and seller intake; both orders of independent session updates; retained losing drafts; atomic rollback after a failed participant projection; exact-receipt retry after an interrupted confirmation and a later seller save; explicit blank clearing; stale submission and late-draft rejection; explicit staff reopening followed by a browser correction; a delayed draft followed by a save using its confirmed revision; and company, trust, spouse, multiple-owner and representative continuity. The submission/reopening commands are exercised directly through SQL, while the existing queue check executes the actual intake page's delayed draft/submission functions. Transactions are seeded in this fixture; the separate actual wizard and handoff-model checks cover capture/handoff. Two deliberately handled console errors were recorded (the injected stale draft and a navigation-cancelled draft); there were **0 uncaught browser errors and 0 external requests**.

Focused results: **45 SQL checks**, **49 editor/wizard tests** and **3 intake capture tests**, **21 profile/handoff model tests**, **19 seller-save/handoff service tests**, **31 historical audit tests**, the existing field/hydration/authority/continuity/save-queue checks, and scoped lint all pass. The normal `npm run check:app` command now passes: full lint (**0 errors / 615 existing warnings**), all nine baseline service scripts and the complete production build with a 4 GB caller memory budget. The first 3 GB attempt exhausted its heap. The existing import/chunk-size warnings remain. The build manifest validates all **818 critical assets**, and an offline Chromium check loads the built login controls without submitting credentials. The network login probe stays disabled. The build command now honours a caller's `NODE_OPTIONS` while retaining the existing 8 GB default. This allows a bounded-memory production build without changing bundling/minification settings. All client sources and build configuration match their build-start hashes. Four unrelated publication backend/test files changed during the build; the extra whole-tree fingerprint wrapper therefore returned a nonzero drift status even though `check:app` itself exited 0. The affected current publication/listing files pass refreshed lint with 0 errors / 4 existing warnings. This local frontend build does not attest a frozen full-server release snapshot.

**Checkpoint:** show the local results before moving to onboarding/documents. A hosted concurrency check and the Phase 4 legacy review/corrections remain release work. No hosted writes or deployment are part of this checkpoint.

## Phase 6 — Separate onboarding from the three documents

**Implemented locally on 11 October 2026.** The primary app now submits information
before disclosure preparation/signing. Each base document has an independent
route and guarded preparation; the protected portal progress extension is a new,
unapplied shared migration. See the [Phase 6 checkpoint](seller-saving-repair-2026-10-11.md#phase-6--information-first-and-independent-documents)
for verification and release limitations.

Once the data foundation is accepted, make information onboarding collect and submit seller/property details first. Move disclosure completion/signing out of the onboarding submission requirement. Handle mandate, disclosure and FICA in the document workspace, with the same three choices for each: **Upload manually**, **Generate and download**, **Generate and send for signature**.

Give each document its own requirements, permitted actors, selected route, review/signing state, version and visibility. Explain who must act next and distinguish a saved upload from a completed review or transaction handoff. Generating one document must not require generating another document unnecessarily. Retain the review, correction and evidence rules established for protected facts.

**Done when:** information onboarding can finish independently of disclosure signing, each document can follow its chosen route, and agent/seller views show the same evidence and next action. Existing accepted documents remain valid historical records.

## Release boundary and current evidence

Deployment and hosted data repair require a separate instruction. Release the required server guards and compatible frontend together, with an explicit migration scope, recovery plan and handling for already-open forms. Verify the agreed journeys and simultaneous saves on the hosted target as part of that approved release. Monitor conflict and failed-save outcomes before expanding to the next release.

The local saving and alignment work now has passing SQL, shared-field/hydration/handoff checks, focused editor checks and local Chromium conflict/profile checks. The Phase 5 browser/database and repaired harness checks pass, and the final seller/client source completes the full app verification and offline login asset check. Hosted multi-session verification and live legacy corrections remain outstanding. Phase 4 now supplies the deployed-schema comparison and point-in-time production impact counts. Synthetic fixtures validate the tooling separately from those production observations.

The initial planning step inspected the existing audits, primary-app README, client identity schema, relationship checks and the subsequent local seller revision-scope migration. The subsequent Phase 1 implementation adds `sellerDataOwnershipContract.js`, `listingSellerRelationshipModel.js` and the offline `report-seller-data-ownership.mjs` entry point, extends the existing focused checks and updates the established source-of-truth guide. No existing migration or application screen/save handler was changed in Phase 1.

Phase 1 verification: the relationship graph command passes **22 scenarios**, including explicit person mapping, capture ambiguity, cross-agency links, partial coverage, the regression for actual canonical ID loss (now asserting preservation), safe report output and the offline report's refusal to apply changes. The focused field/relationship/hydration/subject/listing/collaboration run passes **19 test entries**. Scoped lint passes with no errors or warnings. These are local contract/relationship checks; they do not establish live field synchronisation or hosted concurrency. A broad build was not repeated for Phase 1 alone; Phase 3 subsequently passes the app suite/build before its final refinements; final-source build verification remains outstanding as recorded above.

Supporting evidence: [saving repair](seller-saving-repair-2026-10-11.md), [field alignment audit](seller-profile-field-alignment-audit-2026-10-11.md), and [full workflow audit](seller-workflow-audit-and-repair-plan-2026-10-10.md).
