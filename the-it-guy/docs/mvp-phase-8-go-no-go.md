# Phase 8 — pilot go/no-go

Phase 8 does not deploy, unpause creation, or create transactions. It produces one fail-closed decision from local certification, the current pilot-session state, the two-transaction batch control, Phase 7 accepted-offer creation lineage, and fresh staging evidence.

## Run the gate

```bash
node scripts/mvp-pilot-go-no-go.mjs --evidence=path/to/staging-exposure-evidence.json
```

The only passing result is `ready_for_controlled_exposure`. It means a named pilot operator may open one batch of at most two transactions. Any other result is `do_not_expose`; leave `MVP_PILOT_CREATION_PAUSED` enabled and resolve every named blocker.

The Phase 8 gate fails closed when the dry-run report lacks `creationLineage`, includes manual override lineage, has a missing accepted-offer id, is not confirmed, is not audit visible, or carries any lineage issue from the batch audit.

## Before opening the first batch

1. Ensure the evidence was collected from the exact deployed staging release within 24 hours and contains no credentials, PII, or document contents.
2. Obtain an explicit operator go decision. Only then configure both the deployed app and the operator shell with `MVP_PILOT_CREATION_PAUSED=false`.
3. Rerun the Phase 8 command. It must return `ready_for_controlled_exposure` after the session check is open.
4. Open one batch of no more than two real transactions. Run the health/audit and persisted-spine checks for each transaction, then close the batch with the batch audit.

Changing the environment flag is an operational decision, not an action performed by this command. If any check fails, restore the pause, preserve the evidence, and do not retry a conversion blindly.
