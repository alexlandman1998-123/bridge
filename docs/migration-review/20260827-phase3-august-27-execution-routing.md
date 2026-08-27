# August 27 Supabase Migration Execution Routing

Generated: 2026-08-27T14:39:10Z  
Repo: `/Users/alexanderlandman/the-it-guy`

## Scope

This is the phase 3 routing layer for the August 27 migration batch. It is still read-only. It does not apply SQL, repair the ledger, or consolidate files automatically.

The routing layer takes the phase 2 classification and assigns the next safe handling step for each row:

- `apply_original_after_dependency_check`
- `repair_only_after_smoke`
- `consolidate_into_canonical_packet`

## Decision

| Route | Count |
| --- | ---: |
| `apply_original_after_dependency_check` | 3 |
| `repair_only_after_smoke` | 3 |
| `consolidate_into_canonical_packet` | 2 |
| **Total files** | **8** |

## Execution Order

| Step | Version | File | Phase 2 Bucket | Route | Why This Comes Here |
| --- | --- | --- | --- | --- | --- |
| 1 | `20260827102857` | `20260827102857_repair_partner_pipeline_assignment_scope.sql` | `apply` | `apply_original_after_dependency_check` | This is the earliest schema-and-backfill repair and should anchor the rest of the batch. |
| 2 | `20260827113000` | `20260827113000_whatsapp_embedded_signup_v1.sql` | `apply` | `apply_original_after_dependency_check` | This adds the WhatsApp schema and function surface after the attorney assignment repair is in place. |
| 3 | `20260827124137` | `20260827124137_repair_attorney_firm_assignment_spine_access.sql` | `apply` | `apply_original_after_dependency_check` | This access-resolver replacement can follow the core assignment and channel schema work. |
| 4 | `20260827133506` | `20260827133506_repair_missing_roleplayer_bond_handoffs.sql` | `consolidate` | `consolidate_into_canonical_packet` | First half of the bond-originator repair pair; it should not be promoted alone. |
| 5 | `20260827133739` | `20260827133739_repair_missing_roleplayer_bond_handoffs_execution.sql` | `consolidate` | `consolidate_into_canonical_packet` | Explicit execution form of the same bond-originator repair; merge it with the prior file. |
| 6 | `20260827104557` | `20260827104557_repair_attorney_incoming_matter_visible_status.sql` | `repair-only-after-smoke` | `repair_only_after_smoke` | This is a ledger-recorded status normalization and should wait for smoke evidence. |
| 7 | `20260827133916` | `20260827133916_repair_roleplayer_participant_scope_alignment.sql` | `repair-only-after-smoke` | `repair_only_after_smoke` | This is a data backfill that should only be recorded after the relevant smoke checks pass. |
| 8 | `20260827151119` | `20260827151119_repair_bond_originator_transaction_scope.sql` | `repair-only-after-smoke` | `repair_only_after_smoke` | This is another scope backfill and should remain out of direct SQL replay until smoke evidence exists. |

## Route Notes

### `apply_original_after_dependency_check`

Use this route for the three schema and access migrations:

- `20260827102857_repair_partner_pipeline_assignment_scope.sql`
- `20260827113000_whatsapp_embedded_signup_v1.sql`
- `20260827124137_repair_attorney_firm_assignment_spine_access.sql`

These rows are the next reviewed staging candidates after dependency checks.

### `repair_only_after_smoke`

Use this route for the three data normalization/backfill rows:

- `20260827104557_repair_attorney_incoming_matter_visible_status.sql`
- `20260827133916_repair_roleplayer_participant_scope_alignment.sql`
- `20260827151119_repair_bond_originator_transaction_scope.sql`

These rows should not be replayed as SQL again until behavior smoke evidence is recorded.

### `consolidate_into_canonical_packet`

The bond-originator handoff repair should become one canonical packet before any later phase uses it:

- `20260827133506_repair_missing_roleplayer_bond_handoffs.sql`
- `20260827133739_repair_missing_roleplayer_bond_handoffs_execution.sql`

Keep the pair together in the review trail, but do not treat them as separate promotion candidates.

## Follow-Up

1. Keep the Phase 0 guard active.
2. Carry the three `apply` rows forward into the next reviewed staging step.
3. Carry the three `repair-only-after-smoke` rows forward only after smoke evidence is available.
4. Consolidate the bond-originator handoff pair before any promotion work.
