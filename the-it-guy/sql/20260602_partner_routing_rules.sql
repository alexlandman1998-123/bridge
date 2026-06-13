begin;

create extension if not exists "pgcrypto";

create table if not exists public.partner_routing_rules (
  id uuid primary key default gen_random_uuid(),
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  target_organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_name text not null default 'Routing Rule',
  is_active boolean not null default true,
  is_default boolean not null default false,
  assignment_priority integer not null default 500,
  source_scope text not null,
  source_context_id uuid,
  source_user_id uuid references public.profiles(id) on delete set null,
  source_scope_name text,
  target_scope text not null,
  target_role_type text,
  target_region_id uuid references public.workspace_regions(id) on delete set null,
  target_workspace_unit_id uuid references public.workspace_units(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  assignment_mode text not null default 'manual',
  target_scope_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_routing_rules_source_scope_check
    check (source_scope in ('organisation', 'region', 'branch', 'team', 'development', 'agent', 'user')),
  constraint partner_routing_rules_target_scope_check
    check (target_scope in ('organisation_queue', 'region', 'branch', 'team', 'consultant')),
  constraint partner_routing_rules_assignment_mode_check
    check (assignment_mode in ('direct_consultant', 'direct_attorney', 'direct_agent', 'branch_queue', 'team_queue', 'organisation_queue', 'manual', 'fallback_queue', 'round_robin')),
  constraint partner_routing_rules_assignment_priority_check
    check (assignment_priority >= 0)
);

create index if not exists partner_routing_rules_source_org_idx
  on public.partner_routing_rules (source_organisation_id, is_active, is_default, assignment_priority, rule_name);

create index if not exists partner_routing_rules_target_org_idx
  on public.partner_routing_rules (target_organisation_id, target_scope, target_region_id, target_workspace_unit_id, target_user_id);

create temp table if not exists __legacy_partner_routing_rules (
  source_organisation_id uuid,
  target_organisation_id uuid,
  rule_id text,
  rule_name text,
  is_active text,
  is_default text,
  assignment_priority text,
  source_scope text,
  source_context_id text,
  source_user_id text,
  source_scope_name text,
  target_scope text,
  target_region_id text,
  target_workspace_unit_id text,
  target_user_id text,
  assignment_mode text,
  target_scope_name text,
  notes text,
  created_at text,
  updated_at text
) on commit drop;

insert into __legacy_partner_routing_rules
  (source_organisation_id, target_organisation_id, rule_id, rule_name, is_active, is_default, assignment_priority, source_scope, source_context_id, source_user_id, source_scope_name, target_scope, target_region_id, target_workspace_unit_id, target_user_id, assignment_mode, target_scope_name, notes, created_at, updated_at)
select
  os.organisation_id as source_organisation_id,
  os.organisation_id as target_organisation_id,
  item ->> 'id',
  coalesce(
    nullif(trim(item ->> 'ruleName'), ''),
    nullif(trim(item ->> 'rule_name'), ''),
    nullif(trim(item ->> 'name'), ''),
    'Routing Rule'
  ) as rule_name,
  item ->> 'isActive',
  item ->> 'isDefault',
  coalesce(
    item ->> 'assignmentPriority',
    item ->> 'assignment_priority',
    '500'
  ) as assignment_priority,
  nullif(trim(coalesce(item ->> 'sourceScopeType', item ->> 'source_scope', item ->> 'source_scope_type')), ''),
  coalesce(item ->> 'sourceContextId', item ->> 'source_context_id', item ->> 'source_scope_id'),
  coalesce(item ->> 'sourceUserId', item ->> 'source_user_id', item ->> 'sourceConsultantUserId'),
  nullif(trim(item ->> 'sourceScopeName'), ''),
  nullif(trim(coalesce(item ->> 'targetScopeType', item ->> 'target_scope', item ->> 'target_scope_type')), ''),
  coalesce(item ->> 'targetRegionId', item ->> 'target_region_id'),
  coalesce(item ->> 'targetWorkspaceUnitId', item ->> 'target_workspace_unit_id', item ->> 'target_branch_id', item ->> 'target_team_id'),
  coalesce(item ->> 'targetConsultantUserId', item ->> 'targetConsultantId', item ->> 'target_user_id', item ->> 'targetUserId'),
  coalesce(
    nullif(trim(item ->> 'assignmentMode'), ''),
    nullif(trim(item ->> 'assignment_mode'), ''),
    nullif(trim(item ->> 'assignmentMethod'), ''),
    'manual'
  ),
  nullif(trim(item ->> 'targetScopeName'), ''),
  item ->> 'notes',
  item ->> 'createdAt',
  item ->> 'updatedAt'
from public.organisation_settings os
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(os.settings_json -> 'partnerRoutingRules') = 'array' then os.settings_json -> 'partnerRoutingRules'
    when jsonb_typeof(os.settings_json -> 'partner_routing_rules') = 'array' then os.settings_json -> 'partner_routing_rules'
    else '[]'::jsonb
  end
) item
where os.settings_json is not null
  and (
    jsonb_typeof(os.settings_json -> 'partnerRoutingRules') = 'array'
    or jsonb_typeof(os.settings_json -> 'partner_routing_rules') = 'array'
  );

