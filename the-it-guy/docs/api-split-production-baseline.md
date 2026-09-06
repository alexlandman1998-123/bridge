# API-split production baseline

Run this gate before beginning the `src/lib/api.js` extraction. It is read-only: it does not apply migrations, deploy application code, change production data, or create a Git tag.

From `the-it-guy/`:

```sh
node scripts/api-split-production-baseline.mjs --report
node scripts/api-split-production-baseline.mjs --strict --linked --advisors
```

`--report` always emits the findings and is appropriate while preparing a release. `--strict` fails if any baseline requirement is not met. `--linked` reads the linked Supabase migration ledger. `--advisors` runs the linked project's security advisors and fails on error-level findings.

The gate requires a clean Git worktree because the production baseline must map to exactly one commit. Generated build artefacts and local work must be committed, removed, or kept outside the release checkout before the strict gate can pass.

After this gate passes:

1. Rehearse the release in staging using the selected commit and migrations.
2. Run the relevant end-to-end smoke tests for transactions, client portals, documents, onboarding, attorney, and bond workflows.
3. Deploy backward-compatible migrations separately from application code.
4. Deploy the unchanged application commit and monitor it.
5. Create an annotated baseline tag only after the observation window is healthy, for example `api-split-baseline-YYYY-MM-DD`.

Do not begin extracting `api.js` until the tag exists. Do not mix API extraction with database migrations or feature work in one release.
