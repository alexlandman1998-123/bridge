# Document Request Phase 4: Bond Checklist Activation

Phase 4 connects the granular bond document rule engine to the client-portal checklist and its persisted `transaction_required_documents` projection.

## Behaviour

- The primary applicant is resolved as `purchaser:1` and receives a name-aware label such as `Purchaser 1 (Alex Buyer) — Latest 6 months personal bank statements`.
- Self-employed requirements retain their six-month evidence period and allow one combined file or multiple monthly files.
- Each persisted row keeps both its scoped requirement key and its canonical document type.
- Participant key, role and display name survive persistence and portal refreshes.
- Client responsibility is unchanged. An authorised agent may still upload a client-supplied document on the client’s behalf.
- Existing uploaded evidence is copied to the new participant-scoped row before the old unscoped row is retired.
- Scoped bond rows are recognised as managed requirements, so requirements removed by a changed onboarding answer are disabled without deleting uploaded evidence.

## Compatibility

The richer projection uses the participant columns introduced by the Phase 2 migration. Until that migration is deployed, the API retains its legacy-column fallback so the checklist continues operating without the new metadata.

No additional Phase 4 database migration is required.
