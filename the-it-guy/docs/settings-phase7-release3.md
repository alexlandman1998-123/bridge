# Settings Phase 7 — Release 3

Release 3 is the general-availability gate for the functional Settings experience. It remains disabled until Release 2 has completed cleanly and a named operator attaches seven days of representative production evidence, operational ownership, support readiness, release communications, and final approval.

## General-availability boundary

- Target 100% of supported organisations explicitly; partial or cohort modes do not qualify as Release 3.
- Include production observations for agency, developer company, attorney firm, and bond originator workspaces.
- Observe at least 100 settings writes across a minimum 168-hour Release 2 window.
- Require at least 99.9% save success and 100% activity-event coverage.
- Require zero settings errors, ownership-transfer failures, critical support incidents, and open settings incidents.
- Assign a release manager, engineering owner, and support owner.
- Attach the support runbook, release notes, ready communications status, and final named approval.
- Treat every missing metric as a blocker, never as zero.

## Database and rollback rules

Release 3 adds no destructive database migration. The Settings governance migrations from Release 1 must remain installed and the target schema must still expose all governed Settings and activity interfaces.

Rollback returns access to the Release 2 cohort and redeploys the previous frontend. Database migrations remain forward-only. Never delete saved settings, membership state, or audit evidence during rollback.

## Evidence and release command

Run [`scripts/settings-release3-evidence.sql`](../scripts/settings-release3-evidence.sql) read-only against the target project. Save the JSON result and replace every `null` using the named production monitoring source. The `release2` object must identify the retained Release 2 `GO` result.

Do not commit production evidence, customer data, credentials, or tokens. Update the local [`config/settings-release-3.json`](../config/settings-release-3.json) with operational owners, references, approval, and `enabled: true`, then run:

```sh
SETTINGS_RELEASE3_EVIDENCE=<evidence.json> npm run verify:settings-release3
```

The command is read-only. It reruns the Phase 1–6 contracts, both earlier release contracts, migration-integrity checks, the production build, and the general-availability evidence evaluation. It exits non-zero unless every condition passes.

## Rollback triggers

Return immediately to the Release 2 cohort if any governed Settings save regresses, an ownership transfer fails, an activity event is missing, a critical settings incident opens, or production save success falls below 99.9%. Preserve the failed request context and audit history for diagnosis.
