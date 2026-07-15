# Cancellation attorney module - Phase 10 release certification

Phase 10 closes the controlled blocker `cancellation_release_certification_missing`.

It is the final go/no-go certificate for the controlled cancellation-attorney pilot. It proves that Phases 0-9 are actually safe to use: every Phase 0 release blocker must be closed, every conveyancer operating capability must be available, and every safety boundary must still be intact.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase10.js`.

## What changed

- Added a read-only cancellation-attorney release certification.
- Added deterministic closure checks for every Phase 0 release blocker:
  - cancellation lane usability not simplified
  - cancellation data contract missing
  - cancellation pack workspace missing
  - cancellation operational generator missing
  - cancellation figures register missing
  - guarantee coordination workspace missing
  - cancellation document/signing workspace missing
  - cancellation lodgement/registration evidence not packet-bound
  - settlement close-out packet missing
  - cancellation release certification missing
- Added a conveyancer capability checklist covering:
  - existing-lender instruction intake
  - role-focused cancellation cockpit
  - verified canonical cancellation facts
  - operational draft generation
  - cancellation figures register
  - guarantee coordination
  - governed document/signing readiness
  - lodgement and registration evidence
  - settlement and close-out reconciliation
- Added a final safety boundary check so the release certificate cannot quietly enable external writes, lender portal integration, Deeds integration, settlement execution, registry mutation, notification sending, automatic release approval, legal-instrument generation or template-governance overrides.
- Added redacted audit metadata with criteria, blocker closures, capability keys, fingerprints and counts only.

## Core rule

Phase 10 is a certificate, not another workflow shortcut.

If a blocker is still open, a capability is missing or a boundary is unsafe, the certificate is `blocked` and returns next actions. If everything is closed and safe, the certificate is `ready`.

## Controls

Phase 10 enforces these controls in code:

- Release certification is read-only.
- The Phase 0 scope lock must remain intact.
- All Phase 0 release blockers must have closure evidence.
- All conveyancer operating capabilities must be ready.
- Phase 9 settlement close-out must be ready.
- Manual evidence remains primary.
- The certificate may produce next actions only.
- It cannot mutate the matter.
- It cannot write to external systems.
- It cannot send notifications.
- It cannot submit to an existing-lender portal.
- It cannot integrate with Deeds Office systems.
- It cannot mutate a registry outcome.
- It cannot execute settlement payments.
- It cannot auto-overwrite manual evidence.
- It cannot auto-approve release.
- It cannot override template governance.
- It cannot generate legal instruments.

## Phase 10 boundary

This phase intentionally does not:

- deploy the module
- create migrations
- change production data
- send seller, lender, bank or attorney notifications
- approve or generate legal instruments
- submit anything to an existing lender
- call Deeds Office systems
- mark a matter registered
- execute settlement
- close a bank file externally

It is certification only.

## Why this helps the cancellation attorney

Phase 10 answers the question we started with: can a conveyancer do the cancellation-attorney job inside the module without tripping over missing tools or unsafe automation?

The answer is now machine-checkable. The firm can see whether the cockpit, data contract, workspace, documents, figures, guarantees, signing evidence, lodgement/registration packet and settlement close-out are all present before the pilot is switched on.

That turns the cancellation-attorney module from a collection of useful parts into a controlled release candidate.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase10
```

Phase 10 is complete when Phases 0-9 still pass, all ten Phase 0 release blockers close, the conveyancer capability checklist is fully ready, unsafe boundaries block release, broken Phase 4 or Phase 9 gates block release, and audit metadata stays redacted.
