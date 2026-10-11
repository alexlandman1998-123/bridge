# Seller saving repair — 11 October 2026

This repair belongs to the primary Arch9 workspace and its shared Supabase seller functions. It is local and unreleased. No hosted migration, live data change, deployment, email delivery or listing publication was performed.

## What changed

| Surface | Saving behavior prepared in this repair |
| --- | --- |
| Seller lead workspace | The editor captures the saved record alongside its initial fields. It cannot borrow a newer background refresh's version to authorize an older form. Lead preparation and assisted capture pass the original onboarding revision to the guarded save. |
| Listing seller profile/contact/sections | Seller saves check both the listing and onboarding revision. A change confined to onboarding is also detected. Read-back data keeps its own server revision; an older local draft cannot be attached to a newer receipt. A confirmed save advances both revisions so the same user's next edit remains valid. |
| Listing property editor | Onboarding persistence uses the guarded staff command. The later property update no longer rewrites the editor's earlier seller facts. |
| Seller portal/onboarding page | Draft saves and submission share a page queue. Submission waits for a pending draft and uses its confirmed revision. Conflicts display a message, retain typed entries and stop automatic retries. Leaving with an unsaved conflict still prompts. |

The server now locks the listing first and onboarding second on these saving paths. It checks the caller's onboarding revision under those locks before updating the shared form. The canonical agent command also checks the listing revision. A stale request returns a non-retryable conflict rather than overwriting another person's saved details.

The raw staff save commits onboarding data and its canonical seller projection together. The old direct form-write helper now delegates to that command. A delayed browser projection no longer writes seller facts a second time after the portal RPC has committed them.

Ordinary edits and delayed autosaves cannot downgrade completed onboarding. The existing explicit staff "return for correction" action can reopen it, and deliberate onboarding-link replacement remains supported. Completion timeout recovery compares the persisted form with the intended submission before claiming that it saved.

Successful staff saves return the confirmed listing timestamp alongside the onboarding row. The listing screens apply the saved form, facts, status and both revisions together. A confirmed correction also clears the old displayed completion timestamps. Save receipts exclude seller portal credential hashes.

## Files to review

- `src/pages/agency/AgencyPipelinePage.jsx`: original lead editor snapshots, guarded preparation/assisted capture and confirmed save receipts.
- `src/pages/AgentListingDetail.jsx` and `src/pages/AgentListings.jsx`: original seller editor snapshots and advancement after confirmed saves.
- `src/pages/SellerOnboarding.jsx`: serial draft/submission queue, confirmed revision tracking, conflict feedback and unsaved navigation guard.
- `src/services/privateListingService.js` and `src/services/listingDetailsService.js`: guarded persistence, consistent conflict errors and submission confirmation.
- `src/services/listings/listingSellerCanonicalUpdateModel.js`: revision capture and application of confirmed snapshots.
- `supabase/migrations/20261010215549_seller_save_concurrency_guards.sql`: forward-only server guards, common lock order and atomic staff persistence.

Primary-app paths above are relative to `the-it-guy/`; the migration path is relative to the repository root. The working tree contains other active work; this report describes this seller saving repair only.

## Earlier repair checks

- Final focused saving/access/authority/collaboration checks: **45 passed**, including real SQL execution in an isolated PGlite database. These cover both stale agent/seller interleavings, stale submission, late drafts after completion, onboarding-only changes, permission boundaries, atomic rollback, deliberate correction and competing creation attempts.
- Final service checks: **59 passed**. Shared seller information editor checks: **18 passed**. These include conflict input retention, rejection of another tab's completion during timeout recovery, advancement after a confirmed save and clearing completion timestamps for correction.
- Save queue and fast-return contracts are included in the 45 focused checks. The queue check executes the actual page persistence functions with a delayed draft followed by submission.
- Existing listing/transaction continuity, historical normalization and upload-state checks: **30 passed**.
- Local Chromium portal check: a simulated conflict retains the typed email, emits one save request, stops retries and prompts before leaving. After a successful save, the next edit sends the newly confirmed revision.
- Existing connected seller document journey on a frozen local source copy: **1 journey passed**, including 3 PDF downloads/19 pages and preservation of saved signatures. This compatibility run preceded the final receipt display refinement, which is covered by the final service/SQL checks. Hosted Storage, real email and hosted signing were not exercised.
- `npm run check:app`: lint completed with **0 errors / 606 warnings**; the established baseline service tests passed. The host killed the build process (**exit 137**). A reduced-memory frozen-source build stayed in transformation under severe host memory pressure and was stopped. **The full app build is not confirmed; `check:app` is not a pass.** Focused service/editor lint also completed with no errors.

