# Document Generator Launch Gate Phase 6

Implemented on 2026-07-11.

## Goal

Add a single launch-readiness gate for the OTP and Mandate document generator paths. The gate verifies that generated and signed packet artifacts are saved, linked to canonical requirements, projected back to legacy transaction requirements, and fetched through the shared canonical verification snapshot without crossing the performance budget.

## What The Gate Checks

- Generated Mandate
- Signed Mandate
- Generated OTP
- Signed OTP

For each document, the gate verifies:

- exactly one canonical requirement exists for the pilot transaction
- the canonical requirement is completed
- the requirement links to a packet and packet version
- the packet and version link back to the canonical requirement
- the generated version has a saved preview file path or URL
- signed documents have a final signed artifact reference
- `transaction_required_documents` has the expected accepted/uploaded legacy projection

## Performance Guard

`verify:document-generator-launch` measures the canonical verification snapshot read and fails when it exceeds `DOCUMENT_GENERATOR_LAUNCH_SNAPSHOT_BUDGET_MS`.

Default budget: `12000ms`.

## Commands

- `npm run test:document-generator-launch-gate`
- `npm run verify:document-generator-launch`
- `npm run cleanup:document-generator-fixture-links`

## Configuration

- `DOCUMENT_GENERATOR_LAUNCH_TRANSACTION_ID`: override the pilot transaction id.
- `DOCUMENT_GENERATOR_LAUNCH_SNAPSHOT_BUDGET_MS`: override the snapshot budget.
- `DOCUMENT_GENERATOR_REQUIRE_DOCUMENT_RECORD=true`: make missing `rendered_document_id` a blocking issue.

## Notes

The default gate still treats missing `rendered_document_id` as a warning unless `DOCUMENT_GENERATOR_REQUIRE_DOCUMENT_RECORD=true` is set, because live generation already enforces linked document records at runtime. The staging pilot fixture has now been cleaned so generated packet versions link to `documents` rows and the normal launch gate reports `warningCount: 0`.

`cleanup:document-generator-fixture-links` is guarded by dry-run defaults. Write mode requires:

```bash
DOCUMENT_GENERATOR_FIXTURE_DOCUMENT_LINK_WRITE=true npm run cleanup:document-generator-fixture-links -- --write --confirm-staging
```
