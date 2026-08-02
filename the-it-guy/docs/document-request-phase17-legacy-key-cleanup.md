# Document Request Phase 17: Legacy Key Cleanup

## Status

Phase 17 removes the final Phase 16 automation blocker by cleaning up active legacy required-document keys.

Current status: **implemented with dry-run default and guarded commit mode**.

## Problem

Phase 16 showed the canonical document request automation is operationally clean, but not ready for scheduling because active legacy keys still appeared in the portal-facing required-document rows.

The repeated legacy keys were:

- `id_document`
- `information_sheet`
- `otp`
- `proof_of_address`
- `proof_of_funds`
- `transfer_documents`

The live inspection showed these rows were all `missing`, had no upload or review state, and were therefore safe to disable rather than delete.

## Cleanup Strategy

Phase 17 does not delete rows.

Eligible legacy rows are updated to:

```json
{
  "is_required": false,
  "enabled": false,
  "status": "not_required",
  "visibility_scope": "internal"
}
```

Rows are skipped if they have any uploaded or reviewed state.

The Phase 14 portal verifier was also tightened so inactive rows no longer count as active non-canonical portal blockers.

## Commands

Dry-run:

```bash
node scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs
```

Commit:

```bash
node scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs \
  --commit \
  --confirm-legacy-cleanup
```

Commit mode runs a Phase 16 postcheck automatically.

## Gate

Phase 17 can only proceed safely when:

- Phase 15 precheck runs cleanly.
- Candidate rows are active non-canonical rows from Phase 14 portal verification.
- Candidate rows have no uploaded, verified, rejected, or review-state evidence.
- No `document_requests` rows are written.
- Postcheck shows Phase 16 has no legacy non-canonical key blocker.

## Expected Outcome

After commit, Phase 16 should report:

- `legacyNonCanonicalKeyCount: 0`
- `commitEligible: true`
- `readyForScheduledAutomation: true`

That is the point where Phase 18 can enable the scheduled cron.

## Committed Result

Phase 17 was committed on 2026-08-02 against the 10 active buyer-portal transactions.

Result:

- 56 active legacy rows were eligible.
- 56 rows were updated.
- 0 rows were skipped.
- 0 updates failed.
- No rows were deleted.
- No `document_requests` rows were written.
- Uploaded and reviewed rows were preserved.

Postcheck:

- Phase 16 completed 10/10 transactions.
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
