# Commercial listing readiness workflow

Phase 5 connects the Phase 4 category-readiness evaluator to the commercial
listings workspace.

`CommercialCrudPage` now passes both display lookup options and the original
commercial lookup rows to column renderers. The listings quality column uses the
linked `commercial_properties` row when it evaluates a listing, rather than
evaluating the listing without its physical-property facts.

The listings table therefore shows one of two useful states:

- `Category ready` when the required canonical facts for its category are
  present.
- `<n> category facts missing` when the broker needs to complete the linked
  property or listing record.

This is an Arch9 workflow and data-quality indicator. It does not call
Property24, alter syndication status, or bypass the still-blocked
non-residential Property24 category contract.
