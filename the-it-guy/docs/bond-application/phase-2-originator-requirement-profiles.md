# Phase 2: Originator requirement profiles

## Outcome

Phase 2 introduces a versioned South African baseline and a safe overlay contract for individual bond originators.

Every resolved document requirement now carries:

- the profile-engine version;
- the South African baseline version;
- the originator profile key and version, when certified; and
- a deterministic profile fingerprint.

## Overlay rules

An originator profile may add a new requirement or strengthen an existing baseline requirement. Strengthening includes earlier timing, a larger evidence period, more files, mandatory status, additional matching aliases, and clearer originator wording.

An overlay may not remove a baseline requirement, make it optional, delay it, reduce its evidence period or file count, change its canonical document type, or narrow an existing multi-file requirement. Any such attempt is rejected and the unchanged baseline rule remains active.

## Unknown originators

An assigned originator without a certified profile receives the South African baseline and an explicit certification review task. A transaction can opt into strict mode, in which the missing certified profile blocks submission.

No universal acceptance claim is made until representative originator profiles have passed the Phase 8 acceptance matrix.

## Data safety

This phase changes no Supabase schema and performs no live writes. Profile metadata is attached to runtime requirement objects so Phase 3 can persist stable, idempotent requirement identities safely.

## Verification

```bash
npm run test:bond-originator-requirement-profiles-phase2
```
