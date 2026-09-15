# Syndication Review Category Pilot: Phase 8

Phase 8 adds an optional listing-category boundary to the organisation and channel pilot controls.

```text
ARCH9_SYNDICATION_REVIEW_PILOT_CATEGORIES=residential
```

Supported values are `residential`, `land`, `farm`, `commercial`, `industrial`, and `mixed-use`. Residential also covers house, apartment, flat, townhouse, and cluster listings.

With the Phase 1 organisation allowlist and Phase 7 channel scope in place, Arch9 now requires the review only when all three conditions are true:

1. The organisation is opted in.
2. The portal is in the pilot channel list.
3. The listing category is in the pilot category list.

Omit this setting to retain the earlier all-category behaviour for an existing pilot. The setting does not alter portal eligibility: Property24's server-side category contract continues to block unverified categories.
