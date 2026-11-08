# Kingdom listings and buyer onboarding review — 3 November 2026

## Scope and conclusion

Owner: the primary Kingdom transaction application (`the-it-guy/`), its document database contracts and connected listing status services. The agreed review follows manual capture/link delivery → shared form → submission → documents and allocation, and listing workspace → portal update → readback → displayed status.

This review found release gaps and reproducible defects. The two journeys cannot yet be described as verified in production. Local checks passed, but authenticated browser access was unavailable and no production email or portal mutation was performed. Public website implementation, other app modules and the attorney contact data correction were outside this review.

## Production baseline

- `app.arch9.co.za` resolves through Vercel to production deployment `dpl_HfFGZsnLfvxq3Wj8C61LZmauqB3C`, state `READY`, project `bridge`, region `cpt1`. Verified through the connected Vercel tool.
- Production Supabase is `isdowlnollckzvltkasn` (Arch9 SaaS); staging is a different project. All database inspection in this review was read-only.
- The inspected deployed source snapshot is `/tmp/kingdom-release-scoped-aRFQai`. The app API, agency pipeline, transaction onboarding panel, document resolver/read service and Private Property status services match the working tree at inspection. `ClientOnboarding.jsx` differs materially.
- Live `send-email` version 186 was inspected. Its client onboarding handler matches the repository handler apart from the credential import adapter and trailing whitespace. It supports explicit buyer names and participant names. No email delivery was exercised.
- Production migration history includes the November 2 document removal assignment and seller delivery text/UUID corrections. The live removal guard accepts pending and active professional assignments. The live Private Property status constraint still excludes `under_offer`.
- Vercel reported no grouped runtime errors over the preceding 24 hours. This does not cover browser exceptions or prove workflow success. Supabase logs contained database errors across the project; those counts were not attributed to these journeys without request-level evidence.

## Findings

| ID | Priority | Finding and evidence | Disposition |
| --- | --- | --- | --- |
| K01 | P1 | The deployed status resolver produces `under_offer`, but production's `private_property_listing_syncs_external_status_check` rejects it. The prior app release omitted its database dependency. A read-only production predicate confirms rejection; an isolated PostgreSQL fixture reproduces the old rejection and accepts the value after the prepared migration. | New append-only migration `20261103163000_private_property_under_offer_status.sql` is prepared and tested locally; **not applied**. |
| K02 | P1 | Private Property Sold can claim confirmation when the provider still says For Sale. A controlled invocation returned `{"status":"UPDATED","confirmed":true,"externalStatus":"active"}`. `privatePropertyListingStatusUpdateService.js:95` only checks reactivation and Under Offer; the remaining branch returns true. | Open. Give Sold an explicit provider readback contract and regression cases before release. Do not infer Sold from request acknowledgement. |
| K03 | P1 | The deployed shared form truncates natural-person purchasers to one or two during sanitisation (`ClientOnboarding.jsx:1684` in the deployed snapshot). The working tree contains the preservation fix, but that fix is absent from the deployed snapshot. Passing working-tree UI tests therefore overstate deployment coverage if labelled production verification. | Existing local preservation fix passes its four UI checks; release and deployment verification remain outstanding. No saved form among the 105 inspected currently contains more than two purchasers; this is not evidence that historical data loss never occurred. |
| K04 | P2 | The allocation dialog awaits `onAllocate` with Save, Cancel, selectors and close locked. There is no dialog-level elapsed-time recovery. Its existing pending-save test explicitly demonstrates the locked state. A settled rejection recovers correctly; a never-settling request does not. | Confirmed UI recovery gap. Open. Establish a bounded request and reconcile uncertain saves before offering a retry. The screenshot's actual slow backend operation was not timed or reproduced. |
| K05 | P2 | Seven transaction buyer onboarding UI tests failed before reaching their scenarios because the test did not supply a router after the component gained navigation. | Fixed locally using a router wrapper. Added shared-form navigation and failure recovery cases; all nine panel tests pass. |
| K06 | P2 | Existing Private Property fake-database checks did not enforce the database's allowed status values, allowing K01 to pass local checks. Existing Under Offer coverage also lacked accepted-but-still-active and empty-readback cases. | Improved locally: migration-aware fake constraint, actual PostgreSQL migration execution, and PendingOffer/For Sale/empty readback regressions. |
| K07 | Needs reconciliation | Two internally Under Offer listings have saved production Private Property status `unknown`, `is_on_portal=false`, and acknowledged `ListingStatusUpdate` requests. References: `PRV-202610160705-4HLA` and `PRV-202610211436-2HQP`. Both observations predate the latest app deployment. | Confirmed saved-state disagreement. Current portal status remains unknown; reconcile through readback before resending or changing live data. |
| K08 | Needs reconciliation | Of ten legacy transaction requirements marked uploaded, four lack both a direct upload reference and a canonical satisfaction reference. Other document relationships may still explain them. | Candidate data issues, not proof of missing bytes. Identify the exact document and buyer/seller subject before any repair. |

