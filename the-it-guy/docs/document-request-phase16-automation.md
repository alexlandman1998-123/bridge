# Document Request Phase 16: Automation

## Status

Phase 16 adds guarded automation for the canonical document request rollout. It can run on demand and is now also used by the Phase 18 scheduled cron path.

Current status: **implemented, dry-run first, scheduled by Phase 18**.

## What It Does

- Runs the existing Phase 15 operational rollout selection and sync logic.
- Defaults to dry-run.
- Requires `--commit --confirm-automation` before it can write.
- Runs a preflight dry-run before any automated commit.
- Blocks automated commit when legacy non-canonical required-document keys are still present, unless `--allow-legacy-keys` is explicitly supplied.
- Produces a machine-readable report for ops, cron, or admin-triggered automation.
- Does not write to `document_requests`.
- Does not expose raw portal or workspace tokens.

## Commands

Dry-run:

```bash
node scripts/document-request-canonical-phase16-automation.mjs
```

Dry-run with explicit outputs:

```bash
node scripts/document-request-canonical-phase16-automation.mjs \
  --limit=10 \
  --output=output/document-request-phase16-automation.json \
  --rollout-output=output/document-request-phase16-operational-rollout.json \
  --portal-output=output/document-request-phase16-portal-verification.json
```

Commit mode:

```bash
node scripts/document-request-canonical-phase16-automation.mjs \
  --commit \
  --confirm-automation
```

Commit mode still runs preflight first and will block if readiness fails.

## Cron-Compatible Endpoint

Endpoint:

```text
/api/cron/document-request-canonical-automation
```

Required header:

```text
Authorization: Bearer $CRON_SECRET
```

Dry-run is the default endpoint behavior.

Writes require:

```text
DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true
```

The legacy-key override is separate and intentionally explicit:

```text
DOCUMENT_REQUEST_CANONICAL_AUTOMATION_ALLOW_LEGACY_KEYS=true
```

## Scheduling

Phase 18 schedules this job in `vercel.json` for the verified pilot cohort:

```json
{
  "path": "/api/cron/document-request-canonical-automation",
  "schedule": "30 1 * * *"
}
```

The scheduled path still defaults to dry-run unless `DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true` is deliberately enabled.

## Readiness Gate

Automation blocks commit when any of these are true:

- Phase 15 rollout gate fails.
- Any rollout transaction fails.
- Existing upload or review rows would be changed.
- Legacy `document_requests` rows would be created or changed.
- Portal verification fails.
- The portal is missing committed canonical keys.
- Legacy non-canonical keys remain and no explicit override was supplied.

## Phase 16 Dry-Run Result Before Phase 17

The Phase 16 dry-run on 2026-08-02 selected the same 10 active buyer-portal transactions used in Phase 15.

Result:

- 10 completed.
- 0 failed.
- 0 warnings.
- 68 canonical rows calculated.
- 0 rows synced because this was dry-run.
- 0 required-document row delta.
- 0 `document_requests` delta.
- 0 preserved upload or review rows changed.
- Portal verification passed.
- 56 legacy non-canonical keys remain.

Automation result:

- `commitEligible: false`
- `readyForScheduledAutomation: false`
- Blocker: `legacy_non_canonical_keys_present`

## Phase 16 Dry-Run Result After Phase 17

After Phase 17 cleaned up the active legacy keys, the Phase 16 dry-run on 2026-08-02 returned:

- 10 completed.
- 0 failed.
- 0 warnings.
- 68 canonical rows calculated.
- 0 rows synced because this was dry-run.
- 0 required-document row delta.
- 0 `document_requests` delta.
- 0 preserved upload or review rows changed.
- Portal verification passed.
- 0 legacy non-canonical keys.
- `commitEligible: true`
- `readyForScheduledAutomation: true`

## Next Step

After at least one clean scheduled dry-run, production can enable `DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true` for automated writes.
