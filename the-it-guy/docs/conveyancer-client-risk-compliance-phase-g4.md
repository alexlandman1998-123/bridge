# Conveyancer client-risk compliance — G4

G4 adds a configurable FICA and client-risk compliance contract governed by each firm’s approved risk management and compliance programme (RMCP). It explains the client risk rating, due-diligence route, outstanding requirements, holds and authority required before a matter may proceed.

## Delivered

- Versioned firm RMCP policy binding with configurable risk factors, weights, thresholds, review frequency and CDD routes.
- Natural-person, company, close-corporation, trust, partnership and other-entity profiles.
- Reference-only identification records protected as special-personal, financial and restricted information under G2.
- Beneficial-owner and authorised-representative records with evidence provenance.
- Explainable client and transaction risk scoring.
- Simplified, normal and enhanced due-diligence routes controlled by firm policy.
- Party-specific CDD requirements fulfilled only by accepted G3 evidence bound to the same matter and party.
- Identity, address, entity, constitutional, beneficial-ownership, authority, source-of-funds, source-of-wealth, PEP, sanctions and adverse-media evidence types.
- Outstanding CDD requirements and compliance holds.
- Independent compliance review before an assessment can permit progression.
- Periodic and event-driven reassessment through superseding assessments.
- Restricted suspicious-activity escalation with legal hold and prohibited client notification, ordinary reminders and automatic regulatory reporting.
- Redacted compliance audit exports and common G1 audit events.

## Policy boundary

The platform executes the firm’s versioned policy; it does not prescribe one universal risk rating or silently replace the RMCP. Risk signals and screening results remain evidence-backed indicators requiring professional review.

G4 does not determine that a person is sanctioned, politically exposed or suspicious from unreviewed provider or AI output. It does not submit regulatory reports, notify a client of restricted escalation, release a compliance hold or approve its own assessment.

## Evidence and progression boundary

Only independently accepted G3 evidence can satisfy a CDD requirement. A completed assessment remains unable to permit progression until a different authorised compliance reviewer approves it. Open evidence requirements, unresolved restricted indicators, missing beneficial ownership or missing representative authority keep the assessment on hold.

G4 is an executable domain contract. Persistence, screening-provider connections, database RLS, compliance workspace UI and runtime workflow blocking remain separate productisation layers.

Run G1–G4 together:

```sh
npm run test:conveyancer-practice-g4
```

G4 adds no database migration.
