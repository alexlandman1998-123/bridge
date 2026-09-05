# Document trust — Phase 5 controlled bond-originator pilot

Phase 5 adds a document-trust preflight to the existing one-originator pilot controls. It remains disabled until `VITE_DOCUMENT_TRUST_PHASE5_BOND_PILOT_ENABLED=true` is set.

## Preconditions

- The existing R1 internal readiness report is ready.
- Exactly one named originator is selected, with a small bounded set of ready originator-intake packages.
- Every document supplied as pilot handoff evidence has both a document ID and an exact canonical requirement-instance ID.
- The Phase 4 buyer canonical read fence has been enabled and verified.
- Support and rollback owners are named.

## Safety boundary

The implementation calls the existing one-originator start/pause RPCs only after preflight succeeds. The pilot is manual/download-only: it does not create bank applications, submit to banks, deliver to lenders, mutate bank workflow, or expose document URLs or payload bodies.

## Verification

```sh
npm run test:document-trust-phase5
npx vitest run src/services/__tests__/documentTrustBondPilotService.test.js
```

Before any live start, run the preflight against a staging package set, verify the phase-four buyer fence, and test the pause action. No pilot is started by this implementation.
