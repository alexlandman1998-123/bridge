# Supabase Repair-Only Processing

Generated: 6 September 2026

## Outcome

The 40 production `repair_only_after_smoke` candidates were audited against
the guarded staging project before any ledger mutation.

| Result | Count |
| --- | ---: |
| Production repair-only candidates | 40 |
| Staging catalog all-live | 14 |
| Staging catalog none-live | 25 |
| Staging catalog partial-live | 1 |
| Staging ledger already recorded before this pass | 6 |
| Staging ledger rows added by this pass | 8 |
| Complete staging evidence rows | 14 |
| Production ledger rows added | 0 |

No SQL was applied to staging or production. The 14 safe rows were processed
with `sqlApplied=false`; all expected staging catalog objects were present and
the relevant transaction, workspace, document-trust, and public-website
behavior suites passed.

## Completed on staging

### Transaction network

- `202608230002`
- `20260827081713`
- `20260827091439`
- `20260831071807`
- `20260831072652`

### Workspace platform

- `202608240001`
- `20260824091732`
- `20260903094624`

### Lead capture / CRM

- `20260905090353`

### Website publication and closeout

- `20260901165511`
- `20260906123000`
- `20260906133000`
- `20260906134500`
- `20260906140000`

## Staging-blocked rows

Twenty-five candidates have none of their statically expected objects on
staging. They must follow the staging SQL path after their preceding dependency
chain is present; recording them as applied would make the staging ledger
false. `20260901140943_harden_admin_portal_authorization.sql` is partial on
staging (2/3 objects) and requires a staging corrective review.

The blocked set spans:

- Attorney: 2 none-live
- Commercial/rental: 3 none-live
- Developer/referral: 3 none-live
- Lead capture/CRM: 3 none-live
- Other/rental: 11 none-live
- Workspace platform: 3 none-live and 1 partial-live

## Production decision

Production promotion is not yet allowed even though the 14 staging evidence
files pass. Every candidate has an earlier local-only dependency that is absent
from the production ledger. The Phase 7 runner correctly enforces this order.
No dependency check was bypassed and no production ledger repair was run.

The next safe action is to process those predecessor rows in timestamp and
module order. Once a predecessor is recorded, rerun the production promotion
plan and promote only the newly unblocked repair-only row.
