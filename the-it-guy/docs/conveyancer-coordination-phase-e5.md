# Conveyancer Phase E5 — Simultaneous lodgement readiness

## Outcome

E5 replaces stage-only assumptions with one integrity-checked, read-only decision about whether every required conveyancing lane can safely lodge on the same proposed date.

It separates two questions:

- **Local readiness:** has each appointed firm certified its own signed pack, authority and lodgement pack?
- **Joint readiness:** are all local certifications accepted through E1, are E4 guarantees still valid for the proposed date, and are there no cross-lane blockers?

Transfer remains the coordinating lane. Bond and cancellation firms certify only their own packs and cannot mark the overall matter—or another firm—ready.

## Lane-owned attestations

Each immutable readiness attestation is bound to the E2 model, matter, plan, lane and exact appointed firm. It records a lane-owned readiness reference, evidence checks, the attesting legal actor, an attestation time and a fingerprint.

Mandatory checks are deterministic:

- **Transfer:** accepted signed pack, transfer-duty compliance, rates clearance and complete lodgement pack.
- **Bond:** accepted signed pack, bank approval to lodge and complete bond lodgement pack.
- **Cancellation:** accepted signed pack, existing-bank cancellation authority and complete cancellation lodgement pack.
- **Sectional title:** levy clearance is added to the transfer checks.

Satisfied checks require an opaque evidence reference, SHA-256 evidence hash and verification time. Expiring clearances require a validity date. Failed checks require a reason and prevent a `ready` attestation.

Secretaries and accounts users may help prepare work elsewhere, but cannot make the E5 legal readiness attestation.

## E1 and E4 binding

For bond and cancellation lanes, a local attestation is not enough. Its readiness reference must be the exact approved evidence on the applicable E1 record:

- `bond_lodgement_readiness`; or
- `cancellation_lodgement_readiness`.

The E1 handoff must be accepted. If a bond firm is locally ready while the transfer-led E1 request remains a draft, bond sees that it is waiting on transfer; it is not invited to mutate transfer-owned work.

The supplied E4 guarantee workspace must:

- validate against the same E2 model;
- belong to the same viewer and projection time;
- use the same proposed lodgement date when guarantees apply; and
- be ready, or be correctly marked `not_applicable` for a transfer-only cash matter.

## Time and expiry control

The proposed lodgement time must be after the projection time. E5 rejects future-dated attestations and E1 lifecycle evidence.

Evidence expiring before lodgement is a blocker. Evidence valid at lodgement but expiring inside the configurable post-lodgement buffer is exposed as an advisory risk without falsifying the joint-ready result.

## Decision states

E5 returns:

- `ready` when guarantees and every required lane are jointly ready;
- `action_required` when the current viewer's lane owns an outstanding blocker;
- `waiting` when another lane owns the next step; or
- `blocked` for explicit failure, expiry or blocked coordination.

`viewerResponsibilities` is explanatory. It is not a task command or permission grant.

## Access, integrity and privacy

E5 reuses E3's exact matter-professional access boundary. Clients, outsiders and users from the wrong firm receive no readiness payload.

Validation covers exact lane coverage, attestation authority, mandatory checks, E1 evidence binding, future evidence, E4 projection binding, derived lane and joint decisions, viewer-relative responsibilities and fingerprints.

The projection carries opaque hashes and references rather than document bodies, bank-account details or party identity values.

## Side-effect boundary

E5 does not lodge at the deeds office, submit a bank pack, accept an E1 record, create a task, send a notification, persist readiness, mutate evidence or move a workflow stage. `jointReady` is an advisory precondition for a later controlled lodgement command.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e5
```

The suite covers lane-owned attestations, transfer-only cash, bond and three-firm hybrid matters, exact E1 evidence binding, missing lanes, expired evidence, validity-buffer risk, pending coordination, sectional-title levy clearance, wrong-lane authority, stale E4 projections, access denial, invalid windows, tampering and side-effect controls.

## Database boundary

E5 requires no migration. It is an in-memory readiness and attestation contract. Durable attestation storage, UI integration and the actual lodgement command remain later-phase work.
