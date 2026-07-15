# Conveyancer Phase E3 — Shared professional timeline

## Outcome

E3 turns the E2 dependency graph and current E1 records into one read-only professional timeline shared by the verified transfer, bond and cancellation firms on a matter.

It provides two complementary views:

- a dependency view ordered by E2's topological sequence; and
- a chronological lifecycle containing planning, request, acknowledgement, submission, blockage and decision entries.

E3 does not create or advance a coordination record. A draft displayed as `planned` or `ready_to_request` is not an instruction or an active obligation.

## Professional access

The timeline is available only when the viewer:

- has a professional conveyancing role;
- belongs to a lane required by E2;
- supplies a user identity; and
- belongs to the exact firm bound to that lane in E2.

Transfer, bond and cancellation attorneys inherit their lane from their role. Firm managers, secretaries and accounts staff must supply an explicit lane. Clients and professionals from another firm receive no timeline payload.

Professional-shared and client-visible E1 entries are visible to verified matter professionals. Internal entries remain limited to the source firm.

## Dependency states

E3 derives, without mutation:

- `waiting_role` when the appointed target firm is not active;
- `awaiting_prerequisite` when a milestone or earlier coordination hand-off is outstanding;
- `ready_to_request` when a draft's prerequisites are satisfied;
- `waiting_acknowledgement` after a request;
- `in_progress` after acknowledgement;
- `ready_for_review` after submission;
- `changes_requested`, `blocked`, `accepted`, `cancelled` or `superseded` from E1; and
- acknowledgement or delivery overdue flags from the E1 SLA and the projection time.

Health prioritises explicit blockage, then overdue work, then items requiring action, then work in progress.

## Evidence provenance

Milestone readiness must come from a unique, known milestone with:

- an accepted completion status;
- a timestamp no later than the timeline projection time; and
- an external reference ID.

Supplied legal-role states must use a canonical coordination state, match the exact E2 firm and carry a valid update timestamp. Future-dated role, milestone or E1 lifecycle evidence is rejected.

Timeline evidence exposes only requirement keys, statuses and reference IDs. It does not copy document bodies, financial values, evidence hashes or private party data.

## Lane-relative responsibility

The timeline may indicate whether the viewer is the source, target or an observer, and whether the next responsibility is to request, deliver or review. These are explanatory read-model fields—not executable permissions. E1 remains the authority source for future commands.

## Integrity

E3 validates:

- the complete E2 model and fingerprint;
- exact E1 definition, plan, transaction and organisation binding;
- unique supplied coordination records with no orphan records;
- deterministic topological item order;
- chronological lifecycle entry order;
- dependency coverage; and
- a fingerprint over the entire viewer-specific projection.

## Side-effect boundary

E3 does not:

- send requests, reminders or notifications;
- modify E1 records or another firm's workflow;
- accept evidence or deliverables;
- write timeline entries to the database; or
- publish client updates.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e3
```

The suite covers cash and hybrid projections, deterministic order, full lifecycle history, lane-relative responsibility, role and milestone readiness, provenance, overdue and blocked health, firm access, duplicate/orphan/tampered records, redaction, future evidence, projection binding and side-effect controls.

## Database boundary

E3 requires no migration. It is an in-memory projection over E1 and E2 evidence; persistence and live UI integration remain later-phase work.