PGlite checks exercise committed stale interleavings; they do not establish a hosted multi-session load or deadlock stress result. The common lock order is reviewed in the SQL. Conflicting saves require reviewing the latest record and reopening the editor; this repair deliberately does not automatically merge competing edits. Unsaved entries remain in the current form until navigation.

## Release boundary

The forward migration is `supabase/migrations/20261010215549_seller_save_concurrency_guards.sql`. It and the updated frontend must be released together after separate approval. Older open portal forms lack the required revision and will need to reload after release. Nothing has been applied remotely.

The Phase 2 app check below supersedes the earlier build limitation. Before release, verify real agent/seller/transaction sessions against the hosted target as part of the separately approved migration/frontend release.

The onboarding steps and mandate/disclosure/FICA workflow redesign remain the next audit/repair stage after review of this saving change.


## Phase 2 extension

Implemented in the **primary workspace** and shared Supabase migration
`20261011065947_transaction_seller_atomic_saves.sql`. This adds to the existing
unreleased concurrency guards and revision-scope migration; it does not modify
older migration files.

| Before | Now prepared locally |
| --- | --- |
| Transaction seller saves reread the latest row and accept an older form. | Values and revision are loaded together; the command compares the originally displayed capture, transaction, form and participant revisions under locks. |
| Three separate writes can leave the transaction, form and participants different. | Required authority and current projections commit together; a failed projection rolls the whole command back. |
| Updating one seller renames every seller participant and omits their phone. | The command updates the exact primary contact participant, including phone, and the corresponding current party snapshot; other people and buyer fields remain intact. |
| Refreshing a transaction replaces unfinished seller entries. | Background props do not rebase the draft; conflicts retain entries. Explicitly choosing “Use latest saved details (discard my entries)” opens a fresh baseline. A delayed receipt cannot replace another transaction's editor. |
| Duplicate clicks/timeouts can be mistaken for a confirmed save. | One request runs at a time. A retry uses the same save reference, bound to actor, original revision and changed fields. Only its receipt advances the editor; replay returns the original receipt without restoring older data. |
| Loading/defaulting participants or the general roleplayer form can overwrite seller contacts. | Existing seller contacts are excluded from participant default upserts. The general roleplayer editor no longer writes seller fields. Database guards reject direct legacy contact writes and copied seller snapshots. |
| FICA-request and mandate-signed status helpers write a browser's entire old form. | Narrow server commands merge only the workflow action into the locked current form, keeping later stages and all current profile facts. |
| Preparing/sending an onboarding link can overwrite current capture or reopen completion. | The original displayed capture revision is required, including deferred preparation. Completed capture remains completed. The direct table fallback is removed. |
| Contact saves can restore an older listing address/price/mandate. | Unchanged operational fields are removed server-side. An actual property/mandate edit checks its displayed listing revision. |

The added participant reference identifies the **captured primary-contact slot**
(`seller_source_onboarding_id` plus `seller_source_contact_key=primary_contact`)
and the exact transaction participant UUID. It does not invent an owner, director
or trustee identity. A lone natural-person contact can be bound structurally; a
complex roster requires an already reviewed explicit contact link. Shared
name/email and array positions cannot select an owner. A missing link blocks the
transaction contact save for review rather than renaming a roster.

Linked legal-name/authority changes still use the listing identity and review
workflow. This transaction editor saves primary email/phone; it cannot substitute
an independent legal name for the captured seller. Unlinked transactions use
their own guarded contact authority. Pending collaboration proposals and accepted
document versions are untouched. Full profile field alignment, person handoff
mapping, legacy repairs, and onboarding/document redesign remain later phases.

Phase 2 verification:

