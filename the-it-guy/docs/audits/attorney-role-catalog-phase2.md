# Attorney role catalogue — Phase 2

## Outcome

Phase 2 establishes `src/constants/attorneyRoleCatalog.js` as the single source of truth for attorney firm roles and transaction attorney roles. It owns role IDs, labels, descriptions, authority classification, permissions, department eligibility, practice qualifications, invitation eligibility, and normalization.

## Compatibility boundary

The eight existing firm-role IDs and three existing transaction-role IDs are unchanged. This keeps current profile, invitation, membership, assignment, signup, onboarding, and settings data readable. Role-ID migration remains deferred to Phase 3.

## Migrated consumers

- Profile and API role validation now import the canonical values.
- Permission services share the catalogue's permission map and management classification.
- Transaction assignments share the canonical transaction roles and labels.
- Attorney onboarding role selectors, reviews, guidance, previews, and department defaults share catalogue metadata.
- The unused secondary role-permission matrix and invalid `attorney_admin` / `attorney_manager` aliases were removed.

## Enforcement

`scripts/attorney-role-catalog-phase2.test.mjs` checks catalogue completeness, fail-closed permissions, role and qualification integrity, department rules, invitation policy, normalization, and source ownership. The Phase 0 governance test now enforces the consolidated ownership boundary.
