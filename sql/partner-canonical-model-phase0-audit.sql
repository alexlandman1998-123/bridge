-- Partner canonical model Phase 0 audit.
-- Aggregate and catalog output only; no contact details are selected.

begin read only;

select jsonb_build_object(
  'row_counts', jsonb_build_object(
    'organisation_preferred_partners', (select count(*) from public.organisation_preferred_partners),
    'organisation_partners', (select count(*) from public.organisation_partners),
    'partner_connections', (select count(*) from public.partner_connections),
    'partner_invitations', (select count(*) from public.partner_invitations),
    'transaction_role_players', (select count(*) from public.transaction_role_players)
  ),
  'preferred_partners', jsonb_build_object(
    'linked_to_organisation', (
      select count(*) from public.organisation_preferred_partners
      where partner_organisation_id is not null
    ),
    'external_only', (
      select count(*) from public.organisation_preferred_partners
      where partner_organisation_id is null
    ),
    'duplicate_linked_role_groups', (
      select count(*)
      from (
        select organisation_id, partner_organisation_id, partner_type
        from public.organisation_preferred_partners
        where partner_organisation_id is not null
        group by 1, 2, 3
        having count(*) > 1
      ) duplicates
    ),
    'duplicate_email_role_groups', (
      select count(*)
      from (
        select organisation_id, lower(trim(email_address)), partner_type
        from public.organisation_preferred_partners
        where nullif(trim(email_address), '') is not null
        group by 1, 2, 3
        having count(*) > 1
      ) duplicates
    )
  ),
  'relationship_overlap', jsonb_build_object(
    'organisation_partner_pairs', (
      select count(*)
      from (
        select least(organisation_id, partner_organisation_id),
               greatest(organisation_id, partner_organisation_id)
        from public.organisation_partners
        group by 1, 2
      ) pairs
    ),
    'partner_connection_pairs', (
      select count(*)
      from (
        select least(source_organization_id, target_organization_id),
               greatest(source_organization_id, target_organization_id)
        from public.partner_connections
        group by 1, 2
      ) pairs
    ),
    'pairs_in_both_models', (
      select count(*)
      from (
        select distinct
          least(op.organisation_id, op.partner_organisation_id),
          greatest(op.organisation_id, op.partner_organisation_id)
        from public.organisation_partners op
        join public.partner_connections pc
          on least(op.organisation_id, op.partner_organisation_id)
             = least(pc.source_organization_id, pc.target_organization_id)
         and greatest(op.organisation_id, op.partner_organisation_id)
             = greatest(pc.source_organization_id, pc.target_organization_id)
      ) overlapping_pairs
    )
  )
) as partner_model_metrics;

select jsonb_build_object(
  'role_player_linkage', jsonb_build_object(
    'with_preferred_partner_id', count(*) filter (where preferred_partner_id is not null),
    'with_relationship_id', count(*) filter (where partner_relationship_id is not null),
    'with_partner_organisation_id', count(*) filter (where partner_organisation_id is not null),
    'with_invitation_id', count(*) filter (where transaction_partner_invitation_id is not null),
    'with_prospect_id', count(*) filter (where partner_prospect_id is not null),
    'without_partner_identity_reference', count(*) filter (
      where preferred_partner_id is null
        and partner_relationship_id is null
        and partner_organisation_id is null
        and transaction_partner_invitation_id is null
        and partner_prospect_id is null
    )
  )
)
from public.transaction_role_players;

select selection_source, count(*) as row_count
from public.transaction_role_players
group by selection_source
order by selection_source;

select role_type, count(*) as row_count
from public.transaction_role_players
group by role_type
order by role_type;

select
  target.relname as target_table,
  source.relname as source_table,
  constraint_record.conname as constraint_name,
  pg_get_constraintdef(constraint_record.oid) as definition
from pg_constraint constraint_record
join pg_class source on source.oid = constraint_record.conrelid
join pg_class target on target.oid = constraint_record.confrelid
join pg_namespace source_namespace on source_namespace.oid = source.relnamespace
join pg_namespace target_namespace on target_namespace.oid = target.relnamespace
where constraint_record.contype = 'f'
  and source_namespace.nspname = 'public'
  and target_namespace.nspname = 'public'
  and target.relname in (
    'organisation_preferred_partners',
    'organisation_partners',
    'partner_connections',
    'partner_invitations',
    'transaction_role_players'
  )
order by target.relname, source.relname, constraint_record.conname;

select
  table_record.relname as table_name,
  table_record.relrowsecurity as rls_enabled,
  table_record.relforcerowsecurity as rls_forced,
  count(policy.policyname) as policy_count
from pg_class table_record
join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
left join pg_policies policy
  on policy.schemaname = namespace_record.nspname
 and policy.tablename = table_record.relname
where namespace_record.nspname = 'public'
  and table_record.relname in (
    'organisation_preferred_partners',
    'organisation_partners',
    'partner_connections',
    'partner_invitations',
    'partner_shared_resources',
    'transaction_role_players'
  )
group by table_record.relname, table_record.relrowsecurity, table_record.relforcerowsecurity
order by table_record.relname;

rollback;