- Existing `scripts/seller-onboarding-access.test.mjs`: **38 passing entries**, executing the real SQL against isolated PGlite fixtures. It includes both stale directions, atomic rollback, exact retry receipts, another owner unchanged, ambiguous links, actual active-membership permissions, direct-write/forged-command rejection, status merges, guarded/deferred link preparation, completed capture preservation, and newer listing operations preserved.
- Focused service/editor Vitest run: **80 passing tests** (59 existing seller access/service tests, 15 transaction editor tests and 6 new command-service tests).
- Existing canonical update/signing conflict checks, **10 collaboration checks**, **22 relationship graph scenarios**, **7 field/relationship/hydration/collaboration entries**, transfer-attorney deferral and document upload-state checks pass.
- Scoped lint for the new service, edited editor and regression checks passes without errors/warnings. `npm run check:app` passes: full lint (**0 errors / 617 warnings**), all nine baseline service scripts, production build and its login-asset probe. The existing bundle-size/import warnings remain. The final existing-file scoped lint has 0 errors / 54 pre-existing warnings.
- After the final navigation-receipt guard, the focused editor/service run remains **80/80** and scoped lint stays clean. An additional full rebuild stalled in transformation/disk I/O on this host and was stopped. The earlier complete `check:app` passed before this final small refinement; a fresh final-source build is still required before release.
- Local Chromium check against the actual editor with an isolated service fixture: losing phone draft retained, one request using its originally shown revision, explicit latest-data discard, then two successful saves using confirmed revisions. No browser errors. SQL persistence is verified separately above; this browser fixture does not certify hosted multi-session behavior.
- `scripts/seller-mandate-save-preserves-data.test.mjs` remains an outdated harness failure: it looks for the old mandate editor in `AgentLeadsPage.jsx`, which now delegates to `AgencyPipelinePage.jsx`. This check did not exercise the changed runtime saving path. The current canonical/signing and SQL mandate checks pass. Repair this harness with the two previously recorded outdated audit harnesses in Phase 5.

Release remains on hold. The existing guard migration, revision-scope migration,
new migration and compatible frontend must ship together only after a new release
instruction. Older direct writers will fail with an explicit conflict and must
use the guarded editor. Hosted data counts, a hosted concurrency/deadlock exercise,
legacy link review and any approved backfill remain outstanding. No migration,
email, publication or deployment ran remotely.


## Phase 3 profile alignment

Implemented locally in the primary Arch9 workspace, with one new shared
read-only SQL function in
`20261011073408_seller_current_profile_alignment.sql`. No migration was applied
remotely. The seller lead, listing, transaction current-profile panel and seller
portal now use the same saved-field reader and applicable profile groups. The
onboarding page uses that reader for field hydration, while its existing steps
and document requirements remain for the later workflow phase.

| Before | Now prepared locally |
| --- | --- |
| Lead personal cards can prefer an old CRM email/phone over current capture. | Linked current capture wins consistently. An explicitly blank value or empty roster stays cleared instead of reviving an older alias. |
| Listing, portal and transaction show different subsets of seller facts. | Shared groups display the applicable individual/entity, identity, address, tax/residency, spouse, people, authority and property-ownership fields. Missing and explicitly cleared values use the same presentation. |
| Company/trust conversion misses nested registration and rosters; married handoff loses spouses. | The handoff uses current raw capture plus its actual canonical shape, retaining registration, directors/CC members, beneficial owners, trustees/founders/beneficiaries, spouses, executors and representatives. |
| Canonical transformation drops roster ids; a handoff invents replacement identities. | Persisted source person ids and their capture parent are preserved. A missing legacy source id remains a review finding; name/email/government ID/array position cannot supply it. |
| SA residency overwrites tax residency; unit overwrites registered section; contact edits can lose marriage regime or representative phones. | These facts are saved independently. Marriage regime, including accrual, and spouse/signatory/trustee/executor/representative phone fields round-trip through the shared reader/writer. |
| Transaction seller information can show an old deal summary as current identity. | A permission-checked RPC reads the single linked current capture in one statement. Restricted, absent and ambiguous relationships are explicit states; no old summary is presented as the current linked profile. |
| Linked identity can be edited again during transaction creation. | Identity comes from the linked capture. Transaction signer choices remain separate. Legal corrections open the displayed linked listing's guarded seller profile. |
| A saved roster person id can be reused as a transaction participant primary key. | A newly created primary-contact participant uses its own transaction-local UUID and explicit capture-slot reference. Existing participant identities are preserved. Complex legacy links still require review. |

The new RPC retains invoker security and existing transaction, listing and capture
access checks. It returns allowed current profile fields and excludes portal
credentials, unrelated document payloads and commercial decisions. Supported
legacy field/entity aliases are retained. The compatible frontend and all
unreleased seller guard/read migrations must be released together after an
explicit release instruction.

