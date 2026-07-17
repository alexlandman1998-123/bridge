# Attorney matter numbering — Phase 8 launch certification

Phase 8 closes the first delivery sequence with aggregate launch telemetry and one hash-addressed release certificate. It does not deploy migrations, change matter numbers, create portal sessions, or expose matter references in certification evidence.

## Release sequence

1. Apply migrations through `202607170011_attorney_matter_numbering_phase8_launch_telemetry.sql` in timestamp order.
2. Set `ATTORNEY_FIRM_ID` for the firm being certified and load the staging service-role environment.
3. Open Attorney Firm Settings → Matter numbering and confirm Phase 7 is `Ready` and Phase 8 telemetry is `Healthy`.
4. Rehearse one provisional generation, confirmation, and filing-reference edit in staging. Confirm the 24-hour aggregate counters move without exposing the reference value.
5. Run the release certificate command.

```sh
npm run verify:attorney-matter-numbering-release
```

The command runs every Phase 4–8 contract, the strict Phase 7 integrity assessment, and the Phase 8 telemetry check. It writes a permission-restricted JSON certificate under `test-results/attorney-matter-numbering-phase8/`. `GO` is emitted only when every contract passes, strict readiness is `READY`, and telemetry is `HEALTHY`.

## Evidence rules

- Certificates contain a one-way firm fingerprint, aggregate counters, gate outcomes, and a SHA-256 certificate ID.
- Certificates contain no firm UUID, matter reference, transaction ID, actor identity, client identity, or portal token.
- Both database telemetry and release certification declare `mutatedData: false`.
- A certificate is evidence of the assessed moment, not permanent approval. Re-run it after migrations, data repair, or configuration changes.

## Rollback and monitoring

If the gate returns `NO_GO`, do not release. If an incident occurs after release, roll back the application first and preserve the certificate. The telemetry RPC is read-only and can remain deployed. Re-run Phase 7 readiness after repair, then create a new Phase 8 certificate; never overwrite or reinterpret the earlier evidence.

For the first 24 hours, review the admin telemetry after each controlled reference edit. Any `BLOCKED` status, duplicate group, invalid state, or unexpected history gap stops the rollout.
