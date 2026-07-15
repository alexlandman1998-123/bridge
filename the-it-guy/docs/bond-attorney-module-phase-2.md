# Bond attorney module - Phase 2 canonical data contract

Phase 2 introduces the canonical bond matter data contract. It does not add persistence, migrations, bank integrations, document generation or a Bond Pack Workspace.

The executable source is `src/core/transactions/bondAttorneyModulePhase2.js`.

## What changed

- Added canonical fact definitions for every Phase 0 bond data-contract key.
- Each fact resolves from explicit source paths only.
- Missing facts remain missing; the resolver does not infer or guess.
- Every resolved fact carries source path, source type, source id, capture date, verification date, verifier and expiry metadata.
- Facts can be `missing`, `unverified`, `verified`, `stale` or `conflict`.
- The contract emits a per-fact fingerprint and an overall data fingerprint.
- Draft invalidation now has a deterministic rule: if a bound fact fingerprint changes, the draft is invalidated.

## Canonical fact groups

- Bank: bank name, bank reference, approved bond amount.
- Parties: mortgagor, mortgagee, buyer marital or entity authority.
- Property: legal description, title deed or Deeds Office reference.
- Conditions: bank conditions.
- Guarantees: guarantee values and expiry.
- Signing: signing method and signed pack status.
- Lodgement: bank submission, approval to lodge and lodgement references.
- Registration: registration date.

## Phase 2 boundary

This phase intentionally does not:

- Store canonical facts in the database.
- Extract facts automatically from PDFs.
- Render a Bond Pack Workspace.
- Generate documents.
- Treat unverified data as draft-safe.
- Auto-progress lodgement or registration from external references.

Those are later phases. Phase 2 is the truth layer they depend on.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase2
```

Phase 2 is complete when Phase 0 and Phase 1 still pass, every Phase 0 data-contract key has a Phase 2 canonical fact definition, missing facts stay missing, conflicts/stale evidence are detected, and changed source facts invalidate bound drafts.
