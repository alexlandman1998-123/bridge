-- Phase 7 privilege reconciliation. Every boolean must be false unless labelled canonical.

select
  has_table_privilege('authenticated', 'public.partner_connections', 'INSERT,UPDATE,DELETE')
    as authenticated_can_write_partner_connections,
  has_table_privilege('authenticated', 'public.organisation_preferred_partners', 'INSERT,UPDATE,DELETE')
    as authenticated_can_write_legacy_partner_contacts,
  has_table_privilege('authenticated', 'public.developer_partner_relationships', 'INSERT,UPDATE,DELETE')
    as authenticated_can_write_developer_partner_relationships;

select
  has_function_privilege(
    'authenticated',
    'public.bridge_allocate_private_listing_transfer_attorney(uuid,uuid,text,text,text,text,uuid,text,uuid,timestamptz,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute_legacy_listing_allocation,
  has_function_privilege(
    'authenticated',
    'public.bridge_phase4_list_partner_connections(uuid)',
    'EXECUTE'
  ) as authenticated_can_execute_legacy_connection_list;

-- These canonical grants must be true.
select
  has_function_privilege(
    'authenticated',
    'public.bridge_save_organisation_partner(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,jsonb)',
    'EXECUTE'
  ) as canonical_partner_save_available,
  has_function_privilege(
    'authenticated',
    'public.bridge_list_partner_connections_canonical(uuid)',
    'EXECUTE'
  ) as canonical_connection_list_available;

-- Historical legacy rows may remain, but no canonical relationship may be missing its role configuration.
select relationship.id, owner.organisation_id
from public.organisation_partners relationship
cross join lateral (values
  (relationship.organisation_id),
  (relationship.partner_organisation_id)
) owner(organisation_id)
left join public.organisation_partner_roles role_config
  on role_config.relationship_id = relationship.id
  and role_config.organisation_id = owner.organisation_id
where role_config.id is null;
