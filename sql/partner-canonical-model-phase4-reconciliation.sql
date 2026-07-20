begin read only;

select
  (select count(*) from public.organisation_partners) as canonical_relationship_count,
  (select count(*) from public.partner_connections) as legacy_relationship_count,
  (select count(*) from public.partner_relationship_aliases) as relationship_alias_count;

select
  legacy.id as legacy_connection_id,
  legacy.source_organization_id,
  legacy.target_organization_id,
  alias.canonical_relationship_id
from public.partner_connections legacy
left join public.partner_relationship_aliases alias
  on alias.alias_connection_id = legacy.id
where alias.canonical_relationship_id is null;

select
  assignment.id as assignment_id,
  assignment.partner_connection_id,
  assignment.partner_relationship_id
from public.transaction_partner_assignments assignment
where assignment.partner_connection_id is not null
  and assignment.partner_relationship_id is null;

select
  routine.proname as function_name
from pg_proc routine
join pg_namespace namespace on namespace.oid = routine.pronamespace
where namespace.nspname = 'public'
  and routine.prokind = 'f'
  and routine.prosrc ilike '%public.partner_connections%'
  and routine.proname not in ('bridge_reject_legacy_partner_connection_write')
order by routine.proname;

rollback;
