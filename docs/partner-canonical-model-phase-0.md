# Partner Canonical Model — Phase 0 Architecture Decision

Date: 2026-07-20

Status: Complete

Scope: Architecture and aggregate production audit only. No runtime or production data was changed.

## Decision

The canonical partner model will use the following responsibilities:

| Responsibility | Canonical store | Decision |
| --- | --- | --- |
| Organisation identity | `organisations` | One platform organisation per legal/operating organisation. |
| Organisation relationship | `organisation_partners` | Canonical relationship between two platform organisations. |
| External contact and role defaults | `organisation_preferred_partners` initially | Retain as a one-sided operational record, but stop treating it as a second relationship model. It should later be separated into external-contact identity and partner-role/default configuration. |
| Organisation invitation | `partner_invitations` | Lifecycle for inviting an external contact or known organisation into a relationship. |
| Transaction assignment | `transaction_role_players` | Transaction-specific assignment with immutable contact snapshot and optional canonical partner references. |
| Newer duplicate relationship model | `partner_connections` | Freeze new adoption, provide compatibility adapters, migrate its lifecycle semantics into `organisation_partners`, then retire it. |

The user-facing concept should be **Partners**. “External”, “invite pending”, “connected”, “preferred”, and role names are states or filters, not separate directories.

## Why `organisation_partners` is canonical

The repository and production database both favour `organisation_partners`:

- The current Partners page reads its Connections view from `organisation_partners` through `partnersRepository.js`.
- Production contains 2 accepted `organisation_partners` relationships and 0 `partner_connections` rows.
- Eleven production foreign keys depend on `organisation_partners`, including transactions, transaction role players, routing rules, referrals, shared resources, permissions, campaigns, and attribution.
- No production foreign keys depend on `partner_connections`.
- Fifteen production SQL functions reference `organisation_partners`; ten reference `partner_connections`.
- `organisation_partners` prevents reversed duplicates using a unique index over the least/greatest organisation IDs. `partner_connections` only has a directional unique index.

`partner_connections` has a better audit lifecycle (`accepted_by`, `declined_by`, `blocked_by`, `removed_by`, and timestamps) and per-side preferred flags. Those fields should be folded into the canonical model rather than preserving a second relationship table.

## Current model semantics

### `organisation_preferred_partners`

This is a private operational address book and default-selection record. It holds:

- a role such as transfer attorney or bond originator;
- company and contact details;
- active/default flags;
- an optional `partner_organisation_id` when the contact maps to a platform organisation;
- developer/default scope information.

It can exist without invitation acceptance and therefore is not a mutual organisation relationship.

### `organisation_partners`

This is the current mutual organisation relationship and sharing contract. It holds:

- the unordered organisation pair;
- pending/accepted/declined/blocked state;
- relationship type, visibility, scope, preferred state, and metadata;
- references from collaboration, routing, attribution, transaction, and sharing modules.

### `partner_connections`

This is a newer overlapping relationship model. It adds a more complete actor/timestamp lifecycle and directional preference, but duplicates organisation pair, relationship type, and connection state.

### `partner_invitations`

This is an invitation workflow, not partner identity. Acceptance creates or repairs an organisation relationship. Invitations must link to the same unified directory record but remain a separate lifecycle table.

### `transaction_role_players`

This is the transaction snapshot and assignment record. It should continue preserving names and contact data as they were at assignment time, while optionally referencing the canonical relationship, platform organisation, invitation, prospect, or operational role/default.

## Production aggregate baseline

The production check was executed through a linked ephemeral database role inside `BEGIN READ ONLY` and rolled back.

| Metric | Result |
| --- | ---: |
| `organisation_partners` | 2 |
| Accepted organisation relationships | 2 |
| `partner_connections` | 0 |
| Relationship pairs present in both models | 0 |
| `organisation_preferred_partners` | 0 |
| `partner_invitations` | 1 |
| Pending partner invitations | 1 |
| `transaction_role_players` | 373 |
| Role players with `partner_relationship_id` | 8 |
| Role players with `partner_organisation_id` | 83 |
| Role players with `preferred_partner_id` | 0 |
| Role players with no partner identity reference | 290 |

Transaction role-player selection sources are:

| Source | Rows |
| --- | ---: |
| `manual` | 251 |
| `connected_partner` | 114 |
| `partner_routing_rule` | 8 |

The 114 `connected_partner` assignments exceed both the 83 platform-organisation references and 8 relationship references. This confirms that the label “connected” is not currently a reliable identity guarantee and must not be used as a migration key by itself.

## Dependency inventory

Production foreign keys into `organisation_partners`:

- `application_attribution.relationship_id`
- `attribution_events.relationship_id`
- `partner_campaign_links.relationship_id`
- `partner_campaigns.relationship_id`
- `partner_referrals.relationship_id`
- `partner_revenue_attribution.relationship_id`
- `partner_routing_rules.relationship_id`
- `partner_shared_resources.relationship_id`
- `partner_visibility_permissions.relationship_id`
- `transaction_role_players.partner_relationship_id`
- `transactions.partner_relationship_id`

