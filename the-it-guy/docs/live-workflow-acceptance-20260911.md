# Live workflow acceptance — 11 September 2026

## Outcome: blocked, not release acceptance

### Reconciliation and mutation follow-up

At the user's request, the five legacy staging manifests were reconciled using the guarded `reconcile-staging-matter-manifest.mjs --matter=<id> --apply` command. Each inserted 12 current task rows and retained 27 legacy entries for review. Every pre-existing task row was compared before/after reconciliation and remained exactly unchanged. No ambiguous legacy outcome was promoted to completion. All six Work/journey read comparisons then passed.

Missing routing facts were not invented. These reconciled manifests remain provisional where facts/confirmation are missing.

Live authenticated mutation checks passed on five scenarios: cash individual, the base bond individual, hybrid company, cash trust with cancellation, and cash company. The first task in each of their nine lane instances was exercised: completion, N/A and reopen each survived fresh reads through attorney, agent, developer, buyer and seller endpoints (135 role/outcome comparisons). This tests the common command/propagation path, not every task-specific document, tax or scheduling action. Shared messages were visible across those roles; private messages stayed restricted. Each tested task's original status, note and visibility were restored via the normal command. Existing lane-history rows were verified unchanged; labelled test events remain as additional audit history. This is not a claim that command timestamps were rolled back.

The registered bond-individual/cancellation fixture remains blocked for mutation acceptance: its assignments have `assignment_status=active` but `status=removed`, and its assigned UAT attorney is denied professional journey access. Its appointments were not silently reactivated. The initial generic demo-attorney failures on other lanes were resolved by testing as the existing labelled UAT attorney actually assigned to each lane, without broadening permissions.

Browser acceptance is separate from API acceptance. A real staging-backed build loaded its sign-in page without runtime errors. The assigned transfer UAT attorney's journey loaded, but opening Work stayed on “Loading attorney workflow…” beyond 60 seconds and a repeat eventually displayed a legal-workspace permission denial. The mutation was restored in the test's `finally` block. Developer, buyer and seller rendered the restored completed task correctly in subsequent browser reads. An initial agent selector incorrectly assumed its detail UI matched the shared journey component; the harness was corrected to open the lane's View Progress card. The primary demo attorney is being tested separately from the secondary UAT assignee; successful API reads do not close the secondary-assignee UI access discrepancy.

Safety: staging only, no production deployment/schema change, no invitations sent. Missing seller portal/observer access was provisioned only for the six explicitly allowlisted demo matters, using internal inactive test listings and existing test users. No existing assigned professional was replaced.

Additional regression checks passed: `legacy-matter-reconciliation.test.mjs` and `shared-journey-reconciliation.test.mjs`.

### Final browser findings

The base matter's completion passed browser reload checks for all five roles after correcting the agent selector and allowing hydration. The primary demo attorney can open Work; the secondary assigned UAT attorney cannot. During N/A verification, the agent's detailed Conveyancing progress panel remained at `0/27` and “Not Started” beyond the 60-second hydration wait, despite the live shared journey endpoint returning the saved N/A state. This is a UI/read-model acceptance failure, not a passing sync result. The harness stops the mutation sequence and restores the original task outcome on any such failure. Browser reopen acceptance and the full browser lane matrix are therefore not complete.

On that final N/A pass, the primary attorney, developer and buyer browser checks passed. The seller page instead displayed “Legal journey unavailable.” The automatic restore then failed with a PostgreSQL statement timeout, leaving the labelled test task N/A. After closing the browser contexts and preview server, `restore-workflow-browser-fixture.mjs` restored the original completed status and note through the authenticated v4 command and verified both with a fresh read. No test task was left N/A. Timeout resilience under concurrent role loading remains unaccepted.

Remaining blockers are now specific:

1. Align the agent's detailed progress panel with the persisted shared plan/outcomes (including N/A), instead of its fallback task set.
2. Align secondary-assignee Work access with the task mutation permission contract, or complete the intended UAT firm membership setup; do not bypass authorization.
3. Resolve the sixth fixture's active/removed appointment conflict with an explicit appointment decision before testing mutations there.
4. Rerun the failed browser checks and sixth-scenario mutations. Provisional routing facts still need confirmation before scenario-specific legal completeness can be certified.
5. Resolve the seller reload/statement-timeout failure seen during concurrent role verification, then repeat failure recovery and reload acceptance.

