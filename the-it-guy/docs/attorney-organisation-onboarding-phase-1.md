# Attorney organisation onboarding — Phase 1 hydration

## Outcome

Attorney organisation settings now hydrate from the backing `organisations` row instead of stopping at the lightweight attorney auth-workspace snapshot.

The hydration order is:

1. Resolve the current attorney firm and its `organisation_id`.
2. Prefer the active `organisation_users` membership for that exact backing organisation.
3. Fetch the complete organisation and organisation-settings context.
4. Prefer canonical organisation values in Settings.
5. Fill fields that remain empty before backfill from the attorney-firm workspace snapshot.
6. If the backing-organisation request fails, expose the enriched attorney-firm snapshot and retain an error message instead of rendering an empty organisation form.

## Fields available to the fallback

- Firm, legal, registration, and VAT identity
- Website, email, and phone
- Address lines, city, province, postal code, and country
- Primary logo and brand colours

VAT and colours remain schema-gap fallbacks from Phase 0; Phase 1 does not make them canonical.

## Settings presentation

`attorney_firm` now resolves to attorney-specific organisation labels instead of agency labels. The deeper restructuring of attorney settings remains Phase 4.

## Scope boundaries

Phase 1 does not:

- Change attorney onboarding writes
- Add database columns, migrations, triggers, or RPCs
- Backfill existing organisation rows
- Reverse-sync organisation edits into `attorney_firms`
- Change RLS policies

## Verification

- `npm run test:attorney-organisation-phase1`
- Focused ESLint on all changed hydration files
- Production Vite build
- `git diff --check`

