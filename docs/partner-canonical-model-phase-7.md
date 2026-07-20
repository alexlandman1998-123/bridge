# Partner canonical model — Phase 7

## Outcome

Legacy partner paths are retired for authenticated application traffic. The supported runtime contract is now:

- `organisation_partners` for bilateral relationships;
- `organisation_partner_roles` for role, default, scope, and assignment identity;
- canonical partner command and query RPCs for application access;
- `partner_role_configuration_id` for partner-backed transaction and listing assignments.

## Retired paths

- Direct writes to `partner_connections`.
- Direct writes to role/default fields in `organisation_preferred_partners`.
- Authenticated writes to developer-specific relationship/agreement tables.
- The Phase 3 identity-only save RPC.
- The legacy private-listing attorney allocation RPC.
- Direct access to the internal Phase 1 and Phase 5 directory implementations.
- The old Phase 4 connection-list RPC.
- Application fallbacks that wrote legacy tables or silently accepted missing canonical RPCs.

Historical tables and projection columns are retained for auditability and server-side transition code. They are not supported application write surfaces.

## Application cutover

- Partner saves/removals use `bridge_save_organisation_partner` and `bridge_remove_organisation_partner`.
- Connection lists use `bridge_list_partner_connections_canonical` and expose role-configuration IDs.
- Private-listing attorney allocations require the canonical v2 RPC.
- The developer-specific Partners route redirects to the unified `/partners` workspace.
- Development defaults load through the canonical partner-assignment option query.

Existing developer invitation-token reads remain temporarily available for already-issued links. No new authenticated developer-specific relationships can be created.

## Verification

- `npm run partner:phase7:verify`
- `npm run partner:phase7:compile`
- Run `sql/partner-canonical-model-phase7-reconciliation.sql` after deployment.

The compile command applies Phases 1–7, validates grants and revocations, and rolls the linked transaction back.
