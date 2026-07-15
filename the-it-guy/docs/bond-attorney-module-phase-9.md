# Bond attorney module - Phase 9 inbound bank and registry signal reconciliation

Phase 9 closes the Phase 0 blocker `bank_and_deeds_integrations_absent` without pretending we have live bank or Deeds Office integrations.

The executable source is `src/core/transactions/bondAttorneyModulePhase9.js`.

## What changed

- Added an inbound signal register for optional bank and registry events.
- Added supported signal types for:
  - bank approval to lodge
  - guarantee issued or updated
  - lodgement confirmed
  - registration confirmed
  - Deeds Office rejection
- Added trusted source types for bank portals, secure bank email, bank webhooks, Deeds Office feeds, external registries and trusted middleware.
- Reconciled inbound signals against the Phase 8 lodgement/registration evidence packet.
- Added reconciliation outcomes:
  - `matched`
  - `conflict`
  - `review_required`
  - `stale`
  - `untrusted`
  - `duplicate`
  - `unsupported`
  - `orphaned`
- Added next actions for conflicts, untrusted signals, unsupported signals, stale signals and missing Phase 8 packet readiness.
- Added redacted audit metadata. The audit event includes ids, source types, signal types, outcomes, fingerprints and metrics, not raw bank payloads, evidence facts, template content or signer details.

## Core rule

Manual evidence remains the primary record.

Phase 9 does not replace the bond attorney’s evidence packet. It only reconciles optional inbound signals against the evidence already verified in Phase 8. If a signal disagrees with the packet, the module blocks release and gives the conveyancer a review action instead of silently changing the file.

## Controls

Phase 9 enforces these controls in code:

- Phase 8 packet readiness is required.
- Inbound signals are optional; zero inbound signals can still pass if the manual packet is ready.
- Trusted source type is required for every signal.
- Signature verification is required for every signal.
- Duplicate signals are ignored with a warning.
- Stale signals are non-blocking but produce a review action.
- Conflicts, unsupported signals, untrusted signals and orphaned signals block release.
- Bank and deeds references must match the Phase 8 packet where applicable.
- A Deeds Office rejection conflicts with an already registered packet.
- The audit event is redacted and fingerprinted.

## Phase 9 boundary

This phase intentionally does not:

- call a live bank API
- call a live Deeds Office API
- submit anything to a bank portal
- mutate a registry outcome
- overwrite manual evidence
- synthesize bank approval
- synthesize Deeds Office confirmation
- send outbound messages
- mark a matter registered on the strength of an inbound event alone

It is a reconciliation gate only.

## Why this helps the bond attorney

The bond team can now safely use future bank and registry signals without making their day more fragile.

If the external signal agrees with the attorney’s verified evidence packet, the file gets a clean match. If it disagrees, is stale, unsigned, untrusted or unsupported, the conveyancer gets a precise action instead of a mystery blocker.

That means Phase 9 improves readiness for real integrations while preserving the attorney’s actual operational truth: reviewed evidence wins.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase9
```

Phase 9 is complete when Phases 0-8 still pass, optional inbound signals reconcile safely, no inbound signals are required for release, conflicts block, duplicate and stale signals are handled deliberately, untrusted or unsupported signals block, Deeds Office rejection conflicts with a registered packet, and audit metadata stays redacted.
