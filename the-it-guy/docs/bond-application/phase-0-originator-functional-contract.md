# Phase 0: Bond originator functional contract

## Outcome

Phase 0 locks the acceptance boundary for the buyer-to-originator bond application flow. It does not certify the current implementation as production-complete.

The contract is executable in `src/modules/bond/application/assurance/bondOriginatorFunctionalContract.js` and covers 54 baseline scenarios:

- applicant structure: sole, joint, and surety-assisted;
- purchaser type: individual, company, and trust; and
- income type: permanent, contract, self-employed, commission, retired, and other.

## Product claim

The supported claim is a versioned South African baseline with versioned originator overlays. We must not claim that one hard-coded checklist is accepted by every originator or lender. Each originator deviation needs named ownership, an effective date, a version, and acceptance fixtures.

## Locked guarantees

1. Deterministic interpretation with source lineage and explicit unsupported-value blockers.
2. Versioned originator requirement profiles layered on a South African baseline.
3. Idempotent document reconciliation that reuses evidence and retains history.
4. Complete participant and juristic-entity representation.
5. One canonical document model across buyer, originator, and submission surfaces.
6. A submission gate for answers, participants, documents, declarations, and stale reviews.
7. A downloadable application pack carrying the assigned originator name and logo.
8. Fixture-based acceptance across representative South African originators.
9. Authenticated browser and live-shaped data certification before promotion.

## Known production blockers

- Co-applicant employer and gross-income capture are incomplete.
- Company director, shareholding, and resolution capture are incomplete.
- Trust trustee, letters-of-authority, and trust-deed capture are incomplete.
- The guided surety path still falls back instead of completing end to end.

These are contract blockers, not optional enhancements. Production certification remains blocked until the later phase audits prove them complete.

## Data safety

Phase 0 performs no Supabase schema changes and no live writes. Later document reconciliation must preserve uploaded files, disable obsolete managed requirements instead of deleting them, and keep enough version metadata to reproduce why a requirement existed.

## Verification

Run:

```bash
npm run test:bond-originator-functional-contract-phase0
```

The test locks the dimensions against the live flow constants, verifies all 54 scenario keys are unique, requires every guarantee to have acceptance criteria and an implementation phase, and rejects unsafe scope or production-certification claims.