### Phase 3 verification

- Focused shared-field, hydration, capture, authority, handoff, relationship and canonical-update run: **30 passing entries**. The relationship graph includes **22 scenarios**. The final shared-reader alias/precedence refinement passes **68/68** combined SQL, profile model, transaction handoff and capture/hydration entries. It verifies current nested legacy entity data wins over an older canonical copy.
- Real SQL in isolated PGlite fixtures: **45 passing entries**, including the existing concurrent-save/rollback/permission protections and six current-profile scenarios. They cover confirmed contact clearing, full trust facts, access/cross-agency denial, ambiguous captures, unlinked seller-only capture, supported nested legacy company fields and exclusion of unrelated payloads. The separate existing collaboration check passes **10 entries**.
- Focused editor/service run: **96 pass, 4 fail of 100**. The four transaction-wizard tests still expect the older “Choose documents” screen. Running against the source files captured before Phase 3 reproduces the same **7 passes / 4 failures** in that test file. After the final linked-profile navigation refinement, the current-profile/editor run passes **20/20**, including the new correction-entry assertion.
- Scoped lint on new and smaller edited files is clean. Lint on the existing large pages/API has **0 errors** with existing warnings. `npm run check:app` passed before the final linked-profile navigation and legacy-reader refinements: full app lint (**0 errors / 615 warnings**), all nine baseline service scripts, production build and login-asset probe. Existing circular-import and bundle-size warnings remain. The extra rebuild was stopped under host memory pressure; the final-source retry with a 2 GB Node heap was then terminated with **exit 137**, without a compilation diagnostic. The final navigation/profile editor checks pass **20/20**, the final reader/SQL/handoff checks pass **68/68**, and final scoped lint is clean. A successful final-source production build/login probe remains required before release.
- Local Chromium uses the actual editor/current-profile component and shared model with an isolated service fixture. It verifies company registration and director address, trust registration and trustee address, separate SA/tax residency, losing phone draft retained after conflict, explicit latest-data recovery, and profile refresh after a confirmed save. No browser errors were logged. This is local UI evidence; SQL persistence is checked separately and hosted multi-session behavior is still unverified.

The repaired hydration harness now passes. Older lead-wrapper/mandate harnesses,
the listing capture service-wording assertion and the four wizard document-screen
tests still need updating against their current workflows in Phase 5. They are
not counted as passing checks. Phase 4 now supplies the read-only hosted
relationship/value comparison and private review packet. Live legacy corrections
remain pending; the audit finds no safe automatic candidates and missing
transaction guard/current-profile schema. See the
[reconciliation audit](seller-data-reconciliation-audit-2026-10-11.md).
Onboarding/document workflow redesign has not begun. This alignment task made
no hosted writes or deployments.


### Local verification evidence

Logs from this task are under `/tmp/arch9-seller-phase3/`:
`focused-final.log`, `sql-curation-confirmed.log`, `current-source-final.log`,
`vitest-final.log`, `wizard-baseline.log`, `profile-editors-final.log`,
`check-app.log`, `build-verified-source.log` and `browser-result.log`.
The browser screenshots are `company-profile.png` and `trust-profile.png` in
that directory. These contain synthetic fixture details and temporary local
paths. The task's browser and fixture server were closed; the terminated final
build is no longer running.


## Phase 5 — Local verification checkpoint

The older lead workspace/mandate harnesses, listing checklist wording check and four transaction upload tests recorded above have been repaired. The lead tests now assert wrapper delegation, the active workspace's shared profile model and original save baseline, explicit blank/zero changes, and no-change detection. The mandate check executes the actual shared terms patch and canonical update builder: the selected commission basis clears its inactive aliases while seller answers, unrelated fields and accepted document versions survive. The wizard uses the upload input's current accessible label, including its help text.

A shared synthetic PGlite fixture replaces duplicated setup in the existing access check. The new focused `npm run test:seller-profile-alignment-journey` connects actual listing, intake and transaction components/models to those real migration RPCs through an isolated HTTP adapter. It provides two independent browser sessions, database readback and injected failure controls. The lead host/navigation, initial transaction creation, Auth and buyer panels are synthetic; the complete hosted routes, portal auth and full migration chain remain unverified. Actual lead save handlers and portal queue functions are checked by the existing hydration and serialization harnesses; the wizard and handoff checks cover transaction capture separately.

Results on 11 October 2026:

