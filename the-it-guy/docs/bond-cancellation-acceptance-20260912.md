# Bond and cancellation acceptance — 12 September 2026

Result: **bond and cancellation functional PASS; release remains HOLD for separate gates**.

Staging only (`vaszuxjeoajeuhlcnzzf`), sixth fixture
`80b452c8-3d5f-4597-9da7-0cdef47540e1`. Production unchanged.

## Method and limits

Used the isolated `dist-staging-backpressure-permissions` build on localhost:4180
and real Playwright browsers against staging. No successful responses were mocked.
The preview sign-in page loaded without runtime errors. The agent-browser CLI was
unavailable, so the existing Playwright acceptance harness was used.

Added restricted `--bond-cancellation` mode to the staging harness. Each lane uses
its own appointed UAT attorney as the authenticated mutation actor and attorney browser.
Only the first task of each lane is exercised, not every subprocess or scenario.
Commands use `bridge_update_attorney_workflow_step_v4`; this does **not** test clicking
the outcome buttons. All five role readers are compared after the write, followed by
real browser reloads. Attorney checks verify the returned task status, selected lane
and rendered Work navigation; other roles also assert the rendered task status.
Browsers remain open during each lane's completed → N/A → reopened sequence.

```sh
caffeinate -i node scripts/provision-journey-staging-access.mjs --apply --matter=80b452c8-3d5f-4597-9da7-0cdef47540e1 --bond-cancellation --browser
```

## Results

| Lane / outcome | Attorney | Agent | Developer | Buyer | Seller |
| --- | --- | --- | --- | --- | --- |
| Bond completed | PASS | PASS | PASS | PASS | PASS |
| Bond N/A | PASS | PASS | PASS | PASS | PASS |
| Bond reopened / reload | PASS | PASS | PASS | PASS | PASS |
| Cancellation completed | PASS | PASS | PASS | PASS | PASS |
| Cancellation N/A | PASS | PASS | PASS | PASS | PASS |
| Cancellation reopened / reload | PASS | PASS | PASS | PASS | PASS |

Bond task `bond_instruction_received` persisted the three outcomes at revisions
76, 77 and 78. All five direct journey reads agreed on task and progress outcomes.
Browser evidence: `test-results/bond-acceptance.json` (15/15).

The initial cancellation run exposed a seller-session loss after concurrent timeout
responses. The portal was clearing a stored credential when an auth challenge omitted
an explicit expiry signal, and a stale render could also omit its state-held token.
The fix retains the local seller credential unless the server explicitly returns
`sessionExpired: true`, and falls back to the valid stored token during reload.

The focused rerun used the rebuilt staging client and only the cancellation lane.
It passed completed, N/A and reopened states in all five roles (15/15), including
the previously failing seller reload. Each mutation was also confirmed through five
fresh direct journey reads at revisions 94, 95 and 96. Evidence:
`test-results/cancellation-rerun-20260912.log` and
`test-results/cancellation-acceptance.json`.

Background requests still exposed pre-existing issues: missing legacy closing-document
objects, buyer requirement `42501`, and seller finance-account `P0001`. They did not
prevent the shared journey outcome from rendering, but keep the full-portal release
gate open. Functional passes do not constitute clean full-portal or performance
acceptance.

## Restoration and remaining gate

Both lane cleanup assertions passed: original status/comment restored and every
pre-existing lane-history row unchanged. Test/restore audit entries remain.
Independent post-run SQL confirmed transfer, bond and cancellation instruction
tasks all `completed`, comment null, visibility `internal`. Transfer was not mutated
by this test. No invitations or test conversation messages were sent.
Browsers and preview server were stopped. No schema or application changes were
applied in this turn; changes are restricted to the test harness and evidence.

The bond and cancellation acceptance matrix is complete for the first lane task of
each workflow. It does not test every subprocess, user-visible outcome button click,
or every matter scenario. Slow attorney loading, missing legacy document objects,
buyer requirement access, seller finance RPC errors, missing scenario facts and the
previously recorded empty-email permission edge case remain separate release risks.
