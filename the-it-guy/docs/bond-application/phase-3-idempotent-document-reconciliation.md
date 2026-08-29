# Phase 3: Idempotent document reconciliation

## Outcome

Phase 3 gives every bond application requirement a stable identity based on its scope, participant role, participant key, and base requirement key.

Originator profile versions and interpreted-application fingerprints are stored as provenance. They do not change requirement identity, so a profile update modifies the existing requirement row and retains uploaded evidence.

## Reconciliation guarantees

- Repeating reconciliation with the same inputs produces the same rows and no duplicates.
- Existing upload, verification, rejection, canonical-link, status, and operational-note fields are preserved.
- Duplicate active identities are collapsed and reported as diagnostics.
- Requirements that no longer apply are disabled and marked not required rather than deleted.
- Uploaded evidence attached to an inactive requirement remains attached and visible to history.
- Participant-prefixed requirements are recognized as managed rows and can be deactivated correctly.

## Persistence

The additive migration extends `transaction_required_documents` with identity, participant, baseline, originator-profile, decision, and reconciliation provenance. The existing `transaction_id + document_key` upsert remains the compatibility conflict target. A second partial unique index enforces `transaction_id + requirement_identity` whenever the stable identity is present.

No RLS policy is widened and no existing document or requirement row is deleted.

## Verification

```bash
npm run test:bond-originator-document-reconciliation-phase3
```
