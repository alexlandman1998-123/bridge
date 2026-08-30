# Listing architecture Phase 0 baseline

Generated: 2026-08-30T08:48:03.993Z

Status: **attention_required**

## Inventory

- Listings sampled: 159
- Organisations: 11
- Branches: 3
- Media rows sampled: 71
- Listings with media: 32
- Average assets per listing: 2.22

## Runtime telemetry

- Samples: 0
- p50: not yet available ms
- p95: not yet available ms
- Maximum result count: not yet available
- Maximum estimated response: not yet available bytes

## Media health

- Signed URLs detected: 40
- Expired URLs: 9
- Expiring within seven days: 0
- Incomplete media rows: 0

## Target checks

- ATTENTION: p95Duration
- ATTENTION: resultCount
- ATTENTION: responseBytes
- ATTENTION: expiredMediaUrls
- PASS: incompleteMediaRows

## Notes

Counts are bounded to 10,000 rows per source in this REST baseline. Run `sql/listing-architecture-phase0-baseline.sql` for exact database-wide inventory and query plans. Missing runtime samples are intentionally treated as requiring attention.
