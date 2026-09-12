# Phase 2 — authoritative scenario profile

Status: partial implementation, not release approval.

The shared routing resolver and Matter Profile editor now use the same prepopulation adapter. Explicit buyer/seller participant records supply identities and available legal type, marital capacity, ownership share and representatives. Removed participants and developer contacts are not silently treated as legal parties. Transaction buyer/seller names provide fallback labels. Multiple parties do not inherit a single aggregate entity classification. Saved attorney facts take precedence on subsequent reads.

The editor displays a before/after summary of party changes and the affected review areas. Existing records and work history are not deleted by removing a party from the scenario. Existing profile saving and scenario fingerprint invalidation remain in place.

Verification: 11 focused scenario/profile tests pass; helper lint and workspace JSX parsing pass. These are not live persistence, permissions or browser tests.

Outstanding before Phase 2 is complete:

- Reconcile onboarding submissions and later party-source changes explicitly, with conflict resolution rather than silent overwrite.
- Validate every consuming screen uses the saved profile; do not equate sharing a resolver with verified cross-role parity.
- Verify save, reload, permissions and change explanations through designated staging sessions.
- Complete the Phase 1 SQL/application tax catalogue parity and live baseline checks.

No deployment or database migration was performed in this restart phase.
