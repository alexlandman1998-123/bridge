# Supabase RLS Phase 0 Policy Classification

Generated: 2026-08-14

## Decision

| Field | Value |
| --- | --- |
| Status | PHASE_0_READY |
| Scope | 8 public tables reported by Supabase advisor with RLS disabled |
| Environment | Linked production read-only inspection plus local migration/source review |
| Database mutation | none |
| Next phase | Phase 1 internal controls: `matter_number_sequences`, `bond_rls_cutover_exclusions` |

Phase 0 classifies the flagged tables and defines the intended access model before any RLS migration is written or applied.

## Principles

- Enable RLS on `public` tables before exposing them through `anon` or `authenticated`.
- Use explicit `TO anon` or `TO authenticated` policy clauses.
- Do not use `TO authenticated` by itself as authorization; include an organisation, transaction, assignment, or admin predicate.
- Prefer existing helpers before adding new helpers:
  - `public.bridge_is_active_member(uuid)`
  - `public.bridge_is_org_admin(uuid)`
  - `public.bridge_has_workspace_permission(uuid, text)`
  - `public.bridge_has_transaction_permission(uuid, text)`
  - `public.bridge_has_bond_transaction_participant_access(uuid)`
- Keep internal control, sequence, diagnostic, and financial writes off direct browser access unless a specific UI workflow proves otherwise.

## Classification Matrix

| Table | Class | Risk | Anon | Authenticated Read | Authenticated Write | Phase 1 Direction |
| --- | --- | --- | --- | --- | --- | --- |
| `matter_number_sequences` | internal sequence/control | high | none | none by default | none | Enable RLS, revoke direct table access, keep mutation behind `next_matter_number()` and trigger path. |
| `bond_rls_cutover_exclusions` | internal security control | high | none | admin/compliance only, if UI needs it | admin/compliance or service only | Enable RLS with no public access; prefer no delete, use `active = false`. |
| `workspace_regions` | workspace hierarchy reference | medium | none | active member of `workspace_id` | org admin or workspace hierarchy manager | Member read, admin/manager create/update, no hard delete. |
| `workspace_units` | workspace hierarchy reference | medium | none | active member of `workspace_id` | org admin or workspace hierarchy manager | Same as regions; later narrow branch visibility if needed. |
| `transaction_document_requirements` | transaction-scoped read model | high | none by default | transaction participant with `view_documents` or `view_transaction` | RPC/service by default | Add transaction-scoped read; verify write path before direct client writes. |
| `transaction_lifecycle_workflows` | transaction-scoped workflow state | high | none | transaction participant with `view_transaction` | workflow RPC or coordinator role only | Add transaction-scoped read; keep state changes controlled. |
| `transaction_commissions` | financial org/transaction scoped | critical | none unless explicitly approved | org admin/principal, assigned agent, or transaction participant | org admin or server-controlled | Remove anon access in staging first; financial write policies need extra smoke. |
| `transaction_rollup_validation` | internal diagnostic validation | medium | none | admin/HQ diagnostics only | validation job/service only | Prefer admin-only read because `transaction_id` is text and payloads are diagnostic snapshots. |

## Table Notes

### `matter_number_sequences`

The table stores sequence state for matter number generation. Existing migration `202605240005_matter_number_foundation.sql` grants `select` to `authenticated`, but normal users should not need direct sequence-table access. The existing `next_matter_number()` and `assign_transaction_matter_number()` function/trigger path should own mutation.

Phase 1 gate:
- authenticated direct table access is blocked or returns no rows;
- creating a transaction through the normal path still assigns a matter number.

### `bond_rls_cutover_exclusions`

This is a security-control table keyed by `transaction_id`. The safest default is no `anon`, no broad member read, and no hard delete. If the product needs UI access, use the bond workspace derived from `bridge_bond_transaction_workspace_id(transaction_id)` and restrict to org admin/compliance roles.

Phase 1 gate:
- admin/compliance can read or manage approved rows;
- normal authenticated users cannot see exclusions;
- bond RLS shadow safety tests still pass.

### `workspace_regions` and `workspace_units`

Both are workspace hierarchy reference tables with `workspace_id`. Members need read access to render hierarchy pages. Writes should be limited to org admins or workspace roles with hierarchy-management permission. Deletes should be avoided in favor of `active = false`.

Phase 1 gate:
- bond hierarchy UI loads for workspace members;
- cross-workspace rows are hidden;
- admin can create/update a region/unit;
- non-admin member cannot mutate hierarchy rows.

### `transaction_document_requirements`

This is a generated transaction read model. Reads should follow transaction participant permissions. Writes should stay behind resolver/RPC/service paths unless the UI has a direct-edit path that is explicitly approved.

Phase 1 gate:
- transaction participant can read requirements for that transaction;
- unrelated transaction requirements are hidden;
- resolver/upsert workflow still works.

### `transaction_lifecycle_workflows`

This is canonical transaction workflow state. Reads should follow transaction access. Writes are high-impact and should remain controlled by workflow RPC/service paths or explicit coordinator permissions.

Phase 1 gate:
- transaction workspace/lifecycle UI still loads;
- allowed workflow progression still works;
- unrelated workflow rows are hidden.

### `transaction_commissions`

This is financial data. Existing migration `202605230001_agent_dashboard_transaction_compat.sql` grants broad authenticated write and anon select. Phase 0 classifies that as the highest-risk direct exposure. The recommended default is no anon access, read for org admins/principals and assigned agents, and restricted writes.

Phase 1 gate:
- anon cannot read commission rows;
- principal dashboard still loads expected organisation rows;
- assigned agent can read own commission rows;
- non-assigned users cannot read other agents' commission rows.

### `transaction_rollup_validation`

This table contains diagnostic comparison snapshots. The `transaction_id` column is text, not uuid, so a transaction-scoped policy would need a safe cast or an admin-only posture. Phase 0 recommends admin/HQ diagnostics only unless a user-facing diagnostic view requires narrower participant access.

Phase 1 gate:
- admin diagnostics/rollup audit views still load;
- non-admin users cannot read diagnostic rows;
- validation job/service writes still work.

## Open Questions

- Does any public/anon portal intentionally read `transaction_commissions`?
- Do client-side screens directly insert/update `transaction_document_requirements` or `transaction_lifecycle_workflows`, or are writes fully RPC/server controlled?
- Should `bond_rls_cutover_exclusions` be visible to compliance users in UI, or service-only?
- Should `transaction_rollup_validation` remain admin-only despite having a transaction identifier?

## Recommended Next Phase

Start Phase 1 with:

1. `matter_number_sequences`
2. `bond_rls_cutover_exclusions`

These have the smallest user-facing blast radius and high security value. After those pass staging smoke, continue to workspace hierarchy, then transaction-scoped tables, then financial commissions.
