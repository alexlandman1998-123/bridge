# Arch9 outstanding production release — 21 October 2026

The requester authorised auditing and publishing outstanding updates from 20–21 October 2026. The final requested demo edit removes the entire “Nothing needed from you” container from the mobile overview. That removal is included in the release and verified on the live demo.

## Production results

| Product | Result | Ready deployment |
| --- | --- | --- |
| Primary Arch9 workspace | Promoted to https://app.arch9.co.za | `dpl_6hiFaZ3rXq8mr2gDx1YXUL8Kafzz` |
| Home Seekers | Promoted to https://homeseeker.co.za | `dpl_D462mXex84kBHNgLidoDoLDt6pDd` |
| Samlin Construction | Promoted to https://samlin-construction.vercel.app | `dpl_6EQWoFeHZpAT2ShCfVGqoDRM3TS1` |
| Operating Console | Current runtime already matched; no new deployment | `dpl_46PbkgCBoYjPhA3Mfq1a3VnkbJjr` |
| Shared property websites | Current 20–21 October package changes already matched; no new deployment | `dpl_D39q6mpSCCGdHSACukFmDHGGGFjp` |

Samlin’s custom domain was not changed. Its release uses the existing separate Vercel production address.

## Source and scope

The primary release is retained as commit `29890ff0172cdba7b14f580e9a59914eeb0e7674`, local branch `codex/production-outstanding-20261021`. The managed release worktree is `/Users/alexanderlandman/.codex/worktrees/production-outstanding-20261021/the-it-guy`. The release branch was retained locally, not pushed to GitHub.

The candidate reconstructs the deployed primary source from the 20 October release baseline and the 22 file differences in the current production source. Recent primary-app changes are merged into that baseline. Deployed relisting persistence guards, Instagram integration, signed-document download behavior and timeline navigation are retained. Conflicts and decisions are recorded in the release evidence. The shared checkout was not reset, staged or committed; its unrelated changes remain intact.

The release includes the buyer demo, mobile navigation/listing/contact updates, notification presentation, transaction partner selection, public development presentation/reservations and Home Seekers signup/next-step updates. Samlin includes three later presentation edits. Admin and shared website runtime did not need publication again.

The exact source manifest is `a155d42d71a69b12597d9869eb27914f1c93b832ae4986fe192238d13be8e836`. The app’s staged HTML contains the actual source commit as its release marker and `/assets/index-ComOr-NM.js`. The staged production build was verified before promotion. The final live demo rendered with no captured browser console errors.

## Database and Edge Function audit

Target: Arch9 SaaS, `isdowlnollckzvltkasn`. The read-only Phase 0 guard passed with no duplicate local migration timestamps. Comparing 1,538 local versions with 1,549 recorded production versions found **zero local versions awaiting application**. All eight migration versions from 21 October are already recorded in production, with recorded SQL statements:

- `20261021074539` — anonymous offer and client-context access
- `20261021075608` — anonymous policy planning timeouts
- `20261021081126` — privileged RPC execution
- `20261021082100` — scoped seller continuity resolver
- `20261021083842` — remaining RPC scope gaps
- `20261021102435` — inbound identity preservation and staff RPC access
- `20261021104501` — closeout authority before event writes
- `20261021110538` — lead, prospect and catalogue access

The linked `db push --dry-run --skip-vault` did **not** pass: it stops because 11 older production versions from 16–18 October are absent from this checkout. Their versions are retained in `database-and-functions-audit.json`. No history repair, replay, new migration application, seed operation or remote data repair was performed.

The recovery check returned **RECOVERY_LOCK_BLOCKED**, with `recovery_test_not_recorded` and `backup_restore_not_proven`. Today’s correction recognises that the earlier exercise proved a live clone, not restoration from an identified backup. Future database mutations remain subject to the runbook’s recovery gate. This frontend release does not certify backup recovery or Storage-byte recovery.

All 68 production Edge Functions are ACTIVE; none is older than today’s recorded release receipts. No Edge Function needed redeployment in this release.

Current security advisories remain: 187 informational RLS-without-policy findings, 340 anonymous SECURITY DEFINER execution findings and 835 authenticated SECURITY DEFINER execution findings. They were recorded, not claimed resolved. See [RLS advice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous RPC advice](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated RPC advice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Validation and fixes

- Full primary `check:app` passed: lint with zero errors and 635 existing warnings, the established service baseline, production build and login probe.
- Website `check:website` and admin `check:admin` passed.
- Samlin production build passed.
- Affected UI checks passed: 158 tests across 17 files, including reruns of the two corrected test files.
- Home Seekers next-step, calculator and tracking checks: 54 passed across five files.
- Transaction contract checks: 24 passed, including the corrected overview navigation assertion.
- Remaining RPC scope fixture: all 10 checks passed after renaming the SQL query helper that lint misclassified as a React hook.
- Bundle budgets, operational packaging and schema compatibility checks passed, without relaxing their limits.

Three stale test expectations were corrected: the existing email-correction button label, waiting for retry completion before asserting the final state, and retaining deployed timeline navigation. The initial cloud build with a file hash as release ID was rejected by the existing source-commit guard and was never promoted. The replacement uses the retained commit.

Live Home Seekers verification exposed a retired legacy Supabase service key in that project’s production-only configuration. The API bundle matched its previous production bundle. Its existing sensitive server variable was updated to a valid existing Supabase secret key, retaining its production-only scope. No new credential was created or exposed to frontend code or logs. The same tested artifact was redeployed and its candidate property feed returned HTTP 200 with one published listing before promotion.

## Recovery and practical limits

Retained previous deployments: primary `dpl_8L3aYTZ8EqRDFJqCwKwydndKbgRS`, Home Seekers `dpl_6XvysRYxdvJGdgNfNk92Xj5Br9Uv`, Samlin `dpl_5bojC8ivZ6985Vmig3gQEKY9oYym`. Reverting Home Seekers code must retain its corrected server credential; its previous legacy credential is disabled.

No customer transaction, recruitment submission, email, claim, payment or provider publication was created for verification. Authenticated customer save/upload/signature and real outbound delivery canaries were not repeated. Verification covers release checks, target identities, public rendering and the public property feed; it is not a new complete business-flow certification.

Evidence is retained in `output/production-release-20261021/`: source manifest and commit, baseline/difference inventories, merge decisions, checks, deployment receipts, live target verification, credential receipt, feed checks, runtime scans and screenshots. The local dev server was restarted with its existing public configuration after dependency checks, and the local demo was verified again.

## Final live verification

Fresh Vercel lookups verified the exact Ready deployment identities for all five products in the result table. The final Home Seekers production feed returned HTTP 200 with one published listing, and that listing appeared in the live homepage browser check. Samlin’s live homepage rendered its updated presentation. The primary buyer demo rendered the final mobile overview without the removed container and captured no browser console errors.

Bounded runtime error scans for the three new production deployments returned no error records in the checked window. These checks are a limited post-release observation, not continuous monitoring or an authenticated business-flow canary.
