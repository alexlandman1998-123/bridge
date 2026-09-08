# Phase 6 — verification and release readiness

## Implementation

Run `node scripts/verify-high-level-journey-phase6.mjs` from the application folder.
It runs twelve local acceptance suites and a production build, then evaluates the
release gate. Exit code 1 means not release-ready, including when local checks pass
but live staging evidence is missing. It does not deploy or modify a database.

Supply `--evidence /absolute/path/staging.json` only with real operator-attested
staging evidence following `shared-journey-release-gate.mjs`. Synthetic gate-test
fixtures must never be submitted as live evidence. Candidate digests include actual
source, test, migration and dependency contents, including uncommitted files. Changes
during verification invalidate the local pass.

The additional checks require:

- Active-plan manifest migration applied and verified.
- Authorised OTP/finance outcomes available to all five participant roles.
- Five-milestone summary/detail parity.
- Reopening and applicability changes propagated across roles.
- Missing facts displayed as unknown.

The existing gate additionally requires scenario/lane/outcome transitions, role
reads within 30 seconds, privacy/revocation checks, recovery, comments, migration
history and rollback verification. No production approval is inferred from a pass.

## Read-only staging findings — 8 September 2026

Target verified through the connected project inventory:
Arch9 Staging (`vaszuxjeoajeuhlcnzzf`). Production was not changed.

- Saved staging attorney login succeeded.
- The existing read-only attorney workflow check failed with
  `Shared legal journey is unavailable. Refresh before updating work.`
- Database catalog query returned no `journey_private.read_matter_journey`,
  `public.bridge_read_shared_matter_journey`, or
  `public.bridge_read_seller_shared_matter_journey` functions.
- Migration history contained none of the queried shared-journey versions:
  `20260908144636`, `20260908150256`, `20260908152512`, `20260908153913`,
  `20260908181335`.

These are infrastructure/read-path observations, not successful cross-role workflow
transition evidence. No account reset, task completion, client message or migration
was performed in this pass.

## Release status

### Follow-up remediation

After user authorisation, the four shared-journey prerequisites and two new
manifest/commercial-fact migrations were applied on Arch9 Staging. Their six history
versions were reconciled to the corresponding repository migration versions with
one-row and collision guards. No production migration or deployment was performed.

The attorney Work reader no longer treats an unsaved generated provisional plan
as a saved active plan. The signed-in staging read now passes for transfer, bond
and cancellation. This fixes the observed `The matter plan changed` failure on the
existing demo with no persisted plan; it does not silently confirm missing profile facts.

`shared-commercial-staging-read-check.mjs` verified live attorney and buyer reads,
unauthenticated denial, cross-matter portal denial, and invalid seller-session denial.
It performs no writes and does not log tokens. A valid seller session remains untested.

The real SQL reader migrations also pass isolated PGlite permission-fixture tests:
six routing scenarios, cash/bond/hybrid commercial facts, reopening, private-field
exclusion, and buyer/seller-wrapper parity. PGlite is pinned as a development dependency.
These isolated tests are not substituted for live browser acceptance.

The remaining release blocker is the complete signed-in cross-role browser/transition
evidence, including a valid seller session. A staging session was requested from the user.
The user confirmed that no such session is currently available. Production is held.
Follow-up verification passed all twelve local suites and the production build;
candidate digest `a631649fbcd7a72531bd9b11cbdaa186ed25d1eb1101d3d4c68385bfd41f0ebc`.
The release gate still returns blocked because complete live staging evidence has
not been supplied. No synthetic evidence was recorded as a live pass.

Security check: `anon` and `authenticated` have neither usage of `journey_private`
nor direct execution of its reader. The advisor's four new private-table
[RLS-with-no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
are intentional deny-by-default tables accessed only through authorised wrappers.
The project also reports unrelated security-definer-view and other existing warnings;
this pass does not assert a clean project-wide security audit.

Local acceptance: all eleven suites and the production build passed. The runner
returned exit code 1 because release evidence is missing, not because tests failed.
Candidate source digest:
`f10010ec4652374a5b377fa4a8fa343dcfa194c578033facf600d27d7352fd35`.

Blocked. Before certification:

1. Reconcile the shared-journey prerequisite migrations on staging, review their
   dependencies and execute the manifest migration there.
2. Close the Phase 5 seller/token commercial-facts gap through an authorised,
   recipient-safe read path; do not widen table access or infer completed states.
3. Run signed-in attorney/agent/developer/buyer/seller transitions against the same
   candidate, including reopening, applicability and reconnect; capture real evidence.
4. Rerun the release gate with that evidence, then request production deployment.
