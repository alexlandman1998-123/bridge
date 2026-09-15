# Syndication review phase 1: compatibility boundary

Phase 1 adds no listing fields, no new publish popup, and no browser-visible
change. The existing Private Property and Property24 publishing paths remain
the only active paths.

## Rollout gate

The future publishing review is protected by a server-side, disabled-by-default
gate in `server/services/syndicationReviewRolloutService.js`.

It requires both values below before a specific organisation can enter review
mode:

```text
ARCH9_SYNDICATION_REVIEW_ENABLED=true
ARCH9_SYNDICATION_REVIEW_ORGANISATION_IDS=organisation-id-1,organisation-id-2
```

The global flag by itself is not sufficient. An unlisted organisation, a
missing organisation, or an absent flag always resolves to `legacy` mode.
Future phases must use this result before showing a new review experience. They
must retain the existing publishing flow whenever the result is `legacy`.

## Existing behaviour protected by phase 1

- Private Property preview, readiness and controlled publish remain unchanged.
- Property24 listing and rental preview/publish routes remain unchanged.
- Existing organisation-level Property24 and Private Property connection gates
  remain the authority for real portal writes.
- No environment value is added to local or deployed configuration by this
  phase, so the new gate is off everywhere.

## Regression checks

Run the following before later phases change syndication UI or server routes:

```bash
npm run test:syndication-review-phase1
npm run test:private-property-preview-listing
npm run test:property24-listing-category-contract
npm run test:property24-listing-publish-ui
```

The first check protects the rollout semantics. The other checks protect the
existing Private Property payload behaviour, Property24 category blocks, and
the current listing publish controls.
