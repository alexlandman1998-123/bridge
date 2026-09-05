# Development visualiser — Phase 14

Phase 14 measures the existing buyer journey through a first-party, privacy-limited event contract. No third-party tracker or duplicate marketing event store is introduced.

## Events

- Scene viewed
- Hotspot selected
- Property opened
- Floor plan viewed
- Shortlisted
- Compared
- Enquiry started
- Journey abandoned
- Fallback encountered

Events contain a random journey session identifier, viewport class, scene/unit identifiers, and a small allow-listed metadata object. Names, email addresses, phone numbers, and URLs are rejected by both the client normaliser and database RPC.

## Collection controls

- Events are batched in groups of at most 25.
- Anonymous collection succeeds only for an explicitly published development slug.
- A session is capped at 120 events per minute per development.
- The raw event table has RLS enabled and anonymous roles receive no direct table access.
- Authenticated reporting is scoped through the existing development access predicate.

## Reporting

The Public Page administration section now shows 30-day sessions, scene views, property opens, enquiries, conversion rate, most explored scenes, properties receiving attention, drop-off scenes, device mix, and asset fallback volume.
