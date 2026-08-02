# Document Request Phase 10: Wider Dry-Run Audit

Phase 10 adds a repeatable dry-run audit for live transaction coverage.

## Command

Run:

```bash
node scripts/document-request-canonical-phase10-wider-dry-run-audit.mjs
```

Optional arguments:

```bash
node scripts/document-request-canonical-phase10-wider-dry-run-audit.mjs \
  --limit=500 \
  --max-per-cohort=2 \
  --output=output/document-request-phase10-wider-dry-run-audit.json
```

## Safety

The audit:

- runs with `dryRun: true`;
- reports `commit: false`;
- reports `mutatedData: false`;
- does not call insert, update, or upsert directly;
- uses the Phase 8 recalculation path and transaction dry-run sync service.

## Coverage Checked

The audit tries to find live examples for:

- individual buyer;
- company buyer;
- trust buyer;
- individual seller;
- company seller;
- trust seller;
- deceased estate seller;
- power of attorney seller;
- buyer married in community;
- buyer married out of community / ANC;
- seller married in community;
- seller married out of community / ANC;
- sectional title;
- estate / HOA;
- existing seller bond with seller structure;
- commercial / VAT transaction.

If a cohort is not present in the scanned live sample, it is reported as `not_found_in_live_sample`.

The existing-bond cohort requires both an existing-bond flag and known seller structure. This avoids treating buyer-only rows as coverage for seller cancellation requirements.

## Phase 9 Policy Check

The report explicitly marks whether seller-side dry-run rows include:

- `seller_tax_number`;
- `seller_bank_account_confirmation`.

These should be included for seller/client transactions after Phase 9.

## Latest Run

Run on 2026-08-02:

- scanned transactions: 316;
- sampled transactions: 10;
- failed: 0;
- skipped: 0;
- rows calculated: 90;
- synced: 0;
- wrote rows: false.

Covered cohorts:

- individual buyer;
- company buyer;
- trust buyer;
- individual seller;
- buyer married out of community / ANC;
- sectional title;
- commercial / VAT.

Not found in the live sample:

- company seller;
- trust seller;
- deceased estate seller;
- power of attorney seller;
- buyer married in community;
- seller married in community;
- seller married out of community / ANC;
- estate / HOA;
- existing seller bond with seller structure.

Seller-side sampled transactions included both `seller_tax_number` and `seller_bank_account_confirmation` with no pending-policy skips.

Phase 11 corrected marital-regime extraction after this audit was introduced. The saved report now shows both buyer ANC samples requesting `buyer_marriage_certificate`; `buyer_anc_document` remains pending-policy until separately approved.
