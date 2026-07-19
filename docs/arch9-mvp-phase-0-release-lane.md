# Arch9 MVP — Phase 0 release lane

Phase 0 establishes the release boundary. It does not apply a migration, link a Supabase project, or make a production change.

## Fixed MVP boundary

The release is restricted to the four launch scenarios defined in `the-it-guy/docs/mvp-launch-boundary.md`:

1. Cash / individual / resale
2. Bond / company / private sale
3. Hybrid / trust / resale
4. Development / company / development sale

The operational target is a maximum of 100 transactions per month. Commercial, calendar, CRM expansion, enterprise workspaces, custom workflows, billing, and unrelated product changes are outside this release.

## Release isolation procedure

This worktree was created cleanly from `main` on `codex/arch9-mvp-release`. Move only the files approved by `docs/arch9-mvp-release-manifest.json` into it. Commit the approved release changes before proceeding. Do not include unrelated migration recovery, attorney-calendar, document-generator, or other module work.

## Release-lane gate

Run the non-mutating report at any time:

```bash
npm run mvp:phase0:report
```

Run the strict gate before a staging deployment:

```bash
npm run mvp:phase0:check
```

The strict gate requires a dedicated MVP release branch, no uncommitted files, no committed release changes outside the approved manifest, and all required MVP assets present.

It deliberately does **not** certify the database or authorise deployment. Deployment remains blocked until Phase 1 closes the transaction-spine bypasses, Phase 2 passes local verification, and Phase 3 has an approved staging migration plan.

## Ownership and evidence

Before entering staging, record the release owner, staging project reference, frontend environment, migration ledger evidence, and rollback decision in the deployment runbook. Credentials must remain in environment variables or the deployment secret store—never in this manifest or repository.
