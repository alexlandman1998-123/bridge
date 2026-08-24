# Arch9 Rentals Staging Readiness

Rentals must be built behind staging and feature gates before any production rollout.

## Current Safety Contract

- Supabase production project ref: `isdowlnollckzvltkasn`
- Supabase staging project ref: read from `the-it-guy/.env.staging.local`
- Local staging commands must run through:

```bash
node scripts/run-with-staging-env.mjs -- <command>
```

- Environment safety must pass before Rentals schema, UI, Property24 rental publishing, or seed data work:

```bash
npm run staging:safety
```

## Rentals Flags

These flags default to `false` in code and `.env.example`:

- `VITE_SALES_RENTALS_WORKSPACE_SPLIT_ENABLED`
- `VITE_SALES_RENTALS_PRODUCTION_ROLLOUT_ENABLED`
- `VITE_SALES_RENTALS_WORKSPACE_ALLOWLIST`
- `VITE_SALES_RENTALS_USER_ALLOWLIST`
- `VITE_RENTALS_ENABLED`
- `VITE_RENTAL_APPLICATIONS_ENABLED`
- `VITE_RENTAL_LEASES_ENABLED`
- `VITE_RENTAL_MANAGEMENT_ENABLED`
- `VITE_PROPERTY24_RENTALS_ENABLED`

`VITE_SALES_RENTALS_WORKSPACE_SPLIT_ENABLED` is the Phase 2 shell flag. It may be enabled for a controlled staging or preview proof.

Production private beta is allowed only when all of these are true:

- `VITE_SALES_RENTALS_WORKSPACE_SPLIT_ENABLED=true`
- `VITE_SALES_RENTALS_PRODUCTION_ROLLOUT_ENABLED=true`
- at least one of `VITE_SALES_RENTALS_WORKSPACE_ALLOWLIST` or `VITE_SALES_RENTALS_USER_ALLOWLIST` is populated
- the signed-in workspace or user matches the allowlist

Prefer workspace UUIDs in `VITE_SALES_RENTALS_WORKSPACE_ALLOWLIST`; slugs/names such as `produktive` are accepted only as an operational fallback.

Do not enable the deeper Rentals workflow flags until the staging workflow has seeded agencies, departments, agents, landlords, tenants, listings, applications, and lease shell records.

## Release Rule

For the first Rentals build, production promotion requires:

- staging env points at the non-production Supabase project
- Vercel preview/staging env does not point at production Supabase
- Rentals remains hidden in production except for an explicit workspace/user private-beta allowlist
- migrations are applied and verified in staging before production
- pilot agency enablement is feature-flagged, not global

## Implemented Shell Phases

- Phase 1 defines the canonical business-line source of truth: global feature gates, organisation business lines, and agent membership business-workspace access. Runtime access now resolves by intersecting global enablement, organisation capability, and user access.
- Phase 2 adds the gated Sales/Rentals workspace selector and `businessWorkspace` context.
- Phase 3 adds Rentals navigation under `/agent/rentals/*` with guarded placeholder routes. Sales routes remain unchanged.
- Phase 4 replaces `/agent/rentals/listings` with the first rental listing capture workflow. It creates guarded rental private-listing drafts, stores rental-specific facts in canonical JSON/notes, and syncs a Property24 publication draft with `listingType: Rental`.
- Phase 5 replaces `/agent/rentals/pipeline/applications` with the first tenant application capture workflow. It records tenant details, documents, affordability, references, credit status, and landlord approval as guarded rental application activity against rental listings.
- Phase 6 replaces `/agent/rentals/tenancies` with the first lease and handover workflow. It records lease generation state, signature workflow state, deposit proof tracking, occupation date, and check-in/handover status as guarded activity against rental listings.
- Phase 7 hardens workspace route and query scope behaviour. Wrong-workspace routes redirect to the matching Sales/Rentals route, and rental listing/application/lease loading shares a single rental scope resolver so branch managers are branch-scoped and department managers do not get accidental organisation-wide access.
- Phase 8 enforces module-level rental feature gates. The Sales/Rentals shell can be enabled without exposing listing capture, tenant application capture, lease workflow capture, rental management, or Property24 rental publishing before their specific flags are enabled.

Phases 4, 5, and 6 deliberately do not add rental accounting, rent collection, landlord payouts, or dedicated rental tables. Those remain delayed until tenant applications, lease workflow, and early management workflows prove the correct data boundaries.