- **15 browser scenarios pass**: cross-entry saves/reopen; seller-first and agent-first conflicts retaining drafts; failed-projection rollback of capture/listing/transaction/participants/form/receipt; exact-command retry after a lost confirmation and a subsequent seller edit; deliberate contact clearing; stale submission/late draft rejection and explicit staff correction reopening; delayed draft/newer input revision handling; company/director, trust/trustee, spouse, multiple-owner and representative continuity with stable saved person references. Submission/reopening SQL is verified directly rather than claimed as a completed browser submission.
- **45 real SQL checks pass**, including access scope, both stale interleavings, rollback, authority and receipt protections.
- **49 editor/wizard tests** and **3 intake capture tests**, **21 profile/handoff model tests**, **19 seller-save/handoff service tests** and **31 historical audit tests** pass. The existing shared-field, hydration, authority, lead/listing prefill, canonical save, draft/submission serialization, transaction/document continuity and relationship graph checks also pass.
- Scoped lint passes with **0 errors / 0 warnings**. Browser evidence has **0 uncaught errors / 0 external requests**. It retains the expected handled stale-save and navigation-cancellation console messages instead of claiming there were no console errors.
- The normal **`npm run check:app` passes**: full lint (**0 errors / 615 existing warnings**), all nine baseline service scripts and the complete production build. A first 3 GB build exhausted its Node heap; the 4 GB retry succeeds with normal bundling/minification settings. Existing import/chunk-size warnings remain. The build command now honours a caller memory budget while retaining its previous 8 GB default. The asset manifest check validates **818 critical assets**. An offline Chromium smoke check renders the built email/password/sign-in controls with no uncaught page errors or missing local assets; Google Fonts is deliberately blocked. Credentials are never submitted and the opt-in network login probe stays disabled.

Browser evidence is generated at `the-it-guy/output/playwright/seller-alignment/`: `result.json`, `source-hashes.json`, a retained-draft screenshot and five current entity/relationship screenshots. It contains synthetic fixture values. Focused check logs and build input hashes are in `/tmp/arch9-seller-phase5/`. The browser/server close automatically when the check finishes.

Phase 4's private review packet remains pending, with no safe automatic repair candidates. The missing hosted transaction guard/current-profile migrations and live concurrency verification are still part of a separately approved release. Onboarding/document redesign remains the next phase. This phase performs no hosted writes or deployment.


Build provenance: the production build-start/client/config hashes remain unchanged through successful completion, and the browser-tested seller hashes still match. Four unrelated publication backend/test files changed while the build ran (`server/property24/api.js`, `server/property24/publishService.js`, `server/services/privatePropertyControlledPublishService.js`, `server/tests/listingPhotoChange.test.js`). The extra whole-tree fingerprint wrapper returned a drift failure; this is separate from the normal app command's successful exit 0. Refreshed lint on the current affected publication/listing files passes with 0 errors / 4 existing warnings. The local frontend artifact verifies the final seller/client code; a future release still needs an exact, frozen frontend/server/migration scope and hosted verification.

## Phase 6 — Information first and independent documents

Implemented locally in the **primary transaction workspace**, with one new
read-only portal response migration in the shared Supabase layer. Information
onboarding now has three steps: seller information, property information, and
review/submission. Disclosure questions, declaration and signature no longer gate
ordinary information submission. Mandate preferences may be left unset until
preparation. Required identity/property/FICA facts, information consents and
protected authority rules still apply. New submissions carry an information-only
completion marker and direct the seller to agent review followed by Documents.
Historical records and dedicated legacy signer links keep their existing contract.

The agent can choose **Upload manually**, **Generate and download**, or **Generate
and send for signature** independently for mandate, disclosure and FICA in the
lead/listing document workspace. Disclosure answer capture is now available during
its preparation; capturing answers never supplies seller attestation. Generating
FICA or mandate no longer automatically generates disclosure. Existing accepted
copies remain in version history, and changes affecting their underlying facts
still require the established correction/review workflow. Supporting FICA
evidence and transaction handoff are separate from declaration completion.

Listing preparation now commits the selected document metadata and facts through
one guarded canonical save. Both lead and listing preparation retain the editor's
original baseline. A conflict or unconfirmed checklist readback preserves the
saved evidence/draft and blocks dispatch/download until resolved. Successful
review updates the baseline to its actual receipt. No separate commission write
can partially commit a document preparation.