P1 denotes customer workflow failure or data-loss risk; P2 denotes recovery or verification gaps. The review did not reproduce a complete authenticated production journey.

## Reported issues and boundary coverage

| Journey or report | What was checked | Result and limit |
| --- | --- | --- |
| Choosing manual onboarding | Panel entry, draft save/retry, stale recipient protection, late-response protection, shared-form route | Nine controlled UI cases pass; actual production latency remains unmeasured. |
| Onboarding load speed | `fetchClientOnboardingByToken` and agency manual action | Independent reads already use `Promise.all`; agency manual opening skips duplicate preparation. Context/capture/checklist dependencies still take time. No measured timing budget or live trace was obtained. |
| Pending policy requirement error | Actual resolver → mocked RPC payload, plus live canonical requirement constraint | Both pending policy levels become optional at the persistence boundary, required/blocker levels stay intact, input policy data is preserved, and permission errors propagate. Local check passes. |
| Submit after manual capture | Route to the shared form, actual-submission completion hook, token/RLS continuity and projection recovery contracts | Controlled checks pass. Saving captured details remains separate from submission. The buyer declaration and consent are still required; actor attribution and actual role-specific production submission were not verified. |
| Buyer greeting | Agency payload, live email handler and notification contract | Name lookup exists in deployed code; personalised email output/delivery was not sent or visually verified. |
| Documents marked complete without uploads | Canonical and legacy production aggregates, document command/read PostgreSQL fixtures | All five approved canonical requirements have linked document rows and file paths; all three approved listing requirements have evidence links and directly linked files. This did not inspect storage bytes or prove the screenshot's historical state. One completed listing requirement has a direct file but no satisfaction link. |
| ID not syncing across workspaces | Real document command/read fixture suites | Explicit links, current file selection, version history, removal/restoration, subject isolation and access denial checks pass. The reported ID's buyer/seller identity and source requirement remain unknown; K08 needs record-level reconciliation. |
| Authorised professional cannot remove requirement | Live assignment guard and controlled database access tests | Pending/active guard is present. Database fixtures exercise allowed and denied actors. The reporting user's live membership/assignment was not impersonated. |
| Request Document label/requirement ambiguity | Existing read/command contracts and custom requirement fixtures | Exact requirement identity and custom labels are covered. No new product behaviour was inferred from the ambiguous screenshot. |
| Under Offer on external platforms | UI channel fan-out, provider readback, live constraint and saved states | Local fan-out tests pass; K01 and K07 prevent a production success claim. Property24 calls and public portal pages were not exercised live. |
| Gallery crash | Deployed gallery guard and media/publication comparison coverage | Deployed code guards `listingMedia.some` with `Array.isArray`. An authenticated production workspace was not opened. |
| Saving allocation hangs | Pending, rejection/retry, duplicate click and loading-error UI cases | Six cases pass, including the currently locked pending state; K04 remains. |

## Checks and local changes

- Final Node run: **90 passed, 0 failed**, serial execution with a 1024 MB Node heap cap. Includes executed PostgreSQL fixtures for document commands/read permissions and the new migration, pending-policy RPC payload checks, onboarding continuity/recovery and listing presentation/state checks. Some script entries contain multiple assertions counted as one test file by Node.
- Final Vitest run: **39 passed, 0 failed** across transaction buyer onboarding (9), shared ClientOnboarding (4), allocation dialog (6) and listing channel management (20), one worker.
- The first mixed Node invocation incorrectly included a Vitest test; it was rerun successfully with its correct runner. Seven subsequent UI failures exposed K05 and passed after the local harness fix.
- Focused whitespace/diff checks passed. No full production build was run for these test and migration changes.
- Test artifacts: `output/kingdom-workflow-review-20261103/node-tests.log`, `ui-tests.log`, and `sold-readback-probe.log`. These logs use synthetic fixtures.
- Changes made by this review: one new migration, improved two existing Private Property tests, a runtime pending-policy regression in the existing creation check, and the onboarding panel test harness/navigation cases. No application runtime code was changed by this review.
- **No deployment, database migration application, live record repair, email or portal publication occurred.** Production release approval is required by repository policy for those actions.

