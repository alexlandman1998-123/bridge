# Attorney coordination Phase 7 — controlled pilot

Phase 7 is implemented as a validation-only release boundary. It does not deploy code, apply migrations, modify feature flags or activate organisations.

The gate accepts only an intact `PASSED` Phase 6 report and its exact staging evidence. A named release owner must then authorise the tested code revision, exact ordered Phase 3–4 migrations, a distinct production project, one pilot organisation, a named feature flag and a verified kill switch using the exact confirmation `AUTHORIZE_ATTORNEY_COORDINATION_PILOT`.

After a separately operated deployment, the receipt must prove the same target, revision, migration set, feature flag and cohort; successful smoke evidence for transfer, bond and cancellation attorneys; propagation to the attorney workspace, transaction sync and Televent updates; monitoring evidence; and zero security, visibility, permission, propagation, attribution and runtime incidents. Any identity or scope drift, or a non-zero safety counter, returns `ROLLBACK`.

Run `npm run check:attorney-coordination-phase7`. With the current blocked Phase 6 report it must return `BLOCKED`; Phase 7 cannot bypass missing staging execution.