with normalized_rules as (
  select
    r.source_organisation_id,
    r.target_organisation_id,
    case
      when nullif(trim(r.rule_id), '') is not null
        and trim(r.rule_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(r.rule_id)::uuid
      else null
    end as rule_id,
    coalesce(
      nullif(trim(r.rule_name), ''),
      'Routing Rule'
    ) as rule_name,
    case
      when lower(trim(r.is_active)) in ('true', 't', '1', 'yes', 'y') then true
      when lower(trim(r.is_active)) in ('false', 'f', '0', 'no', 'n') then false
      else true
    end as is_active,
    case
      when lower(trim(r.is_default)) in ('true', 't', '1', 'yes', 'y') then true
      when lower(trim(r.is_default)) in ('false', 'f', '0', 'no', 'n') then false
      else false
    end as is_default,
    case
      when regexp_replace(coalesce(r.assignment_priority, ''), '[^0-9]+', '', 'g') ~ '^[0-9]+$'
        then (regexp_replace(r.assignment_priority, '[^0-9]+', '', 'g'))::int
      else 500
    end as assignment_priority,
    case
      when lower(trim(coalesce(r.source_scope, 'organisation'))) in ('organisation', 'branch', 'team', 'development', 'agent')
        then lower(trim(r.source_scope))
      else 'organisation'
    end as source_scope,
    case
      when nullif(trim(r.source_context_id), '') is not null
        and trim(r.source_context_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(r.source_context_id)::uuid
      else null
    end as source_context_id,
    case
      when nullif(trim(r.source_user_id), '') is not null
        and trim(r.source_user_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(r.source_user_id)::uuid
      else null
    end as source_user_id,
    nullif(trim(r.source_scope_name), '') as source_scope_name,
    case
      when lower(trim(coalesce(r.target_scope, 'organisation_queue'))) in ('organisation_queue', 'region', 'branch', 'team', 'consultant')
        then lower(trim(r.target_scope))
      else 'organisation_queue'
    end as target_scope,
    case
      when nullif(trim(r.target_region_id), '') is not null
        and trim(r.target_region_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(r.target_region_id)::uuid
      else null
    end as target_region_id,
    case
      when nullif(trim(r.target_workspace_unit_id), '') is not null
        and trim(r.target_workspace_unit_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(r.target_workspace_unit_id)::uuid
      else null
    end as target_workspace_unit_id,
    case
      when nullif(trim(r.target_user_id), '') is not null
        and trim(r.target_user_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(r.target_user_id)::uuid
      else null
    end as target_user_id,
    case
      when lower(trim(r.assignment_mode)) in ('direct_consultant', 'team_queue', 'organisation_queue', 'manual', 'fallback_queue', 'round_robin')
        then lower(trim(r.assignment_mode))
      else 'manual'
    end as assignment_mode,
    nullif(trim(r.target_scope_name), '') as target_scope_name,
    nullif(trim(r.notes), '') as notes,
    case
      when r.created_at ~ '^\d{4}-\d{2}-\d{2}'
        then r.created_at::timestamptz
      else null
    end as created_at,
    case
      when r.updated_at ~ '^\d{4}-\d{2}-\d{2}'
        then r.updated_at::timestamptz
      else null
    end as updated_at
  from __legacy_partner_routing_rules r
),
sanitized_rules as (
  select
    source_organisation_id,
    target_organisation_id,
    coalesce(rule_id, gen_random_uuid()) as id,
    coalesce(
      nullif(rule_name, ''),
      'Routing Rule'
    ) as rule_name,
    is_active,
    is_default,
    assignment_priority,
    source_scope,
    case
      when source_scope = 'agent' then null
      else source_context_id
    end as source_context_id,
    case
      when source_scope = 'agent' then source_user_id
      else null
    end as source_user_id,
    source_scope_name,
    target_scope,
    case
      when target_scope = 'region' then target_region_id
      else null
    end as target_region_id,
    case
      when target_scope in ('branch', 'team') then target_workspace_unit_id
      else null
    end as target_workspace_unit_id,
    case
      when target_scope = 'consultant' then target_user_id
      else null
    end as target_user_id,
    assignment_mode,
    target_scope_name,
    notes,
    coalesce(created_at, now()) as created_at,
    coalesce(updated_at, now()) as updated_at
  from normalized_rules
)
insert into public.partner_routing_rules (
  id,
  source_organisation_id,
  target_organisation_id,
  rule_name,
  is_active,
  is_default,
  assignment_priority,
  source_scope,
  source_context_id,
  source_user_id,
  source_scope_name,
  target_scope,
  target_region_id,
  target_workspace_unit_id,
  target_user_id,
  assignment_mode,
  target_scope_name,
  notes,
  created_at,
  updated_at
)
select
  id,
  source_organisation_id,
  target_organisation_id,
  rule_name,
  is_active,
  is_default,
  assignment_priority,
  source_scope,
  source_context_id,
  source_user_id,
  source_scope_name,
  target_scope,
  target_region_id,
  target_workspace_unit_id,
  target_user_id,
  assignment_mode,
  target_scope_name,
  notes,
  created_at,
  updated_at
from sanitized_rules s
where not exists (
  select 1
  from public.partner_routing_rules pr
  where pr.source_organisation_id = s.source_organisation_id
    and pr.rule_name = s.rule_name
    and pr.source_scope = s.source_scope
    and pr.source_context_id is not distinct from s.source_context_id
    and pr.source_user_id is not distinct from s.source_user_id
    and pr.target_scope = s.target_scope
    and pr.target_region_id is not distinct from s.target_region_id
    and pr.target_workspace_unit_id is not distinct from s.target_workspace_unit_id
    and pr.target_user_id is not distinct from s.target_user_id
    and pr.assignment_mode = s.assignment_mode
    and pr.assignment_priority = s.assignment_priority
)
on conflict (id) do nothing;

alter table if exists public.partner_routing_rules enable row level security;

drop policy if exists partner_routing_rules_agency_select on public.partner_routing_rules;
create policy partner_routing_rules_agency_select on public.partner_routing_rules
for select to authenticated
using (public.bridge_is_active_member(source_organisation_id));

drop policy if exists partner_routing_rules_agency_write on public.partner_routing_rules;
create policy partner_routing_rules_agency_write on public.partner_routing_rules
for all to authenticated
using (
  public.bridge_is_org_admin(source_organisation_id)
  and source_organisation_id = target_organisation_id
)
with check (
  public.bridge_is_org_admin(source_organisation_id)
  and source_organisation_id = target_organisation_id
);

grant select, insert, update, delete on table public.partner_routing_rules to authenticated;

commit;