The sections below retain the initial pre-reconciliation findings for audit context.

Tests targeted staging project `vaszuxjeoajeuhlcnzzf` only. Production was unchanged. No task completion, N/A or reopen mutations were performed in this pass: the scenario preflight found inconsistent task identities/statuses between Work and the shared journey.

## Live checks completed

`node scripts/live-workflow-scenario-preflight.mjs` authenticated as the staging demo attorney and compared the application's Work read model with its shared journey reader for each existing labelled demo scenario.

| Scenario | Matter ID | Work/journey parity |
| --- | --- | --- |
| Cash individual | fe3bab8b-11f7-42e0-99a6-7833cd12a8ef | FAIL |
| Bond individual | b27fc192-b5ff-471b-9da5-902409f78116 | PASS |
| Hybrid company | 15e8a126-c0f6-4083-b8de-964af1160944 | FAIL |
| Cash trust with cancellation | 8d01d55e-2f0a-44fc-8404-2bac0c885ae4 | FAIL |
| Cash company | 1a50def3-bbb9-48c7-bbe3-dc2c7a0bd7b3 | FAIL |
| Bond individual with cancellation | 80b452c8-3d5f-4597-9da7-0cdef47540e1 | FAIL |

Only the passing fixture has an active persisted workflow plan. The other five use legacy journey fallback while Work normalizes legacy tasks into the current task model. Examples include separate legacy buyer FICA requested/received/approved tasks versus consolidated buyer FICA review, and a lodgement-ready status disagreement. Missing scenario facts also prevent treating the proposed plans as final.

Preview only:

`node scripts/reconcile-staging-matter-manifest.mjs --matter=fe3bab8b-11f7-42e0-99a6-7833cd12a8ef`

Returned a provisional transfer plan with 22 tasks and 27 entries retained for review. No reconciliation was applied. Do not blanket-reseed or discard historical task records to obtain passing tests.

`node scripts/staging-document-storage-acceptance.mjs` passed:

- 48 audience cases covering metadata and actual file access: attorney, agent, developer, buyer, seller, anonymous, invalid buyer and invalid seller sessions.
- Unauthorized upload/edit denial.
- Five-role journey parity on the base bond-individual fixture.
- Cleanup confirmed for the temporary labelled document and storage object.

These checks establish document access boundaries and base-fixture read parity, not completion of the full mutation matrix.

## Remaining acceptance work

1. Resolve missing routing facts and reconcile legacy scenario manifests without losing saved task history; ensure Work and journey consume the same task identities and statuses.
2. Rerun all six scenario read comparisons.
3. Run request, upload, approval, completion, N/A and reopen on disposable staging tasks, verifying persistence after reload and the appropriate visibility across attorney, developer, agent, buyer and seller sessions.
4. Verify UI refresh and progress changes for transfer, bond and cancellation lanes. Keep confidential notes/documents excluded from client views.

Do not describe the system as end-to-end accepted until those remaining checks pass.

## Agent progress repair — subsequent focused verification

The agent Conveyancing tab now renders the canonical shared legal journey instead of rebuilding a legacy workflow with default task counts. No permissions or database schema changes were made.

- Renderer regressions passed for transfer, bond and cancellation: completed, N/A, reopened, loading retention and unavailable states.
- Developer placement regression and staging build passed (build required an 8 GB Node heap).
- `node scripts/agent-progress-staging-check.mjs --apply` passed real agent browser reload checks for completed, not_applicable and not_started on the labelled bond-individual fixture's first transfer task. Rendered task status and lane counts matched the authenticated shared journey response.
- Original staging outcome, note and visibility were restored through the authenticated atomic command. Audit history was retained.

This closes the agent detail-panel fallback issue in the local code. Production has not been deployed. The separate seller reload and secondary-attorney access blockers remain; this focused test does not certify every role or scenario.

## Seller reload recovery — subsequent focused verification

Seller journey reads now retry once after transient database/network failures; denied access and invalid input are not retried. A core page timeout no longer clears the saved seller session or falsely marks it expired. Explicit authentication failures still require reauthentication.

- Recovery tests cover transient errors, persistent failures bounded to two attempts, and denied-access handling.
- Client initial-load and journey error-classification regressions passed; staging build passed.
- Three real sequential seller reloads passed on the base staging fixture.
- Nine reload checks across three concurrent seller browsers passed. Each browser injected one 57014 error, then used real staging responses; no successful responses were mocked. Task outcomes remained correct after reload and the rendered journey was visually inspected.
- No workflow records, schema, or production deployment changed. Only the existing staging seller session was authenticated.

