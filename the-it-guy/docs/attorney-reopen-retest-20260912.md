# Attorney transfer reopen retest — 12 September 2026

Outcome: **targeted functional PASS on the second attempt; release remains HOLD**.

Staging only: `vaszuxjeoajeuhlcnzzf`, sixth fixture
`80b452c8-3d5f-4597-9da7-0cdef47540e1`. Production unchanged.

## Scope and execution

Existing isolated staging build `dist-staging-backpressure-permissions`, served on
localhost:4180. The prior turn's permission migration was already applied to staging.
The browser CLI was unavailable; the existing real Playwright harness was used.
The preview sign-in page loaded without runtime errors before testing.

Added the restricted `--retest-attorney-reopen` harness mode. It requires the sixth
fixture and browser verification, skips note-posting and all bond/cancellation mutations,
and changes only the first transfer task from completed to not_started using the
authenticated `bridge_update_attorney_workflow_step_v4` command. It does not test
clicking the Reopen button itself.

Command (from the isolated app directory):

```sh
caffeinate -i node scripts/provision-journey-staging-access.mjs --apply --matter=80b452c8-3d5f-4597-9da7-0cdef47540e1 --retest-attorney-reopen --browser
```

## First attempt

Stopped before any task mutation: professional journey reader returned 22023,
`Matter plan requires reconciliation.` Subsequent read-only SQL found an active plan
and no missing catalogue entries. Both authenticated SQL and a fresh authenticated
HTTP read then succeeded at revision 72. No reconciliation or schema repair was
applied. The cause of the first error is not established; do not call it resolved.

## Second attempt

- Reopen committed at revision 73; direct saved step and all five fresh journey
  reads agreed on `not_started`.
- Attorney browser loaded the persisted reopened journey and rendered the Work
  tab/stage navigation: PASS (51,445 ms total check; workflow load 45,426 ms).
- Agent, developer, buyer and seller fresh browser views displayed the reopened
  task status: PASS. Their total checks took 42,111 / 53,863 / 19,838 / 2,200 ms.
- No browser runtime assertion failed. The successful run recorded zero 57014
  statement timeouts, but 40 slow HTTP responses and six failed HTTP responses.
- This focused mode loads each role's page fresh after reopening. It does not
  reproduce the full earlier completed → N/A → reopen sequence with every browser
  already open. Do not combine historical passes into a claimed uninterrupted 15/15 run.

Evidence: `test-results/conveyancing-backpressure-acceptance.json` now corresponds
to this targeted run, replacing the previous transport-experiment report.

## Restoration

Cleanup restored task `9b086985-57f8-45b1-a929-30dd62bfcb0a` to `completed`, null comment,
and internal visibility. Every original lane-history row compared exactly unchanged;
new test/restore audit entries were retained. Independent database read confirmed the
restored fields after the process exited successfully. No invitations or test messages
were sent. Test browsers and both preview server instances were stopped.

## Still open

- Approximately 45 seconds to load attorney Work is not acceptable loading performance.
- The initial intermittent reconciliation error remains unexplained.
- Existing missing closing-document objects (`NoSuchKey`), buyer requirement access
  (42501), and seller financial-account RPC (P0001) still appear in network logs.
- The separately identified empty-email permission edge case and full bond/cancellation
  cross-role acceptance remain release gates. This result does not clear them.

Checks on the harness changes: Node syntax check and `git diff --check` pass.
