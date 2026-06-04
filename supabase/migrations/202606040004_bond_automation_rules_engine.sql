create table if not exists public.bond_automation_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  category text not null,
  trigger jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_automation_rules_status_check check (status in ('active', 'disabled', 'draft')),
  constraint bond_automation_rules_category_check check (category in ('Applications', 'Documents', 'Partners', 'Consultants', 'Branches', 'Regions', 'Banks', 'Revenue', 'SLA', 'Communications'))
);

create table if not exists public.bond_automation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_id uuid references public.bond_automation_rules(id) on delete set null,
  entity_id text not null,
  entity_type text not null,
  result text not null default 'success',
  action_results jsonb not null default '[]'::jsonb,
  executed_at timestamptz not null default now(),
  constraint bond_automation_runs_result_check check (result in ('success', 'failed', 'skipped', 'simulated'))
);

create table if not exists public.bond_automation_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_id uuid references public.bond_automation_rules(id) on delete set null,
  rule_name text,
  entity_id text,
  entity_type text,
  action_type text not null,
  event_type text not null,
  result text not null default 'success',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bond_automation_history_result_check check (result in ('success', 'failed', 'skipped', 'simulated'))
);

create table if not exists public.bond_automation_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  category text not null,
  channel text not null default 'email',
  subject text,
  body text,
  sequence jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_automation_templates_status_check check (status in ('active', 'disabled', 'draft')),
  constraint bond_automation_templates_channel_check check (channel in ('email', 'portal', 'sms', 'whatsapp', 'task'))
);

create table if not exists public.bond_automation_recommendations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  impact integer not null default 0,
  status text not null default 'open',
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  constraint bond_automation_recommendations_status_check check (status in ('open', 'accepted', 'dismissed'))
);

create index if not exists bond_automation_rules_scope_idx
  on public.bond_automation_rules (organisation_id, status, category, created_at desc);

create index if not exists bond_automation_runs_scope_idx
  on public.bond_automation_runs (organisation_id, rule_id, result, executed_at desc);

create index if not exists bond_automation_runs_entity_idx
  on public.bond_automation_runs (organisation_id, entity_type, entity_id, executed_at desc);

create index if not exists bond_automation_history_scope_idx
  on public.bond_automation_history (organisation_id, rule_id, event_type, created_at desc);

create index if not exists bond_automation_templates_scope_idx
  on public.bond_automation_templates (organisation_id, status, category);

create index if not exists bond_automation_recommendations_scope_idx
  on public.bond_automation_recommendations (organisation_id, status, category, created_at desc);

alter table public.bond_automation_rules enable row level security;
alter table public.bond_automation_runs enable row level security;
alter table public.bond_automation_history enable row level security;
alter table public.bond_automation_templates enable row level security;
alter table public.bond_automation_recommendations enable row level security;

drop policy if exists "bond_automation_rules_member_select" on public.bond_automation_rules;
create policy "bond_automation_rules_member_select"
on public.bond_automation_rules
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_rules_member_modify" on public.bond_automation_rules;
create policy "bond_automation_rules_member_modify"
on public.bond_automation_rules
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_runs_member_select" on public.bond_automation_runs;
create policy "bond_automation_runs_member_select"
on public.bond_automation_runs
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_runs_member_modify" on public.bond_automation_runs;
create policy "bond_automation_runs_member_modify"
on public.bond_automation_runs
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_history_member_select" on public.bond_automation_history;
create policy "bond_automation_history_member_select"
on public.bond_automation_history
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_history_member_modify" on public.bond_automation_history;
create policy "bond_automation_history_member_modify"
on public.bond_automation_history
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_templates_member_select" on public.bond_automation_templates;
create policy "bond_automation_templates_member_select"
on public.bond_automation_templates
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_templates_member_modify" on public.bond_automation_templates;
create policy "bond_automation_templates_member_modify"
on public.bond_automation_templates
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_recommendations_member_select" on public.bond_automation_recommendations;
create policy "bond_automation_recommendations_member_select"
on public.bond_automation_recommendations
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_automation_recommendations_member_modify" on public.bond_automation_recommendations;
create policy "bond_automation_recommendations_member_modify"
on public.bond_automation_recommendations
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
