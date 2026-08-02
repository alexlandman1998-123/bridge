# Document Request Phase 18: Scheduled Activation

## Status

Phase 18 enables the scheduled document-request automation path.

Current status: **scheduled for the verified pilot cohort, dry-run by default**.

## Schedule

`vercel.json` now schedules:

```json
{
  "path": "/api/cron/document-request-canonical-automation",
  "schedule": "30 1 * * *"
}
```

This runs daily at 01:30 UTC, which is 03:30 in South Africa.

## Safety Model

The cron endpoint remains protected by:

```text
Authorization: Bearer $CRON_SECRET
```

The scheduled job still defaults to dry-run. It will not write unless the production environment explicitly sets:

```text
DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true
```

The legacy-key override remains separate and should stay unset:

```text
DOCUMENT_REQUEST_CANONICAL_AUTOMATION_ALLOW_LEGACY_KEYS=true
```

The scheduled endpoint defaults to the 10-transaction pilot cohort verified in Phases 15-17. A wider cohort can be supplied later with:

```text
DOCUMENT_REQUEST_CANONICAL_AUTOMATION_TRANSACTION_IDS=id1,id2,id3
```

Do not remove the pilot cohort restriction until the wider non-canonical document mapping is complete.

## Current Readiness Evidence

Phase 17 removed the active legacy-key blocker. The refreshed Phase 16 report shows:

- 10/10 transactions completed.
- 0 failures.
- 0 warnings.
- 68 canonical rows calculated.
- 0 required-document row delta.
- 0 `document_requests` delta.
- 0 preserved upload or review rows changed.
- 0 portal verification failures.
- 0 missing committed portal keys.
- 0 legacy non-canonical keys.
- `commitEligible: true`
- `readyForScheduledAutomation: true`

## Activation Notes

The scheduled endpoint will report `schedulingEnabled: true` when invoked through the cron path.

Recommended first production posture:

- Keep `DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT` unset for at least one scheduled dry-run.
- Review cron logs and the sanitized response summary.
- Enable `DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true` only after the scheduled dry-run remains clean.

## Wider Scope Finding

A Phase 18 wider dry-run over 25 active portal-access transactions found additional non-canonical zero-state rows outside the pilot cohort.

Result:

- 25 transactions checked.
- 25 completed.
- 0 failed.
- 0 warnings.
- 164 canonical rows calculated.
- 89 active non-canonical rows found outside the cleaned pilot scope.
- 89 were zero-state cleanup candidates.
- No wider cleanup commit was run in Phase 18.

Those rows include keys such as:

- `bank_statements`
- `bond_grant`
- `payslips`
- `proof_of_income`
- `reservation_deposit_proof`

These should be mapped to canonical keys or explicitly classified before wider scheduled rollout. Phase 18 therefore schedules the verified pilot cohort only.

## Scheduled Pilot Evidence

The Phase 18 scheduled activation evidence run used the same path and schedule marker as the cron endpoint.

Result:

- `schedulingEnabled: true`
- Explicit pilot cohort: 10 transactions.
- 10 completed.
- 0 failed.
- 0 warnings.
- 68 canonical rows calculated.
- 0 rows synced because this was dry-run.
- 0 required-document row delta.
- 0 `document_requests` delta.
- 0 preserved upload or review rows changed.
- 0 portal verification failures.
- 0 missing committed portal keys.
- 0 legacy non-canonical keys.
- `commitEligible: true`
- `readyForScheduledAutomation: true`
