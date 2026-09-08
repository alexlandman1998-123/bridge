# High-level journey — Phase 3 rules

Implemented as a pure, tested rule contract in `highLevelJourneyRules.js`.
Phase 4 now wires this contract into developer Overview through
`highLevelJourneyAdapter.js`. Overview and Conveyancing share the same validated
legal snapshot; other roles retain their existing presentation pending alignment.

| Milestone | Explicit completion evidence |
| --- | --- |
| OTP | `sales_otp.signed_otp_received` completed |
| Finance — cash | Proof of funds reviewed and cash confirmation approved |
| Finance — bond | Quote approved and instruction sent |
| Finance — hybrid | Cash contribution confirmed, quote approved and instruction sent |
| Transfer | Lodgement readiness confirmed for every applicable legal lane |
| Lodged | Actual lodgement confirmed for every applicable legal lane |
| Registered | Registration confirmed for every applicable legal lane |

Transfer means legal preparation/readiness, not registration or administrative close-out.
Guarantees remain detailed legal work, not a sixth overview milestone. The readiness
confirmation preserves attorney discretion: it does not automatically complete documents
or evidence checks. This is a product workflow contract, not legal certification.

States are `unknown`, `pending`, `in_progress`, `waiting`, `blocked`, and `complete`.
Unknown takes precedence when required source facts are missing, duplicated or unsupported.
Otherwise blockers take precedence, then full completion, waiting, partial progress and pending.
Externally completed confirmations count; N/A cannot prove an actual signature, funding,
lodgement or registration and therefore requires clarification for these milestone confirmations.
Unrequired legal lanes are excluded using the resolved plan, not inferred from rows present.
Individual/company/marital variants affect that detailed plan, not the five overview labels.

No stage position, future date, transaction value, upload alone, later milestone or overall
percentage implies earlier completion. Reopening a source removes its milestone completion.
Cancellation/archival does not invent completed work. No overall percentage is fabricated.

Phase 4 integration:

- Pass validated workflow facts; mark legacy-derived or unavailable facts unavailable.
- Pass current finance type and the required lane keys from the resolved active plan.
- Use the authorised shared reader for legal outcomes; reject mismatched matter IDs,
  inconsistent snapshot/task revisions, and task sets that differ from the active plan.
- Preserve unknown states through presentation (do not use the old index-based normalizer).
- Use one evaluated snapshot for summary and details; make no duplicate database writes.

Test: `node scripts/high-level-journey-rules.test.mjs`.
Integration and reopening parity: `node scripts/high-level-journey-integration.test.mjs`.
These are automated local checks, not live cross-role or production verification.
