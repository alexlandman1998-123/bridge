create table if not exists public.bond_routing_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_type text not null,
  source_id text,
  source_name text,
  region_id uuid,
  branch_id uuid,
  consultant_id uuid references auth.users(id) on delete set null,
  priority integer not null default 100,
  status text not null default 'active',
  accepts_overflow boolean not null default true,
  maximum_capacity integer,
  overflow_destination_branch_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_routing_rules_rule_type_check
    check (rule_type in ('agency', 'development', 'region', 'company', 'branch')),
  constraint bond_routing_rules_status_check
    check (status in ('active', 'inactive', 'disabled'))
);

create unique index if not exists bond_routing_rules_active_source_uidx
  on public.bond_routing_rules (organisation_id, rule_type, coalesce(source_id, 'company'))
  where status = 'active';

create index if not exists bond_routing_rules_org_idx
  on public.bond_routing_rules (organisation_id, rule_type, priority, status);

create index if not exists bond_routing_rules_target_idx
  on public.bond_routing_rules (organisation_id, region_id, branch_id, consultant_id);

alter table public.bond_routing_rules enable row level security;

drop policy if exists bond_routing_rules_select_member on public.bond_routing_rules;
create policy bond_routing_rules_select_member
  on public.bond_routing_rules
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists bond_routing_rules_insert_member on public.bond_routing_rules;
create policy bond_routing_rules_insert_member
  on public.bond_routing_rules
  for insert
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists bond_routing_rules_update_member on public.bond_routing_rules;
create policy bond_routing_rules_update_member
  on public.bond_routing_rules
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

create table if not exists public.bond_routing_rule_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  routing_rule_id uuid references public.bond_routing_rules(id) on delete set null,
  bond_application_id uuid references public.transaction_bond_applications(id) on delete set null,
  application_reference text,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  constraint bond_routing_rule_activity_event_type_check
    check (event_type in ('ROUTING_RULE_CREATED', 'ROUTING_RULE_UPDATED', 'ROUTING_RULE_DISABLED', 'ROUTING_RULE_USED'))
);

create index if not exists bond_routing_rule_activity_org_idx
  on public.bond_routing_rule_activity (organisation_id, created_at desc);

create index if not exists bond_routing_rule_activity_rule_idx
  on public.bond_routing_rule_activity (routing_rule_id, created_at desc);

alter table public.bond_routing_rule_activity enable row level security;

drop policy if exists bond_routing_rule_activity_select_member on public.bond_routing_rule_activity;
create policy bond_routing_rule_activity_select_member
  on public.bond_routing_rule_activity
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists bond_routing_rule_activity_insert_member on public.bond_routing_rule_activity;
create policy bond_routing_rule_activity_insert_member
  on public.bond_routing_rule_activity
  for insert
  with check (public.bridge_is_active_member(organisation_id));