This verifies seller reload recovery in the local staging-backed build. It does not establish that the earlier atomic-write statement timeout is eliminated, nor close the secondary-attorney access issue or the remaining full cross-role acceptance matrix.

## Secondary attorney permission alignment — subsequent verification

The affected transfer assignment stores the UAT attorney in `assigned_user_id`, while the legacy primary/attorney fields reference the demo attorney. The browser omitted `assigned_user_id` from its permission projection and participant checks. It now recognises that field alongside the legacy assignee fields, retaining active membership and role capability gates. Conflicting removed/revoked/inactive/suspended assignment statuses cannot supply lane authority.

- Canonical/legacy assignee, unrelated-user and conflicting-removed-status tests passed.
- Coordination permission, authenticated identity and professional journey access regressions passed.
- Staging build passed. The affected secondary transfer attorney opened Work twice with an enabled Save progress control and no browser runtime errors, matching the already-verified API access.
- No assignment records or database permissions changed. No task writes were performed in this focused browser test. Production remains unchanged.

This closes the observed secondary-attorney UI denial in the local code; it does not certify every task-specific action or eliminate the separate database-write timeout.

## Sixth staging fixture appointment reactivation

At the user's explicit request, the three existing assignments on `80b452c8-3d5f-4597-9da7-0cdef47540e1` were corrected from `status=removed` to `status=active`; `assignment_status` was already active. Existing transfer, bond and cancellation assignees were retained. The accepted bank-firm appointments were confirmed active before the change.

The atomic correction was guarded by the exact three assignment/user pairs and demo-matter flags. Previous status and timestamp values were appended to each assignment's `scope_metadata.stagingReactivation20260911`. Full task rows and lane-history rows were compared before and after within the transaction and remained unchanged. No production data or schema changed. This is appointment reactivation, not completion of the remaining mutation/browser acceptance tests.

## Sixth fixture live test after reactivation

The full API cycle passed: the first task of transfer, bond and cancellation was completed, marked N/A and reopened. All five authenticated role readers agreed after every outcome (45 comparisons). Shared notes were visible across roles and private notes remained restricted. Original task outcomes and comments were restored and existing lane-history rows verified unchanged; labelled test events remain as additional history. No invitations were sent and production was unchanged.

Browser acceptance is NOT complete. Against the isolated `dist-staging-acceptance` build, transfer completion passed all five browser checks. After transfer N/A, agent, buyer and seller rendered the outcome; attorney Work remained loading beyond 60 seconds and developer Conveyancing displayed “Legal journey unavailable.” Cleanup restored the original outcome successfully. Remaining browser outcome/lane combinations were not reached because the harness stopped on these failures.

An earlier browser attempt used a production-configured shared dist folder. Production requests were blocked by the test; that attempt is invalid verification evidence. A dedicated staging output folder was then built and used for the results above. The initial preflight also encountered a transient network fetch failure before any mutation; one retry succeeded.

Next blocker: diagnose attorney Work and developer journey loading under cross-role browser activity, then repeat the incomplete browser matrix. Successful API writes in this run do not prove the prior intermittent database-write timeout is permanently eliminated.

## Focused write-timeout recheck

`scripts/staging-write-timeout-check.mjs --apply` exercises a transfer task on the base and sixth staging fixtures using authenticated v4 commands with five concurrent professional journey reads per outcome. Completion, N/A, reopen and restoration succeeded as authorised assignees. Across the runs, successful writes took 335–1,669 ms and none returned SQLSTATE 57014. Reads ranged up to 8,658 ms, showing material read latency remains even while writes succeed.

The initial sixth-fixture attempt used the generic demo attorney and was denied (42501); no outcome changed in that attempt. It was rerun as the existing assigned UAT attorney. One restoration assertion required normalising null versus empty-string notes; the actual restoration command had succeeded. The final run verified original outcomes/notes/visibility and unchanged pre-existing lane history. Additional labelled test history remains. No production changes or timeout-setting changes were made.

Conclusion: the earlier database write timeout was not reproduced by this bounded concurrent-read test. This is not a sustained load test or proof that the intermittent timeout is eliminated. Attorney/developer browser loading failures remain separate open acceptance issues.
