# Phase 19 — Migration Inventory Repair

## Decision

**Status: MIGRATION_INVENTORY_REPAIRED**

The duplicate local version `202607200002` is resolved. The seller-onboarding migration keeps that established version, while the three dependent conditional-master migrations now occupy the consecutive unused range `202607200004`–`202607200006`.

## Repair map

| Dependency order | Previous version | Allocated version | Migration |
| --- | --- | --- | --- |
| 1 | `202607200001` | `202607200004` | Conditional legal masters Phase 4 |
| 2 | `202607200002` | `202607200005` | Safe organisation migration Phase 10 |
| 3 | `202607200003` | `202607200006` | Verification receipts Phase 11 |

The SQL content hashes were captured in the machine-readable evidence. Production was queried read-only and contained none of the allocated versions. The certified staging manifest also contains none of them. A live staging collision check remains mandatory immediately before the chain is added and certified there.

## Result

- 501 local migration files now map to 501 unique versions.
- `202607200002_seller_onboarding_connected_attorney_resolution.sql` was not renamed or edited.
- All live conditional-master contract-test paths use the new filenames.
- The locked Phase 1 scope records the allocation and its next governance step.
- CI now rejects duplicate versions, missing chain files, altered chain content, stale filenames, or accidental inclusion in the existing 64-row manifest.

## Safety boundary

This phase changed repository inventory only. It did not execute migration SQL, modify either database ledger, expand the governed manifest, or retire the Phase 0 broad-push guard.

## Next step

Add the three migrations to a reviewed governed manifest in dependency order, recheck the versions against live staging, then certify the chain on staging before any production promotion.
