# Syndication facts phase 2: shared data foundation

Phase 2 adds an additive data contract for facts used by both Property24 and
Private Property. It does not change the listing UI, publish buttons, existing
feed payloads, or organisation configuration.

## Storage

`listing_syndication_facts` stores one optional facts record per listing. It
contains the shared publishing facts that do not fit reliably in the existing
listing or publication records: rental cadence, price presentation, Offers From
amount, availability, area units, address privacy, and canonical feature values.

`listing_syndication_agent_assignments` stores an ordered roster of Arch9
agents. It deliberately does not replace `private_listings.assigned_agent_id`;
the existing primary assignment remains unchanged until the UI rollout reaches
agent management.

## Compatibility rules

- New records are optional and nullable.
- The Phase 2 service reads existing listing, publication, and seller-canonical
  facts as fallbacks when a syndication record is absent.
- Writing a new fact record is additive. It does not modify an existing listing
  or any portal sync record.
- Portal adapters are not changed in this phase. Their current proven behaviour
  stays intact.

## Migration

The migration is `supabase/migrations/20260915070523_listing_syndication_facts_foundation.sql`.
It has not been applied to a remote database. Applying it is a separate,
explicit production operation after the normal database guard and review.

## Verification

```bash
npm run test:syndication-facts-phase2
npm run test:syndication-review-phase1
npm run test:private-property-preview-listing
npm run test:property24-listing-category-contract
```
