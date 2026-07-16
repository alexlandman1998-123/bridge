begin;

create or replace view public.bridge_canonical_workspace_memberships_v1
with (security_invoker = true)
as
select
  ou.id as membership_id,
  ou.user_id,
  ou.organisation_id as source_workspace_id,
  coalesce(mapped_firm.id, ou.organisation_id) as canonical_workspace_id,
  'organisation_users'::text as membership_source,
  coalesce(nullif(trim(ou.workspace_type), ''), nullif(trim(org.type), ''), 'agency') as workspace_type,
  coalesce(
    nullif(trim(ou.workspace_role), ''),
    nullif(trim(ou.organization_role), ''),
    nullif(trim(ou.organisation_role), ''),
    nullif(trim(ou.role), ''),
    'viewer'
  ) as source_role,
  coalesce(nullif(trim(ou.membership_status), ''), nullif(trim(ou.status), ''), 'invited') as membership_status,
  coalesce(nullif(trim(org.logo_url), ''), nullif(trim(mapped_firm.logo_url), '')) is not null as logo_present,
  case
    when nullif(trim(mapped_firm.logo_url), '') is not null then 'attorney_firm_members'
    when nullif(trim(org.logo_url), '') is not null then 'organisation_users'
    else null
  end as branding_source,
  ou.created_at,
  ou.updated_at
from public.organisation_users ou
join public.organisations org on org.id = ou.organisation_id
left join lateral (
  select firm.id, firm.logo_url
  from public.attorney_firms firm
  where coalesce(nullif(trim(ou.workspace_type), ''), nullif(trim(org.type), '')) = 'attorney_firm'
    and (firm.organisation_id = ou.organisation_id or firm.id = ou.organisation_id)
  order by
    case when firm.id = ou.organisation_id then 0 else 1 end,
    firm.created_at,
    firm.id
  limit 1
) mapped_firm on true

union all

select
  afm.id as membership_id,
  afm.user_id,
  afm.firm_id as source_workspace_id,
  afm.firm_id as canonical_workspace_id,
  'attorney_firm_members'::text as membership_source,
  'attorney_firm'::text as workspace_type,
  coalesce(nullif(trim(afm.role), ''), 'candidate_attorney') as source_role,
  coalesce(nullif(trim(afm.status), ''), 'invited') as membership_status,
  coalesce(nullif(trim(branding.logo_url), ''), nullif(trim(firm.logo_url), '')) is not null as logo_present,
  case
    when coalesce(nullif(trim(branding.logo_url), ''), nullif(trim(firm.logo_url), '')) is not null
      then 'attorney_firm_members'
    else null
  end as branding_source,
  afm.created_at,
  afm.updated_at
from public.attorney_firm_members afm
join public.attorney_firms firm on firm.id = afm.firm_id
left join public.attorney_firm_branding branding on branding.firm_id = firm.id;

create or replace view public.bridge_workspace_membership_integrity_v1
with (security_invoker = true)
as
with grouped as (
  select
    projection.user_id,
    projection.canonical_workspace_id,
    max(projection.workspace_type) as workspace_type,
    count(*)::integer as membership_count,
    count(distinct projection.membership_source)::integer as membership_source_count,
    array_agg(distinct projection.membership_source) as membership_sources,
    (
      array_agg(
        projection.membership_source
        order by
          case
            when projection.workspace_type = 'attorney_firm'
              and projection.membership_source = 'attorney_firm_members' then 0
            when projection.membership_source = 'organisation_users' then 1
            else 2
          end,
          case when projection.membership_status in ('active', 'accepted') then 0 else 1 end,
          projection.membership_id
      )
    )[1] as selected_membership_source,
    bool_or(projection.membership_source = 'attorney_firm_members') as has_attorney_membership,
    bool_or(
      projection.membership_source = 'attorney_firm_members'
      and projection.membership_status in ('active', 'accepted')
    ) as has_active_attorney_membership,
    bool_or(
      projection.membership_source = 'organisation_users'
      and projection.membership_status in ('active', 'accepted')
    ) as has_active_organisation_membership,
    bool_or(projection.logo_present) as logo_present,
    bool_or(projection.source_workspace_id <> projection.canonical_workspace_id) as identity_normalized,
    max(projection.updated_at) as last_membership_update
  from public.bridge_canonical_workspace_memberships_v1 projection
  group by projection.user_id, projection.canonical_workspace_id
)
select
  grouped.*,
  case
    when grouped.workspace_type = 'attorney_firm' and not grouped.has_attorney_membership
      then 'missing_attorney_membership'
    when grouped.workspace_type = 'attorney_firm'
      and grouped.has_active_organisation_membership
      and not grouped.has_active_attorney_membership
      then 'inactive_attorney_membership'
    when grouped.workspace_type = 'attorney_firm' and not grouped.logo_present
      then 'unbranded'
    when grouped.membership_source_count > 1
      then 'healthy_overlap'
    else 'healthy_single_source'
  end as integrity_status
from grouped;

grant select on public.bridge_canonical_workspace_memberships_v1 to authenticated;
grant select on public.bridge_workspace_membership_integrity_v1 to authenticated;

comment on view public.bridge_canonical_workspace_memberships_v1 is
  'Phase 6 read-only canonical projection across organisation and attorney membership sources. Source records remain independent for authorization.';

comment on view public.bridge_workspace_membership_integrity_v1 is
  'Phase 6 integrity read model for membership overlap, canonical identity mapping, and logo availability without exposing logo URLs.';

commit;
