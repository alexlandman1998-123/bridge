# Phase 4: Participant and entity completeness

Phase 4 adds a deterministic, submission-blocking completeness contract for joint applications, sureties, companies, and trusts.

## Guarantees

- Joint applications require co-applicant identity, contact, employment, and income data.
- Surety applications require at least one surety with identity, contact, employment, and income data.
- Company purchasers require directors, director identity references, ownership, an authorised signatory, and a borrowing resolution.
- Trust purchasers require trustees, trustee identity references, an authorised signatory, Letters of Authority, a trust deed, and a borrowing resolution.
- Existing onboarding and legacy bond application values map into the normalized entity model and round-trip without removing unknown fields.
- Entity data persists in the existing `buyer_entity` shared JSON section. Participant data persists in existing participant JSON sections, so Phase 4 introduces no duplicate table or migration.

The audit is attached as `applicationState.participantEntityCompleteness` by `buildBondApplicationState`. Submission readiness consumes its blockers and fails closed with field-specific paths.

Run `npm run test:bond-originator-participant-entity-phase4`.
