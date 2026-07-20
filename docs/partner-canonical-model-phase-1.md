# Unified Partner Directory — Phase 1

Date: 2026-07-20

Status: Implemented in source; not deployed

## Outcome

Migration `202607200008_unified_partner_directory_read_model.sql` introduces the read-only RPC:

```text
bridge_list_organisation_partner_directory(p_organisation_id uuid)
```

It returns one organisation-scoped partner directory assembled from:

- `organisation_partners` for platform organisation relationships;
- `organisation_preferred_partners` for external contacts and role/default configuration;
- `partner_invitations` for invitation lifecycle state.

No source table is mutated.

The migration was compiled successfully against the live production schema inside a transaction whose final statement was replaced with `ROLLBACK`. A follow-up catalog query confirmed that the RPC was not persisted.

## Directory identity

Stable directory keys use this priority:

1. `organisation:<partner_organisation_id>` for platform organisations.
2. `external:<organisation_preferred_partner_id>` for saved external contacts.
3. `invitation:<partner_invitation_id>` for an invitation that cannot yet be safely linked.

An outgoing invitation without a recipient organisation is joined to an existing external contact only on exact normalized email within the owning organisation. This affects presentation only and does not persist an identity merge.

## Returned state

The public directory state is deliberately small:

- `external`
- `invite_pending`
- `connected`
- `inactive`

Raw `connectionStatus` and `invitationStatus` are also returned so later UI and operational workflows do not lose lifecycle detail.

Roles are aggregated onto the partner instead of producing duplicate directory rows. Organisation types are normalized at the boundary, including:

- `attorney_firm` to `transfer_attorney`
- `agency` and `agency_network` to `referral_agency`
- `developer_company` to `developer`

## Authorization

The function is `security definer` with a fixed `public, pg_temp` search path. It requires:

- an authenticated user;
- an active membership in the requested organisation.

Execution is granted only to `authenticated`. The function returns `canManage` separately using the existing organisation-management contract.

This RPC provides a controlled read path around the Phase 0 preferred-partner RLS gap without broadening direct table access.

## Deployment gate

This migration has not been applied to staging or production. Before deployment:

1. Reconcile the production migration ledger baseline.
2. Resolve the missing preferred-partner RLS policies or formally route all access through controlled RPCs.
3. Reconcile the live preferred-partner role constraint with `cancellation_attorney`.
4. Apply to staging and test active member, non-member, linked partner, external partner, and pending invitation cases.
5. Confirm the existing Partners page and transaction selectors remain unchanged until the Phase 2 UI cutover.
