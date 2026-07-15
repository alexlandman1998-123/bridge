# Cancellation attorney module - Phase 2 canonical data contract

Phase 2 closes the second Phase 0 blocker: `cancellation_data_contract_missing`.

It introduces the canonical cancellation matter data contract. It does not add persistence, lender integrations, Deeds Office integrations, document generation, settlement execution or a Cancellation Pack Workspace.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase2.js`. The cancellation command centre now also carries the resolved Phase 2 canonical payload through `src/core/transactions/attorneyCancellationWorldClassCockpit.js`.

## What changed

- Added canonical fact definitions for every Phase 0 cancellation data-contract key.
- Each fact resolves from explicit source paths only.
- Missing facts remain missing; the resolver does not infer or guess from workflow progress.
- Every resolved fact carries source path, source type, source id, capture date, verification date, verifier and expiry metadata.
- Facts can be `missing`, `unverified`, `verified`, `stale` or `conflict`.
- Cancellation figures expiry can become stale from the expiry-date value itself.
- The contract emits a per-fact fingerprint and an overall data fingerprint.
- Draft invalidation now has a deterministic rule: if a bound cancellation fact fingerprint changes, the draft is invalidated.
- The cancellation cockpit exposes both Phase 1 usability and Phase 2 canonical data.

## Canonical fact groups

- Existing bond: seller existing-bond status, cancellation bank and bond account number.
- Instruction: lender instruction reference and receipt date.
- Notice: 90-day notice status, notice date and penalty or notice risk.
- Figures: cancellation figures amount, expiry date and daily interest.
- Guarantees: required guarantee amount, beneficiary and wording, reference and acceptance status.
- Signing: seller signing requirement and signed cancellation document status.
- Lodgement: lodgement reference and date.
- Registration: cancellation registration reference and date.
- Settlement: settlement amount and payment reference.
- Close-out: close-out status.

## Phase 2 boundary

This phase intentionally does not:

- store canonical facts in the database
- extract facts automatically from PDFs
- render a Cancellation Pack Workspace
- generate operational cancellation documents
- generate legal instruments
- request external cancellation figures automatically
- accept guarantees automatically
- mark registration from workflow stage text alone
- reconcile settlement
- write to external systems
- mutate the matter
- treat unverified data as draft-safe

Those are later phases. Phase 2 is the truth layer they depend on.

## Why this helps the cancellation attorney

The cancellation conveyancer can now see whether the matter is blocked because a fact is missing, unverified, stale or conflicting instead of treating all incomplete work as the same kind of problem.

This matters most for cancellation figures and guarantees. Figures expiry, account references, guarantee amounts and settlement references now have source-bound fingerprints, so later operational drafts and workspaces can safely detect when a lender-issued value has changed.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase2
```

Phase 2 is complete when Phase 0 and Phase 1 still pass, every Phase 0 cancellation data-contract key has a Phase 2 canonical fact definition, missing facts stay missing, unverified facts are not draft-safe, conflicts and stale figures are detected, changed source facts invalidate bound drafts, the cancellation cockpit carries the Phase 2 payload, and all generation/external-write boundaries remain blocked.
