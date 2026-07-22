# Partner canonical model — Phase 6

## Outcome

Partner assignments now point to `organisation_partner_roles.id`. This is the canonical, organisation-owned identity for assigning a partner to a transaction or private listing.

`preferred_partner_id` and `partner_relationship_id` remain temporarily as compatibility projections. Database triggers derive them from the canonical role configuration and resolve legacy writes to a canonical ID before the row is stored.

Manual and internal-user role players are intentionally unaffected. They may remain without a partner role configuration when they do not reference a partner identity.

## Enforcement

- Existing partner-linked assignments are backfilled using the transaction or listing owner, assignment role, and linked partner identity.
- A partner-linked row cannot be stored without `partner_role_configuration_id`.
- The role configuration must belong to the transaction/listing organisation and match the assignment role.
- Referenced role configurations cannot be deleted while historical assignments use them.
- New assignment options expose `partnerRoleConfigurationId` to the application.
- Private-listing attorney allocation uses a canonical v2 RPC with an old-backend fallback.

## Verification

- `npm run partner:phase6:verify`
- `npm run partner:phase6:compile`
- Run `sql/partner-canonical-model-phase6-reconciliation.sql` after deployment; every query must return zero rows.

The compile command applies Phases 1–6 against the linked database inside a transaction, runs reconciliation assertions, and rolls the transaction back.
