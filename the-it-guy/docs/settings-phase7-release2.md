# Settings Phase 7 — Release 2

Release 2 expands the controlled production cohort after Release 1 has completed cleanly. It remains disabled until the retained Release 1 `GO` report, a fresh schema snapshot, at least 72 hours of monitoring, real settings traffic, a named monitoring source, explicit organisation IDs, workspace coverage, and a second approval are attached.

## Expansion boundary

- Use 6–25 unique organisation IDs. Release 1 organisations may remain in the combined cohort.
- Cover at least two supported workspace types.
- Observe at least 20 settings writes across a minimum 72-hour window.
- Require at least 99.5% save success, with zero settings errors, ownership-transfer failures, and critical settings support incidents.
- Do not infer missing metrics as zero. Any missing operational value blocks promotion.

## Required database state

Release 2 adds no destructive database migration. The three Settings governance migrations from Release 1 must remain present and the live target must expose the governed job-title, role, ownership-transfer, and activity interfaces.

Database migrations remain additive and forward-only. A rollback returns access to the Release 1 cohort and redeploys the previous frontend. It must preserve successful settings, membership state, and audit history.

## Evidence file

Run [`scripts/settings-release2-evidence.sql`](../scripts/settings-release2-evidence.sql) read-only against the target project. Save its JSON result, then replace every `null` with evidence from the named monitoring source. The `release1` object must identify the retained Release 1 `GO` result.

Do not put credentials, tokens, customer names, or monitoring exports in the repository. Organisation UUIDs belong only in the local release configuration used by the operator.

## Release command

Update [`config/settings-release-2.json`](../config/settings-release-2.json) with the approved cohort and approval record, then run:

```sh
SETTINGS_RELEASE2_EVIDENCE=<evidence.json> npm run verify:settings-release2
```

The command is read-only. It reruns the Phase 1–6 contracts, verifies the Release 1 contract, checks migration uniqueness, builds the production frontend, and evaluates the expansion evidence. It exits non-zero unless every promotion condition passes.

## Rollback trigger

Immediately stop Release 2 expansion and restore the Release 1 cohort if a governed save regresses, an ownership transfer fails, a critical settings incident is reported, or the production save-success rate falls below 99.5%. Preserve all data and evidence for diagnosis.
