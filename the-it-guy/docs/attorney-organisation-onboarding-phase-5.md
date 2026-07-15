# Attorney organisation onboarding — Phase 5

## Outcome

Phase 5 adds a read-only release gate for the complete attorney onboarding-to-Settings data path.

The readiness verifier checks:

- local Phase 2–4 implementation contracts;
- deployed organisation and attorney branding columns;
- deployed atomic onboarding and reconciliation RPCs;
- canonical drift across every attorney firm;
- active membership parity between `attorney_firm_members` and `organisation_users`.

The runtime report contains aggregate counts only. It does not print firm, organisation, or user identifiers and performs no inserts, updates, repairs, or deletes.

## Commands

Static contract check without network access:

```sh
node scripts/attorney-organisation-runtime-readiness.mjs --skip-network
```

Release-gating live check:

```sh
npm run verify:attorney-organisation:readiness
```

Required live configuration:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Set `ATTORNEY_ORGANISATION_EXPECTED_PROJECT_REF` or pass `--expected-project-ref=<ref>` to prevent accidentally certifying the wrong Supabase project.

Optional report output:

```sh
node scripts/attorney-organisation-runtime-readiness.mjs --output=/absolute/path/readiness.json
```

## Release decision

- `READY`: schema, drift, and memberships pass.
- `READY_WITH_WARNINGS`: checks pass but a non-blocking rollout warning needs review.
- `BLOCKED`: credentials or a live probe are unavailable.
- `FAILED`: required schema is missing, drift remains, membership parity fails, or the project target is wrong.

Phase 5 does not deploy migrations or mutate remote data.
