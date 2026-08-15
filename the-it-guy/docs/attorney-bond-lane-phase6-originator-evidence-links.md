# Bond Lane Phase 6 Originator Evidence Links

Phase 6 gives the attorney workflow a read-only evidence map back to the bond originator workspace.

## Evidence Links

The evidence bundle exposes deep links for:

- Application intake.
- Document requests and uploads.
- Bank feedback.
- Offers and buyer decision.
- Grant and signed grant.
- Attorney instruction.
- Registration monitoring activity.

## Runtime Behavior

- Links are generated from the existing bond consultant action registry.
- Attorneys receive navigation-only links into the originator workspace evidence.
- The attorney workflow does not mutate bond originator application, document, bank, offer, grant, or instruction records through these links.
- If no transaction id is available, links remain unavailable rather than guessing a destination.

## Boundaries

- Phase 6 does not create a new permission model.
- Phase 6 does not duplicate bond originator workflow state inside the attorney workflow.
- Phase 6 does not publish bank payloads or grant documents automatically.

## Phase 7 Candidate

Surface the evidence bundle in the attorney handoff panel so bond attorneys can jump directly to application, grant, signed grant, and instruction evidence.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase6.mjs
```