## Release and follow-up order

1. Review and release K01's narrowly scoped database migration using the production guard/recovery/dry-run procedure. Apply the database dependency before any dependent app release; inspect the actual pending migration list rather than pushing all local migrations.
2. Correct and check K02's Sold confirmation behaviour, and review/release the existing K03 purchaser preservation changes as an explicit source set.
3. Reconcile K07's two existing provider outcomes without automatically resending mutations. Investigate K08 against exact document identities.
4. Address K04 with bounded requests and uncertain-save reconciliation, then measure onboarding/allocation durations per operation.
5. Run authenticated role-specific journeys against a controlled non-production dataset, including deliberate permission denial, a slow/unavailable request, partial channel failure and retries. Recheck the affected production journeys after release.

For subsequent releases, record the exact app source set, dependent migrations and edge function versions; execute the relevant real database contract checks; and keep local, preview and production evidence labelled separately. A Ready build alone is insufficient for these workflows.

## Stage 1 implementation — local, not released

Stage 1 was requested after this review. K02 now requires an explicit Sold provider readback before returning `UPDATED`; Active, Under Offer, Inactive, empty and failed probes stay unconfirmed. Sold is retained as a distinct external state, clears stale live visibility, updates the listing row immediately and blocks ordinary content recovery/reactivation of a sold record. The new append-only migration `20261103170000_private_property_sold_status.sql` adds that state to the database contract.

K03's existing purchaser preservation changes were verified and strengthened. The shared purchaser model now retains more than two saved purchasers even when an inconsistent saved mode says individual. Tests cover three, four and six purchasers through hydration, editing, serialization, reopening, ownership splits, derived parties and FICA signers, plus the existing real draft-save UI check. A later release needs both `ClientOnboarding.jsx` and `purchaserPersonas.js`; copying only the page is insufficient.

K04 now offers a close-and-check action after 30 seconds. The original request remains tracked by the transaction workspace and a reopened dialog cannot submit a second allocation while it is pending. A late success closes the current dialog; a late rejection preserves the firm and permits retry. Unmounting removes timers, and a late result cannot overwrite a different transaction's displayed details. This is recovery from a locked dialog, not cancellation of the server operation or a guarantee that all underlying requests finish within 30 seconds. Pending tracking lasts for the current transaction workspace component lifetime; reopening after a full page reload still requires checking the saved team before resubmission.

Stage 1 validation: 27 Node checks/tests and 44 UI tests pass (the final dialog-only rerun also passed all nine cases). The PostgreSQL fixture applies both new migrations in sequence, proves the old Sold rejection, preserves existing states and still rejects unsupported values. Scoped lint, server syntax, JSX parsing and diff checks passed. The large page files were syntax checked; lint was scoped to the changed dialog, model, service and test files. A full build and authenticated production checks remain release work.

Release dependencies, in order: `20261103163000_private_property_under_offer_status.sql`, then `20261103170000_private_property_sold_status.sql`, before deploying the dependent app code. Neither migration was applied by stage 1. The workspace contains unrelated edits, including in large page files; use the stage 1 changes and reviewed purchaser preservation changes as the explicit release scope. Evidence is under `output/kingdom-workflow-review-20261103/stage1/`.

## Stage 2 — exact release package verified

The frozen package is `output/kingdom-release-20261103-stage2/`, release ID `kingdom-stage2-9884dea5482f21de`. Its review, source inventory, archive checksum, patch, exact database bundle and verification evidence are recorded there. It contains 20 changes from the deployed Kingdom snapshot: 10 runtime files, 8 test files and 2 migrations. Unrelated working-tree changes were excluded.

The exact package passed 30 Node checks/tests and 38 UI tests both locally and after a clean lockfile install in a temporary remote builder. The difference from stage 1 totals reflects exclusion of the working tree's separate channel-management changes and associated tests. An outdated PDF chunk assertion was corrected to follow the already deployed lazy download service. No PDF runtime change was included.

The full local build reached the repository's 1.5 GB safety cap and was not retried locally. The same checksummed package passed the full production-mode build remotely on Node 24, with production public configuration. Its release marker, Supabase origin, listing-detail marker and 990 critical assets were verified. Source checksums still matched after the build, and the temporary builder was stopped.

The production guard and live database recovery gate passed. The read-only dry run returned exactly the two intended migrations, with no seeds or role changes. No deployment, migration application, listing mutation or email dispatch was performed. Stage 3 still requires explicit release approval; authenticated live journeys and reconciliation remain post-release work.
