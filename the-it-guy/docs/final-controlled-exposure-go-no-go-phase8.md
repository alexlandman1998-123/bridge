# Final Controlled Exposure Go/No-Go - Phase 8

Phase 8 is the final read-only release decision for the first controlled
transaction exposure. It does not deploy, unpause creation, or create
transactions. It combines release certification, pilot-session state,
two-transaction dry-run evidence, Phase 7 accepted-offer creation lineage, and
fresh staging exposure evidence into one fail-closed decision.

## Passing Decision

The only passing decision is `ready_for_controlled_exposure`.

It requires:

- `mvp-release-certification.mjs` passes.
- `mvp-pilot-session-check.mjs` returns `go_for_controlled_pilot`.
- `mvp-pilot-batch-dry-run.mjs` passes with a batch size no greater than 2.
- The dry-run report includes `creationLineage` for every transaction.
- Every lineage row is `accepted_offer`, has an accepted-offer id, is
  confirmed, is audit visible, and has no lineage issues.
- Staging exposure evidence returns `ready_for_controlled_exposure`.
- The evidence path is explicitly supplied by the operator.

## Blocking Decision

Any missing or failed input returns `do_not_expose`.

Lineage-specific blockers include:

- `pilot_batch_lineage_missing`
- `pilot_batch_manual_override_lineage`
- `pilot_batch_lineage_not_accepted_offer`
- `pilot_batch_accepted_offer_id_missing`
- `pilot_batch_lineage_unconfirmed`
- `pilot_batch_lineage_not_audit_visible`
- `pilot_batch_lineage_issues_present`

When any blocker appears, keep pilot creation paused, preserve the evidence, and
rerun the upstream check that produced the blocker. A manual override may remain
auditable for exceptional internal recovery, but it is not a passing pilot
creation path.
