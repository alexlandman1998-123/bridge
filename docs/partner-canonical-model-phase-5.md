# Partner canonical model — Phase 5

## Outcome

Role, default, and scope configuration is now owned by `organisation_partner_roles`. A partner relationship answers **who is connected to whom**; a role configuration answers **how one organisation uses that partner**.

## Canonical ownership

- `organisation_partners`: bilateral relationship identity and lifecycle.
- `organisation_preferred_partners`: contact identity for partners that may exist without a Bridge organisation.
- `organisation_partner_roles`: organisation-owned role, active/default state, and operational scope.
- `transaction_role_players.partner_role_configuration_id` and `private_listing_role_players.partner_role_configuration_id`: assignment-time reference to the selected role configuration.

A role configuration references a relationship, an external identity, or both when those identities have been linked. Uniqueness is enforced per owner, identity, and role. Only one active default is allowed per owner and role.

## Compatibility and rollout

The legacy `partner_type`, preferred-default, and scope columns remain temporarily. Existing preferred-partner writes synchronously project into the canonical role table, and relationship changes ensure both sides have a role configuration. The Phase 1 directory RPC is wrapped so its `roles` array comes from the new table.

New application saves call the canonical role RPC after identity upsert. Older deployments continue to work because a missing Phase 5 RPC is treated as a compatibility fallback.

## Verification

- `npm run partner:phase5:verify`
- `npm run partner:phase5:compile`
- Run `sql/partner-canonical-model-phase5-reconciliation.sql` after deployment; every query must return zero rows.

The compile command applies Phases 1–5 together inside a linked transaction and rolls the transaction back. It does not deploy schema changes.
