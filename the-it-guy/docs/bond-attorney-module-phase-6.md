# Bond attorney module - Phase 6 signing workspace

Phase 6 closes the Phase 0 blocker `signing_workspace_missing`. It creates a controlled signing workspace for the bond pack, focused on signer readiness, capacity, wet-ink/original requirements and signed-pack evidence.

The executable source is `src/core/transactions/bondAttorneyModulePhase6.js`.

## What changed

- Added a bond signing workspace on top of:
  - Phase 2 canonical signing and mortgagor facts
  - Phase 3 Bond Pack Workspace controls
  - Phase 5 bank-condition readiness
- Added signer contracts with:
  - signer role
  - party role
  - signing capacity
  - signing order
  - selected signing method
  - wet-ink requirement
  - original-document requirement
  - witness / commissioner attestation requirement
  - redacted signer reference hash
- Added evidence contracts for:
  - identity verification
  - signing capacity / authority evidence
  - signed bond pack evidence
  - original wet-ink bond pack receipt
  - witness / commissioner attestation
- Added a checklist model that can drive a secretary/conveyancer signing view.
- Added metrics for:
  - required signer count
  - capacity-ready signer count
  - signed signer count
  - wet-ink signer count
  - missing original count
  - signature-evidence gap count
  - rejected evidence count
- Added redacted audit metadata. The audit event includes fingerprints and counts, not signer payloads, fact values, evidence bodies or document content.

## Signing states

Phase 6 computes workspace status:

- `blocked`
- `prepared`
- `partially_signed`
- `fully_signed`
- `expired`
- `voided`

Each signer also gets a status:

- `blocked`
- `ready_to_sign`
- `partially_signed`
- `signed`

## Controls

Phase 6 enforces these controls in code:

- Phase 5 bank conditions must be ready before the signing workspace can pass its gate.
- The canonical mortgagor/capacity fact must be verified.
- The canonical signing-method/signed-pack fact must be verified.
- Every signer must have a role, capacity, signing method and signer reference hash.
- Every signer must track identity evidence.
- Every signer must track signed bond pack evidence.
- Wet-ink signers must track original signed-pack receipt.
- Wet-ink signers can require witness / commissioner attestation evidence.
- Rejected signing evidence blocks the workspace.

## Phase 6 boundary

This phase intentionally does not:

- generate legal instruments
- create a signing-provider envelope
- capture a live signature
- submit anything to a bank
- treat a signed pack as bank approval
- create or alter Deeds Office evidence

It is a signing-readiness and evidence workspace only.

## Why this helps the bond attorney

The bond team can now see exactly what is missing before a signed bond pack is treated as usable:

- who must sign
- in what capacity
- whether the signer is ready
- whether wet-ink originals are required
- whether originals have been received
- whether witness or commissioner evidence is still missing
- whether the signed pack is safe for the next controlled phase

This removes the very common blind spot where a matter says “signed” but nobody can see whether the original pack, signer authority and evidence chain are actually complete.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase6
```

Phase 6 is complete when Phases 0-5 still pass, signer capacity is tracked, wet-ink originals are tracked, signed-pack evidence gaps produce next actions, open bank conditions block the signing gate, audit metadata stays redacted, and a fully evidenced signed pack can be marked ready for the next controlled phase.
