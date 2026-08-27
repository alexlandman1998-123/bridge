# August 27 Supabase Migration Classification

Generated: 2026-08-27T14:39:10Z  
Repo: `/Users/alexanderlandman/the-it-guy`

## Scope

This is a read-only phase 2 classification for the August 27 migration batch. It does not apply SQL, repair the ledger, or change the linked Supabase project.

The goal is to sort the batch into:

- `apply`
- `repair-only-after-smoke`
- `consolidate`

## Decision

| Bucket | Count |
| --- | ---: |
| `apply` | 3 |
| `repair-only-after-smoke` | 3 |
| `consolidate` | 2 |
| **Total files** | **8** |

## Classification

| Version | File | Bucket | Why |
| --- | --- | --- | --- |
| `20260827102857` | `20260827102857_repair_partner_pipeline_assignment_scope.sql` | `apply` | Adds assignment columns, constraints, index coverage, and a guarded backfill for missing attorney assignment rows. |
| `20260827104557` | `20260827104557_repair_attorney_incoming_matter_visible_status.sql` | `repair-only-after-smoke` | Normalizes existing assignment instruction status rows and should only be ledger-repaired after the behavior smoke passes. |
| `20260827113000` | `20260827113000_whatsapp_embedded_signup_v1.sql` | `apply` | Introduces the WhatsApp embedded-signup schema and function surface, then backfills access tokens into secrets storage. |
| `20260827124137` | `20260827124137_repair_attorney_firm_assignment_spine_access.sql` | `apply` | Replaces the transaction-spine access resolver and expands firm-level visibility rules. |
| `20260827133506` | `20260827133506_repair_missing_roleplayer_bond_handoffs.sql` | `consolidate` | This is the first half of the bond-originator handoff repair pair and should not survive as an independent packet. |
| `20260827133739` | `20260827133739_repair_missing_roleplayer_bond_handoffs_execution.sql` | `consolidate` | This is the explicit execution form of the same bond-originator handoff repair and should be merged with `20260827133506`. |
| `20260827133916` | `20260827133916_repair_roleplayer_participant_scope_alignment.sql` | `repair-only-after-smoke` | Backfills participant scope metadata from active roleplayer selections and should not be blindly replayed. |
| `20260827151119` | `20260827151119_repair_bond_originator_transaction_scope.sql` | `repair-only-after-smoke` | Backfills transaction scope fields from canonical bond applications and should be ledger-repaired only after smoke evidence. |

## Consolidation Note

Treat the bond-originator handoff repair as one reviewed packet, not two separate migration candidates:

- `20260827133506_repair_missing_roleplayer_bond_handoffs.sql`
- `20260827133739_repair_missing_roleplayer_bond_handoffs_execution.sql`

Both files repair the same missing bond-originator workflow/application spine. The second file is the more explicit execution form, so the phase 3/phase 4 follow-up should consolidate them into a single canonical migration packet before any staging or production execution.

## Follow-Up

1. Keep the Phase 0 guard active.
2. Use the `apply` rows as the next reviewed staging candidates.
3. Keep the `repair-only-after-smoke` rows out of direct SQL replay until smoke evidence is recorded.
4. Consolidate the bond-originator handoff pair before any promotion work.

