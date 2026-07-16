# Attorney Leads Runtime Readiness — Phase 5

Phase 5 closes the database-only readiness gap that allowed a Journey link to be labelled ready while the `attorney-public-intake` Edge Function was unavailable.

## Delivered

- A public, read-only `health` action on `attorney-public-intake`.
- Slug-specific verification through the same `resolve_attorney_public_intake` command used by the live Journey.
- A versioned runtime response for deployment evidence.
- Runtime probing as part of `getAttorneyLeadsLaunchReadiness`.
- A blocking readiness item when the function is unreachable or the exact Journey slug is inactive.
- Online/offline runtime status in the Public Journey Link drawer.
- A repeatable live verification command:

```bash
npm run verify:attorney-leads-runtime-phase5
```

Use `ATTORNEY_INTAKE_SMOKE_SLUG` to target a different active staging Journey.

## Readiness rule

“Ready to share” now requires both:

1. The existing authenticated database readiness checks to pass.
2. The deployed Edge Function to return `healthy: true` and `intake_active: true` for the exact configured slug.

No new database migration is required for Phase 5. Edge deployment health is external runtime state and cannot be truthfully inferred by PostgreSQL.

## Deployment

Deploy the public runtime with:

```bash
npx supabase functions deploy attorney-public-intake \
  --project-ref isdowlnollckzvltkasn \
  --no-verify-jwt
```

Then run the live verification command before sharing any Journey link.

## Verified on 2026-07-16

- Runtime version: `attorney-public-intake-phase5-20260716`
- QA Journey: `canonical-qa-attorney-firm-mrnwetyv`
- Active services returned: 6
- Edge Function type-check: passed
- Phase 4 and Phase 5 contract tests: passed
- Phase 8 readiness regression: passed
- Targeted ESLint: passed
- Production build: passed
- Local browser Journey render: passed with no console errors or error overlay
