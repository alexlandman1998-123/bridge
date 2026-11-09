# Local API verification baseline

The primary transaction workspace has one repeatable API regression command:

```sh
npm --prefix the-it-guy run test:api-baseline
```

It runs the explicit selection in `scripts/api-verification-baseline.json`: 164 native fixture/source checks and 48 Vitest files. Native checks run serially; Vitest uses one worker and no file parallelism. The Node heap is capped at 1,024 MB. A memory failure stops the runner; remaining checks are unverified. Each invocation writes its selection counts, results and individual logs under `the-it-guy/output/api-verification-baseline/<timestamp>/`. Generated reports are ignored by Git.

Use `-- --native` or `-- --vitest` to investigate one part. The default command runs both and returns a failing exit status for any failed, timed-out or interrupted check. Fixture clients and local source contracts supply the data. Hosted Supabase defaults are replaced with a loopback URL and fixture keys. No migration application, remote acceptance script, email delivery, deployment or production build is included.

The selection covers the retired API boundary and public capability inventory, domain reads, optional workflow imports, scoped authorization, transaction saves and lifecycle receipts, onboarding projection recovery, document access and generator retirement, and opening-request measurement/cache invalidation. The established fast service baseline remains `npm run check:quick` from the repository root. This selection is an API regression baseline, not a claim that every repository test or production performance target has been verified.

The local verification on 9 November 2026, including the bounded development overview and focused final reruns, passed all 164 native check files and all 332 current tests in 48 Vitest files, with no skipped Vitest tests. All nine fast service checks passed. Focused lint on the eight overview change files had zero errors and the same 24 existing warnings in the large development page; a comparison with the saved pre-change source found no introduced lint warnings. The fast service run still emits two existing ESM/CommonJS fallback-import warnings. Those compatibility fallbacks were preserved. The full production build and live database/performance behavior remain unverified.

## Repairing historical checks

The November 9 audit started with 38 failures in 150 selected native scripts. Repairs preserved the user outcomes while removing these obsolete assumptions:

- API evaluation harnesses sliced across unrelated functions and imported modules after extraction. Named declarations now bind their real dependencies to local fixtures.
- Four migration checks referenced superseded filenames. They now inspect existing migrations; no migration was edited.
- UI contracts expected old labels, formatting, inline handlers or removed nomination controls. They now check the current shared picker, finance capture, tracker and read paths. The optional historical participant application gate explicitly selects `trackerOnly: false`.
- Appointment saves now use one atomic command. Invalid rescheduling fixtures must make zero database calls; valid requests must use the token-bound response command.
- Existing active transactions are rejected instead of overwritten. Missing-column checks retain bounded retry and protected-column safeguards.
- The token-bound onboarding snapshot owns the completion audit. Tests reject privileged workflow/event writes from the buyer-token submit path while retaining projection-recovery checks for the projections it still performs.
- Retired render/sign endpoints return HTTP 410, cannot load renderer/database/storage dependencies and remain disabled in configuration. Historical SQL access fences and reusable signing contracts remain checked.
- A stock edit may reload after a failed save to recover canonical state. Successful quick edits must still avoid a whole-page reload.

The related buyer email contract check and document were updated to the active tracker wording. The communication catalogue's bond-introduction action was also corrected to “View bond progress”, matching the current email and portal tracker.

When a behavior changes intentionally, update its behavioral test and explanation. Do not restore the aggregate API, skip a failing check, relax authorization/receipt requirements, or repin API hashes just to obtain a passing result. New fixture behavior tests should be preferred to additional source-string contracts.
