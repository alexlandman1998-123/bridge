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

## Checks

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

Before release, complete the full app build on a machine with available memory and verify two real agent/seller sessions against the hosted target after the approved migration/frontend release.

The onboarding steps and mandate/disclosure/FICA workflow redesign remain the next audit/repair stage after review of this saving change.
