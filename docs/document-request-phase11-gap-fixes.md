# Document Request Phase 11: Gap Fixes

Phase 11 fixes the actionable gaps from the wider dry-run audit.

## Fixed

- Preserved buyer marital regime separately from buyer entity type.
- Preserved seller marital regime separately from seller entity type.
- Added support for normalized `married_cop` and `married_anc` values in the canonical matrix.
- Fixed the Phase 10 audit classifier so married natural persons are reported as individual buyers/sellers with a marital branch, not as entity types.
- Added synthetic regression coverage for live cohorts that were not present in the Phase 10 sample:
  - company seller;
  - trust seller;
  - deceased estate seller;
  - power of attorney seller;
  - seller married in community;
  - seller married out of community / ANC;
  - estate / HOA;
  - existing seller bond with seller structure.

## Verified

- Buyer ANC/COP scenarios now request marital documents.
- Seller ANC/COP scenarios now request marital documents.
- Company seller scenarios request company authority and FICA documents.
- Trust seller scenarios request trust authority and trustee documents.
- Deceased estate scenarios request executor authority.
- Power of attorney scenarios request the authority document.
- Existing seller bond with known seller structure requests `bond_statement`.
- Estate / HOA property structure requests `hoa_levy_statement`.

## Remaining Live-Data Gaps

The wider audit still cannot live-sample these cohorts because no matching transactions were found:

- company seller;
- trust seller;
- deceased estate seller;
- power of attorney seller;
- buyer married in community;
- seller married in community;
- seller married out of community / ANC;
- estate / HOA;
- existing seller bond with seller structure.

These are now covered by tests, but they still need live/staging seed transactions for operational acceptance.
