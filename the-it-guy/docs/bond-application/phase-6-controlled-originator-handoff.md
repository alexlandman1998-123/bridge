# Phase 6: Controlled originator handoff

Phase 6 binds the Phase 5 application pack to the finalized submitted snapshot and prepares one controlled manual handoff package for the selected bond originator.

## Guarantees

- Only a Phase 5 `originator_ready` pack can enter the handoff path.
- The exact recipient ID and name are required.
- The submitted snapshot hash, application revision, submission ID, recipient, and pack fingerprint form the idempotency identity.
- Repeating the same request returns the same package instead of creating a duplicate.
- A changed snapshot, revision, recipient, or pack cannot replace an active package silently; explicit supersession is required.
- Acceptance produces an immutable, idempotent receipt without sensitive payload data.
- Phase 6 performs no network delivery, automatic bank submission, or bank workflow mutation.

Phase 6 reuses the existing canonical export and originator-intake package contracts. No database migration or new transport integration is introduced.

Run `npm run test:bond-originator-controlled-handoff-phase6`.
