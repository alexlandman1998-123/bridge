# Attorney matter numbering — Phase 7 rollout gate

Phase 7 is a read-only operational gate for the editable firm matter-number system. It does not generate, rename, confirm, backfill, or delete matter references.

## Deployment order

1. Apply the matter-numbering migrations in timestamp order through `202607170010_attorney_matter_numbering_phase7_rollout_readiness.sql`.
2. Run the Phase 4–7 contract tests and the production build.
3. Set `ATTORNEY_FIRM_ID` to the firm being certified.
4. Run the report without strict mode and resolve every reported blocker.
5. Run the strict gate before releasing the application changes.

```sh
npm run report:attorney-matter-numbering-readiness
npm run verify:attorney-matter-numbering-readiness
```

The report always includes `mutatedData: false`. The strict command exits unsuccessfully unless the status is exactly `READY`.

## Statuses

- `READY`: full active-file coverage with no warnings or integrity faults.
- `READY_WITH_WARNINGS`: safe to release, but inactive/orphan file records should be reviewed. Strict certification still fails.
- `NEEDS_BACKFILL`: active assignments are missing matter files or numbered files are missing audit history. Use the controlled Phase 3 backfill workflow; do not patch references manually.
- `BLOCKED`: an effective-reference collision, unresolved platform reference, or invalid confirmation state exists. Do not release until the data is reconciled.

Only service-role operations and firm administrators/directors can execute the readiness RPC. Firm administrators can refresh the same assessment from Attorney Firm Settings → Matter numbering.

## Rollback

Roll back the application release first. The Phase 7 database function is read-only and may remain deployed safely. If it must be removed, revoke execution and drop only `public.get_attorney_matter_numbering_readiness(uuid)`; do not roll back the Phase 1–6 matter-file or reference history data.
