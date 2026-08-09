# Kingstons Listing Terms Phase 1

## Scope

Phase 1 adds a Kingstons-only workflow step after Seller Pack and before List Property.

The step captures:

- Commission terms.
- Nominated transfer attorney.

This does not create a new attorney-instruction architecture. The nominated attorney remains pre-instruction context until signed OTP activates the existing legal handoff.

## Workflow

Current Kingstons seller stages now run:

1. First Contact
2. Schedule Valuation Appointment
3. Formal Valuation
4. Valuation Presentation
5. Seller Pack
6. Listing Terms
7. List Property

`Listing Terms` is complete only when both evidence keys are satisfied:

- `commission_terms_confirmed`
- `transfer_attorney_nominated`

## Persistence Contract

The Kingstons seller lead stores listing terms in the CRM lead raw payload:

- `rawEnquiryPayload.kingstonsListingTerms`
- `rawEnquiryPayload.listingTerms`

The same object is patched onto the selected lead in memory as:

- `kingstonsListingTerms`
- `listingTerms`

The payload contains:

- `commission`
- `transferAttorney`
- `commissionConfirmed`
- `transferAttorneyNominated`
- `confirmedAt`
- `confirmedBy`

## Listing Handoff

When the listing is created from the seller lead, the Seller Pack handoff now also includes:

- `sellerCanonicalFacts.kingstonsListingTerms`
- `sellerCanonicalFacts.listingTerms`
- `sellerCanonicalFactReadiness.commissionTerms`
- `sellerCanonicalFactReadiness.transferAttorney`
- `commission`
- `commissionTerms`
- `rolePlayers.transferAttorney`

List Property is blocked until both Seller Pack and Listing Terms are complete.

## Attorney Pipeline Boundary

Existing architecture already supports the intended legal boundary:

- `private_listing_role_players` stores transfer attorney allocations with `allocation_status = 'awaiting_buyer'`.
- The attorney pre-instruction pipeline reads `awaiting_buyer` allocations.
- Signed OTP changes the allocation to `instructed` via the existing transaction trigger.

Phase 2 allocates connected nominated attorneys into `private_listing_role_players` once the private listing exists, without marking them instructed.

If the agent captures a free-text seller-selected attorney that is not connected to the agency partner network, the nomination is retained on the listing facts and an internal activity is written, but no attorney pipeline item is created because there is no firm workspace to route it to.

## Phase 2 Implementation

- Create the `awaiting_buyer` transfer-attorney allocation during Kingstons listing creation.
- Resolve the selected attorney through the canonical partner-role configuration RPC.
- Use the v2 private-listing transfer-attorney allocator where available.
- Write a private listing activity showing whether the attorney was added to the pre-instruction pipeline or only captured as a pending connection.

## Phase 3 Implementation

- Add a reusable Kingstons Listing Terms summary card to the seller Overview and Documents workspaces.
- Show the captured commission, nominated transfer attorney, and attorney pipeline state in one compact place.
- Keep the CTA wired to the existing Listing Terms modal instead of adding another edit flow.
- Label connected attorney nominations as `Awaiting buyer` and unconnected free-text nominations as `Pending connection`.
- Make the legal boundary explicit in the UI: signed OTP sends the formal instruction to the attorney.

## Phase 4 Implementation

- Hydrate the selected Kingstons listing's transfer-attorney allocation from `private_listing_role_players`.
- Verify the agent-facing Listing Terms card against the real attorney pipeline allocation, not only the saved lead payload.
- Show `Verified in attorney pipeline` when the connected transfer attorney has an `awaiting_buyer` allocation.
- Show `Not visible in pipeline` when a connected attorney is nominated but no allocation row exists for the listing.
- Keep pre-listing nominations clear with `Not listed yet`, because the attorney pipeline receives the row only after List Property creates the listing.
- Preserve the signed-OTP boundary: pre-instruction visibility is not a formal attorney instruction.

## Phase 5 Implementation

- Add an operational alert to the Listing Terms summary when a connected nominated attorney is not visible in the attorney pipeline.
- Expose a scoped `Retry pipeline sync` action from both the Overview and Documents Listing Terms cards.
- Reuse the existing `syncKingstonsTransferAttorneyPreInstruction` path for repair instead of adding a second allocation mechanism.
- Update the live verification state immediately after a successful retry so the agent sees `Verified in attorney pipeline`.
- Keep skipped repair reasons explicit: unconnected attorney firms and unresolved transfer-attorney role configurations remain visible as attention states.

## Phase 6 Implementation

- Add a Kingstons-only exception report to the seller Overview workspace.
- Track the Seller Pack -> Listing Terms -> List Property handoff without changing backend architecture.
- Flag leads that sit after Seller Pack without confirmed Listing Terms.
- Flag leads where Listing Terms are confirmed but the private listing has not been created.
- Flag connected nominated attorneys that are still not visible in the awaiting-buyer attorney pipeline.
- Reuse existing agent actions from the report: `Confirm terms`, `Create listing`, and `Retry pipeline sync`.

## Phase 7 Implementation

- Add aggregate principal-level reporting for Kingstons seller workflow exceptions.
- Surface a compact reporting card in the agency reporting overview for principals.
- Aggregate open exceptions across loaded Kingstons seller leads for Listing Terms, List Property, and attorney visibility.
- Reuse the Phase 6 single-lead exception model to avoid introducing a parallel workflow rule set.
- Keep the report read-only with `Open lead` actions that route principals back into the existing seller workspace.
- Avoid backend fan-out: the aggregate report uses already-loaded CRM lead, appointment, and linked listing state.

## Phase 8 Implementation

- Make the principal-level Kingstons exception report allocation-aware.
- Add a bulk transfer-attorney allocation reader over the existing `private_listing_role_players` table.
- Hydrate only the loaded Kingstons linked listing IDs, avoiding global scans or new backend architecture.
- Feed verified allocation rows into the aggregate exception model so connected attorneys with `awaiting_buyer`, `under_offer`, or `instructed` allocations are not incorrectly flagged as missing.
- Show allocation verification loading/error state in the principal report.
- Keep the single-lead workspace as the repair surface for retrying allocation sync.

## Phase 9 Implementation

- Add a principal CSV export for the allocation-aware Kingstons seller workflow exception report.
- Export the same loaded report rows already shown in the principal reporting view, with no new backend tables or scheduled jobs.
- Include seller, property, agent, stage, age, severity, recommended action, attorney pipeline status, allocation verification, and lead ID.
- Produce a clear-state summary row when no exceptions are open so principals can still keep a dated evidence file.
- Disable export while transfer-attorney allocation verification is loading to avoid half-checked operational reports.

## Phase 10 Implementation

- Add a manual principal digest draft for the allocation-aware Kingstons seller workflow exception report.
- Reuse the same loaded report rows and transfer-attorney allocation verification evidence as the principal card and CSV export.
- Provide a `Copy Digest` action for principals to paste into email, WhatsApp, or internal notes without introducing scheduled sending yet.
- Include summary totals, allocation verification status, top exceptions, recommended actions, and clear-state copy when no exceptions are open.
- Block digest copying while transfer-attorney allocation verification is loading so the digest is not sent with half-checked attorney pipeline data.

## Next Phase Targets

- Add persisted exception snapshots or scheduled digests once the allocation-aware principal report, CSV export, and manual digest have been validated in production usage.
- Add scheduled principal distribution only after Kingstons confirms the report audience and cadence.
