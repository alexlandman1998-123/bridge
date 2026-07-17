# Attorney firm modules — Phase 8 launch certification

Phase 8 closes the service-module delivery sequence with a read-only readiness gate, aggregate launch telemetry, and a hash-addressed release certificate. It does not activate or deactivate modules, alter matters, accept instructions, or expose tenant records.

## Release sequence

1. Apply migrations through `202607170015_attorney_firm_modules_phase8_launch_telemetry.sql` in timestamp order.
2. Enable the Phase 1–7 module flags in staging and set `VITE_FEATURE_ATTORNEY_MODULE_LAUNCH_TELEMETRY=true`.
3. Open Attorney Firm Settings → Services & Workflows. Confirm Phase 8 telemetry is `Healthy` and the release gate passes.
4. Rehearse one wind-down and reactivation on a staging firm. Confirm aggregate counters move and the immutable Phase 7 history records both transitions.
5. Set `ATTORNEY_FIRM_ID` and run:

```sh
npm run verify:attorney-firm-modules-release
```

The command runs all Phase 1–8 contracts, the live readiness assessment, and the 24-hour telemetry check. It writes a permission-restricted certificate under `test-results/attorney-firm-modules-phase8/`. `GO` is emitted only when all contracts pass, readiness is strictly `READY`, and telemetry is `HEALTHY`.

## Gate interpretation

- `READY` / `HEALTHY`: rollout may proceed.
- `READY_WITH_ACTIONS` / `ATTENTION`: one or more completed wind-downs still require explicit administrator deactivation. Resolve them and rerun certification.
- `BLOCKED`: stop rollout. Repair missing module rows, lifecycle history, enforcement triggers/RPCs, or inactive modules with open matters.

## Evidence and rollback

Certificates contain a one-way firm fingerprint, aggregate counts, gate results, and a SHA-256 certificate ID. They contain no firm UUID, matter ID, transaction ID, client detail, or actor identity. Both database reports and certificates declare `mutatedData: false`.

If the release gate returns `NO_GO`, do not enable the production flags. If an incident occurs after launch, disable the frontend flags first; retain the database guards and audit history while investigating. Preserve every certificate as point-in-time evidence and never overwrite or reinterpret an earlier result.
