# Phase 36 — Repair the Phase 28 CI Test

## Outcome

**Status: PHASE28_CI_DEPENDENCY_CONTRACT_REPAIRED**

The Phase 28 failure was an infrastructure error, not a pilot-record discrepancy. Its test expected the operator's documented fail-closed exit code `2`, but a clean GitHub runner exited `1` before reaching the guard because the operator imported Supabase directly from an uninstalled nested `the-it-guy/node_modules` path.

Phase 36 changes the operator to use the root package dependency and makes the Phase 28 workflow run `npm ci --ignore-scripts` before verification. The test now distinguishes a normal blocked pilot result from a module-loading crash by checking the process signal, stderr, exit code, blocker codes, and no-mutation result.

The dedicated Phase 36 gate repeats this contract in a clean GitHub runner. No pilot cohort, production record, database object, deployment, or environment variable is changed.