Production foreign keys into `organisation_preferred_partners`:

- `private_listing_role_players.preferred_partner_id`
- `transaction_role_players.preferred_partner_id`

Application source-file reference counts, excluding tests and documentation aggregation:

| Model | Application files | Migration files | Edge-function files |
| --- | ---: | ---: | ---: |
| `organisation_preferred_partners` | 4 | 7 | 0 |
| `organisation_partners` | 5 | 14 | 1 |
| `partner_connections` | 0 direct table access | 4 | 0 |
| `partner_invitations` | 3 | 8 | 1 |
| `transaction_role_players` | 16 | 33 | 0 |

`partner_connections` is accessed by application RPC wrappers in `partnerNetworkService.js`, so its zero direct-table count does not mean it is unused in source code.

## Confirmed duplication paths

1. Adding a third party writes `organisation_preferred_partners`.
2. If “send invite” is selected, the page separately creates `partner_invitations`.
3. Invitation acceptance creates or repairs `organisation_partners`.
4. The original preferred-partner row is not atomically linked to the accepted organisation by the add/invite operation.
5. A connected attorney is adapted back into `organisation_preferred_partners` by a separate attorney-specific resolver.

This is one partner journey implemented across multiple records without a single stable directory identity.

## Role vocabulary

The canonical role vocabulary should initially be:

- `transfer_attorney`
- `bond_attorney`
- `cancellation_attorney`
- `bond_originator`
- `referral_agency`
- `developer`
- `agent`
- `other`

Organisation type and partner role must remain separate. For example, an `attorney_firm` organisation may provide transfer, bond, and cancellation attorney roles.

Existing `agency` values used as a preferred-partner type should map to `referral_agency` at the API/read-model boundary until the stored constraint is migrated.

## Identity and duplicate matching rules

Automatic linking is allowed only in this priority order:

1. Exact `partner_organisation_id`.
2. Exact canonical unordered organisation pair.
3. Accepted invitation with `recipient_organisation_id`.
4. Verified invitation email mapped to a confirmed organisation member/domain, with explicit acceptance context.

The following may generate review candidates but must not auto-merge:

- normalized email alone;
- company name alone;
- website/domain alone;
- phone number alone;
- fuzzy company-name similarity.

Every merge must preserve transaction snapshots and maintain an alias/audit record for replaced IDs.

## Release blockers discovered

### 1. Preferred-partner RLS has no policies

Production has row-level security enabled on `organisation_preferred_partners`, but `pg_policies` reports no policies for the table. The browser application reads and writes this table directly. This can make authenticated queries silently return no rows and prevent saves unless another privileged path is used.

This must be resolved before treating the current zero-row production count as proof that users have never attempted to add third parties.

### 2. Production role constraint is behind application vocabulary

The application offers `cancellation_attorney`, and migration `202607050006_preferred_partner_cancellation_attorney.sql` adds it. The live production constraint currently allows only:

- `agency`
- `bond_originator`
- `bond_attorney`
- `transfer_attorney`

Saving a cancellation attorney can therefore fail in production. Migration ledger/state reconciliation is required before Phase 1.

### 3. Production access verification baseline is stale

The production database was reachable, but the existing Phase 13 verifier expected 469 migration ledger rows while production currently contains 480. The audit queries were still executed read-only, but release evidence must reconcile the eleven-row difference before any schema rollout.

### 4. Relationship status and preference semantics conflict

- `organisation_partners` uses `accepted`; `partner_connections` uses `connected`.
- `organisation_partners` has `relationship_type = preferred` and a `preferred` boolean.
- `partner_connections` has separate `source_preferred` and `target_preferred` flags.

The canonical contract must use one lifecycle vocabulary and per-organisation preference, because “preferred” is not inherently mutual.

## Canonical contract for Phase 1

Phase 1 should expose a read-only unified record with at least:

```text
directory_id
owner_organisation_id
partner_organisation_id nullable
relationship_id nullable
external_partner_id nullable
display_name
primary_contact
roles[]
relationship_status: external | invite_pending | connected | inactive
invitation_status nullable
is_preferred
is_active
source
```

Rules:

- A connected platform organisation produces one directory record regardless of the number of roles.
- Roles are children/tags, not duplicate partner rows.
- An external contact may exist without a platform organisation.
- Invitation status decorates the external/known organisation record; it does not create a second directory identity.
- Transaction records retain snapshots and do not dynamically inherit later contact changes.

## Phase 0 exit criteria

- [x] Partner persistence models inventoried.
- [x] Application, SQL function, RLS, constraint, and foreign-key dependencies mapped.
- [x] Aggregate production row counts and overlap measured without exposing contact data.
- [x] Canonical organisation relationship model selected.
- [x] Role vocabulary and duplicate matching safety rules defined.
- [x] Current write duplication path confirmed.
- [x] Phase 1 unified read contract defined.
- [ ] RLS blocker repaired — belongs to implementation, not this read-only phase.
- [ ] Production migration ledger reconciled — required before the next schema rollout.
