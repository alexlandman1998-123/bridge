# Bond attorney module - Phase 10 release certification

Phase 10 is the release gate for the controlled bond-attorney pilot.

It does not add another operational shortcut. It proves the work from Phases 0-9 is actually safe to use: every Phase 0 release blocker must be closed, every conveyancer capability must be available, and every safety boundary must still be intact.

The executable source is `src/core/transactions/bondAttorneyModulePhase10.js`.

## What changed

- Added a read-only bond-attorney release certification.
- Added deterministic closure checks for every Phase 0 release blocker:
  - Bond Pack Workspace missing
  - Bond operational generator missing
  - Bank conditions are not yet structured
  - Signing workspace missing
  - Legal instrument templates are not approved
  - Lodgement and registration evidence is not packet-bound
  - Bank and Deeds integrations are absent
- Added a conveyancer capability checklist covering:
  - matter opening and bank instruction intake
  - verified canonical bond facts
  - operational draft generation
  - bank-condition worklists
  - signing and bank-submission readiness
  - governed legal-template selection
  - lodgement and registration evidence
  - inbound bank/deeds reconciliation
  - registration notification and bank close-out
- Added a final safety boundary check so the release certificate cannot quietly enable external writes, live bank submission, registry mutation, notification sending, automatic release approval, legal-instrument generation or template-governance overrides.
- Added redacted audit metadata with criteria, blocker closures, capability keys, fingerprints and counts only.

## Core rule

Phase 10 is a go/no-go certificate.

It does not make the bond attorney's decisions. It tells the firm whether the bond-attorney module is safe for the narrow pilot defined in Phase 0.

If a blocker is still open, a capability is missing or a boundary is unsafe, the certificate is `blocked` and returns next actions. If everything is closed and safe, the certificate is `ready`.

## Controls

Phase 10 enforces these controls in code:

- Release certification is read-only.
- The Phase 0 scope lock must remain intact.
- All Phase 0 release blockers must have closure evidence.
- All conveyancer operating capabilities must be ready.
- Phase 9 reconciliation must be release-ready.
- Manual evidence remains primary.
- The certificate may produce next actions only.
- It cannot mutate the matter.
- It cannot write to external systems.
- It cannot send notifications.
- It cannot submit to a bank portal.
- It cannot mutate a registry outcome.
- It cannot auto-overwrite manual evidence.
- It cannot auto-approve release.
- It cannot override template governance.
- It cannot generate legal instruments.

## Phase 10 boundary

This phase intentionally does not:

- deploy the module
- create migrations
- change production data
- send buyer, bank or attorney notifications
- approve a legal instrument
- generate a legal instrument
- submit anything to a bank
- call Deeds Office systems
- mark a matter registered
- close a bank file

It is certification only.

## Why this helps the bond attorney

Phase 10 answers the operational question we started with: can a conveyancer do the bond-attorney job inside the module without tripping over missing tools or unsafe automation?

The answer is now machine-checkable. The firm can see whether the workspace, document drafts, bank conditions, signing evidence, template governance, lodgement packet, inbound reconciliation and close-out capability are all present before the pilot is switched on.

That turns the bond-attorney module from a collection of useful parts into a controlled release candidate.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase10
```

Phase 10 is complete when Phases 0-9 still pass, all seven Phase 0 release blockers close, the conveyancer capability checklist is fully ready, optional inbound signals remain optional, unsafe boundaries block release, broken Phase 4 or Phase 9 gates block release, and audit metadata stays redacted.