Agent and seller models share document state, version and next actor. Upload,
signature completion and agent acceptance are distinct. The portal keeps its
existing agency-managed base-pack upload policy, rather than granting new upload
access. `20261011111846_seller_portal_document_progress.sql` extends the existing
protected full/core readers after their access checks with three-document progress
and lightweight copy identifiers. It exposes no recipient identity, tokens,
signatures or HTML, and does not enrich public intake reads. Private helper
execution and raw signing tables remain unavailable to anonymous callers. Invalid
legacy workflow metadata cannot break the protected read. Without the extension,
the frontend explicitly reports unavailable signing progress instead of inventing
a delivery state. A constant moved to the existing dependency-free base-pack
contract also removes a native portal import-cycle failure.

The portal activity feed and readiness summary now use these individual document
states for information-only submissions. A completed FICA declaration can remain
complete while disclosure awaits review, with publication still blocked until
required reviewed evidence is complete. The overview no longer invents a pending
legacy combined disclosure/FICA signature or mixes old signer counts with new
document progress. Historical flows retain their original status contract. The
focused workflow/status/feed checks pass **25 tests**. An older approved upload
cannot mark a different current signing version complete or hide its failed-send
retry; accepted history remains complete. Their scoped lint is clean.

Visual sampling of the exported documents found the final FICA declaration line
clipped at its card border. The paragraph now has explicit print font size and
padding, rather than relying on inherited paragraph spacing. Its wording is
unchanged and frozen existing versions are preserved. New copies use the corrected
spacing, confirmed on the rendered export. The document journey and app build
pass after this change.

Local verification is recorded in `/tmp/arch9-seller-phase6/`.
The alignment browser suite passes **16 scenarios**, including actual information
submission without disclosure answers, mandate dates or signatures, with accepted
versions preserved and **no external requests**. The final
document browser suite passes **16 journeys / 54 PDF downloads / 293 pages**,
and the full app check passes (lint **0 errors / 613 warnings**, nine baseline
scripts and production build).
The SQL suite passes **46 checks**; the model suite passes **52**; legacy portal,
review and signed-projection checks pass **36**; focused capture/actions/service
tests pass **10**. The reviewed-version suite passes its unit/UI checks and
**24 local issuance/viewing flows with 18 tampering cases**. The actual preparation
handler check passes **51 scenarios**, covering each selected document through
download and send, conflict/warning cases, and clearing an unrelated active pack
from individual document preparation. The reviewed-version suite includes **54
model tests and 9 UI/service tests**; submission notification and the **10
release-source checks** pass.
Old fixtures now explicitly select all three documents when testing a full pack.

Final verification uses the preserved local source snapshot at
`/tmp/arch9-seller-phase6/verified-workspace/`, because unrelated edits changed the
shared seller pages after an earlier browser run. Its SQL, preparation-handler,
alignment-browser, document-browser and full `check:app` results pass; the document acceptance
fingerprint still matches all **122** collected source files. The asset manifest
validates **818 assets**. The snapshot excludes environment files and uses local
build configuration. The snapshot has not been deployed or copied over the shared
checkout. Eight core preparation/review handlers in the shared pages still match
the verified snapshot; later unrelated page edits need exact release-scope
verification alongside the rest of the active working tree. Evidence is recorded
in `verified-*.log`, `verified-document-source.json`, `verified-source-inputs.json`
and `current-handler-provenance.json`.

The isolated built app opens locally and its sign-in page renders. With environment
files intentionally excluded, the account screen reports missing configuration
and authentication is disabled. No credentials were entered; this smoke check
does not verify an authenticated hosted workspace.

The older `test:seller-onboarding-review-handoff` npm command is unavailable
because its target script is absent in the existing tree. The current review
model and actual preparation-handler checks pass; no substitute script was added.

These checks use synthetic local data, isolated PostgreSQL, browser fixtures and
delivery/storage adapters. They do not establish hosted Auth, actual provider
delivery, remote storage or full production migration-chain behavior. The new
progress migration delegates the existing protected-reader contract, whose access
decisions are represented by a fixture in the local SQL test. The required earlier
alignment guards and this extension must ship with the compatible frontend in a
separately approved release, followed by hosted simultaneous-save and portal
verification. Existing legal wording/agency approvals remain release requirements.
No migration was applied remotely, no live records were changed, no email was
sent, and no deployment was made. Unrelated working-tree changes were preserved.
