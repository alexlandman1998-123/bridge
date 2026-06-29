begin;

with eligible_members as (
  select distinct
    ou.organisation_id,
    ou.user_id as agent_user_id,
    ou.branch_id
  from public.organisation_users ou
  where ou.organisation_id is not null
    and ou.user_id is not null
    and lower(trim(coalesce(ou.membership_status, ou.status, ''))) in ('active', 'accepted')
    and lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, ''))) in (
      'agent',
      'principal',
      'admin',
      'branch_manager',
      'owner',
      'super_admin'
    )
),
alias_sources as (
  select *
  from (
    values
      ('General'::text, 'agent'::text),
      ('Property24'::text, 'agent_source'::text),
      ('Private Property'::text, 'agent_source'::text),
      ('Website'::text, 'agent_source'::text),
      ('Facebook'::text, 'agent_source'::text)
  ) as source_rows(source, routing_level)
),
computed_aliases as (
  select
    em.organisation_id,
    em.branch_id,
    em.agent_user_id,
    src.source,
    src.routing_level,
    left(
      public.bridge_lead_capture_slug(src.source, src.routing_level)
      || '-'
      || substring(md5(
        em.organisation_id::text
        || coalesce(em.agent_user_id::text, '')
        || coalesce(em.branch_id::text, '')
        || ''
        || lower(src.source)
        || lower(src.routing_level)
      ) from 1 for 10),
      64
    ) as alias_local_part
  from eligible_members em
  cross join alias_sources src
)
insert into public.lead_capture_aliases (
  organisation_id,
  branch_id,
  agent_user_id,
  listing_id,
  source,
  routing_level,
  alias_local_part,
  alias_domain,
  email_address,
  metadata_json,
  created_by
)
select
  organisation_id,
  branch_id,
  agent_user_id,
  null,
  source,
  routing_level,
  alias_local_part,
  'leads.arch9.co.za',
  lower(alias_local_part || '@leads.arch9.co.za'),
  jsonb_build_object('created_by', 'phase2_backfill_repair'),
  null
from computed_aliases
on conflict (lower(email_address)) do nothing;

commit;
