-- Phase 2 workflow engine foundation.
-- Canonical workflow/state engine tables for rule-driven lifecycle control,
-- generated tasks, alerts, audit history, and parallel transaction lanes.

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  name text not null,
  workflow_type text not null,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_templates_type_check check (
    workflow_type in ('buyer', 'seller', 'transaction', 'transfer', 'bond', 'finance')
  )
);

create unique index if not exists workflow_templates_unique_active_idx
  on public.workflow_templates (coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid), workflow_type, name)
  where active = true;

create table if not exists public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references public.workflow_templates(id) on delete cascade,
  stage_key text not null,
  stage_name text not null,
  stage_order integer not null default 0,
  colour text,
  icon text,
  is_terminal boolean not null default false,
  is_locked boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_template_id, stage_key)
);

create table if not exists public.workflow_stage_requirements (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_id uuid not null references public.workflow_stages(id) on delete cascade,
  requirement_type text not null,
  requirement_key text not null,
  blocking boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_stage_id, requirement_type, requirement_key)
);

create table if not exists public.workflow_automations (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid references public.workflow_templates(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  trigger_event text not null,
  trigger_stage text,
  action_type text not null,
  action_config_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_permissions (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid references public.workflow_templates(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  role_key text not null,
  permission_key text not null,
  allowed boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (
    workflow_template_id,
    organisation_id,
    role_key,
    permission_key
  )
);

create table if not exists public.workflow_audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  workflow_type text not null,
  entity_type text not null,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  from_stage text,
  to_stage text,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  allowed boolean not null default true,
  override_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_generated_tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  workflow_type text not null,
  trigger_event text not null,
  entity_type text not null,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  task_id uuid,
  title text not null,
  description text,
  assigned_role text,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open',
  priority text not null default 'medium',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_alerts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  workflow_type text not null,
  alert_type text not null,
  severity text not null default 'info',
  status text not null default 'open',
  title text not null,
  message text,
  entity_type text not null,
  entity_id uuid,
  lead_id uuid references public.leads(lead_id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  assigned_role text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_alerts_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint workflow_alerts_status_check check (status in ('open', 'acknowledged', 'resolved', 'dismissed'))
);

create table if not exists public.transaction_workflow_lanes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  lane_type text not null,
  current_stage text not null,
  status text not null default 'active',
  blocked boolean not null default false,
  blocked_reason text,
  owner_role text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_workflow_lanes_type_check check (lane_type in ('main', 'finance', 'transfer', 'bond')),
  constraint transaction_workflow_lanes_status_check check (status in ('pending', 'active', 'blocked', 'completed', 'cancelled')),
  unique (transaction_id, lane_type)
);

create index if not exists workflow_templates_org_type_idx on public.workflow_templates (organisation_id, workflow_type, active);
create index if not exists workflow_stages_template_order_idx on public.workflow_stages (workflow_template_id, stage_order);
create index if not exists workflow_requirements_stage_idx on public.workflow_stage_requirements (workflow_stage_id, blocking);
create index if not exists workflow_automations_trigger_idx on public.workflow_automations (organisation_id, trigger_event, trigger_stage, active);
create index if not exists workflow_audit_org_created_idx on public.workflow_audit_log (organisation_id, created_at desc);
create index if not exists workflow_audit_lead_idx on public.workflow_audit_log (lead_id, created_at desc);
create index if not exists workflow_audit_transaction_idx on public.workflow_audit_log (transaction_id, created_at desc);
create index if not exists workflow_generated_tasks_org_status_idx on public.workflow_generated_tasks (organisation_id, status, due_at);
create index if not exists workflow_generated_tasks_lead_idx on public.workflow_generated_tasks (lead_id, created_at desc);
create index if not exists workflow_alerts_org_status_idx on public.workflow_alerts (organisation_id, status, severity, due_at);
create index if not exists workflow_alerts_transaction_idx on public.workflow_alerts (transaction_id, status, due_at);
create index if not exists transaction_workflow_lanes_transaction_idx on public.transaction_workflow_lanes (transaction_id, lane_type);
create index if not exists transaction_workflow_lanes_org_status_idx on public.transaction_workflow_lanes (organisation_id, lane_type, status, blocked);

drop trigger if exists workflow_templates_set_updated_at on public.workflow_templates;
create trigger workflow_templates_set_updated_at
before update on public.workflow_templates
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists workflow_automations_set_updated_at on public.workflow_automations;
create trigger workflow_automations_set_updated_at
before update on public.workflow_automations
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists workflow_generated_tasks_set_updated_at on public.workflow_generated_tasks;
create trigger workflow_generated_tasks_set_updated_at
before update on public.workflow_generated_tasks
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists workflow_alerts_set_updated_at on public.workflow_alerts;
create trigger workflow_alerts_set_updated_at
before update on public.workflow_alerts
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists transaction_workflow_lanes_set_updated_at on public.transaction_workflow_lanes;
create trigger transaction_workflow_lanes_set_updated_at
before update on public.transaction_workflow_lanes
for each row
execute function public.bridge_set_updated_at();

alter table if exists public.workflow_templates enable row level security;
alter table if exists public.workflow_stages enable row level security;
alter table if exists public.workflow_stage_requirements enable row level security;
alter table if exists public.workflow_automations enable row level security;
alter table if exists public.workflow_permissions enable row level security;
alter table if exists public.workflow_audit_log enable row level security;
alter table if exists public.workflow_generated_tasks enable row level security;
alter table if exists public.workflow_alerts enable row level security;
alter table if exists public.transaction_workflow_lanes enable row level security;

drop policy if exists workflow_templates_org_members on public.workflow_templates;
create policy workflow_templates_org_members
  on public.workflow_templates
  for all
  using (
    organisation_id is null
    or public.bridge_is_active_member(organisation_id)
  )
  with check (
    organisation_id is null
    or public.bridge_is_active_member(organisation_id)
  );

drop policy if exists workflow_stages_template_members on public.workflow_stages;
create policy workflow_stages_template_members
  on public.workflow_stages
  for all
  using (
    exists (
      select 1 from public.workflow_templates wt
      where wt.id = workflow_stages.workflow_template_id
        and (
          wt.organisation_id is null
          or public.bridge_is_active_member(wt.organisation_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.workflow_templates wt
      where wt.id = workflow_stages.workflow_template_id
        and (
          wt.organisation_id is null
          or public.bridge_is_active_member(wt.organisation_id)
        )
    )
  );

drop policy if exists workflow_stage_requirements_template_members on public.workflow_stage_requirements;
create policy workflow_stage_requirements_template_members
  on public.workflow_stage_requirements
  for all
  using (
    exists (
      select 1
      from public.workflow_stages ws
      join public.workflow_templates wt on wt.id = ws.workflow_template_id
      where ws.id = workflow_stage_requirements.workflow_stage_id
        and (
          wt.organisation_id is null
          or public.bridge_is_active_member(wt.organisation_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.workflow_stages ws
      join public.workflow_templates wt on wt.id = ws.workflow_template_id
      where ws.id = workflow_stage_requirements.workflow_stage_id
        and (
          wt.organisation_id is null
          or public.bridge_is_active_member(wt.organisation_id)
        )
    )
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workflow_automations',
    'workflow_permissions',
    'workflow_audit_log',
    'workflow_generated_tasks',
    'workflow_alerts',
    'transaction_workflow_lanes'
  ]
  loop
    execute format('drop policy if exists %I_org_members on public.%I', table_name, table_name);
    execute format(
      'create policy %I_org_members on public.%I for all using (
        organisation_id is null or public.bridge_is_active_member(organisation_id)
      ) with check (
        organisation_id is null or public.bridge_is_active_member(organisation_id)
      )',
      table_name,
      table_name
    );
  end loop;
end $$;

grant select, insert, update on public.workflow_templates to authenticated;
grant select, insert, update on public.workflow_stages to authenticated;
grant select, insert, update on public.workflow_stage_requirements to authenticated;
grant select, insert, update on public.workflow_automations to authenticated;
grant select, insert, update on public.workflow_permissions to authenticated;
grant select, insert on public.workflow_audit_log to authenticated;
grant select, insert, update on public.workflow_generated_tasks to authenticated;
grant select, insert, update on public.workflow_alerts to authenticated;
grant select, insert, update on public.transaction_workflow_lanes to authenticated;

with buyer_template as (
  insert into public.workflow_templates (name, workflow_type, organisation_id, active, metadata_json)
  values ('Buyer Workflow', 'buyer', null, true, '{"version":"phase_2"}'::jsonb)
  on conflict do nothing
  returning id
),
template as (
  select id from buyer_template
  union all
  select id from public.workflow_templates
  where workflow_type = 'buyer'
    and name = 'Buyer Workflow'
    and organisation_id is null
  limit 1
),
stages(stage_key, stage_name, stage_order, colour, icon, is_terminal) as (
  values
    ('new_lead', 'New Lead', 10, '#dbeafe', 'user-plus', false),
    ('contacted', 'Contacted', 20, '#e0f2fe', 'phone', false),
    ('qualified', 'Qualified', 30, '#dcfce7', 'badge-check', false),
    ('viewing_scheduled', 'Viewing Scheduled', 40, '#fef3c7', 'calendar', false),
    ('viewing_completed', 'Viewing Completed', 50, '#fde68a', 'check-circle', false),
    ('offer_draft', 'Offer Draft', 60, '#e9d5ff', 'file-edit', false),
    ('offer_submitted', 'Offer Submitted', 70, '#ddd6fe', 'send', false),
    ('negotiating', 'Negotiating', 80, '#fed7aa', 'messages-square', false),
    ('offer_accepted', 'Offer Accepted', 90, '#bbf7d0', 'handshake', false),
    ('onboarding', 'Onboarding', 100, '#bfdbfe', 'clipboard-list', false),
    ('finance', 'Finance', 110, '#c7d2fe', 'banknote', false),
    ('transfer', 'Transfer', 120, '#bae6fd', 'scale', false),
    ('registered', 'Registered', 130, '#bbf7d0', 'shield-check', true),
    ('lost', 'Lost', 999, '#fecaca', 'archive', true)
)
insert into public.workflow_stages (workflow_template_id, stage_key, stage_name, stage_order, colour, icon, is_terminal)
select template.id, stages.stage_key, stages.stage_name, stages.stage_order, stages.colour, stages.icon, stages.is_terminal
from template
cross join stages
on conflict (workflow_template_id, stage_key) do nothing;

with template as (
  select id from public.workflow_templates
  where workflow_type = 'buyer'
    and name = 'Buyer Workflow'
    and organisation_id is null
  limit 1
),
requirements(stage_key, requirement_type, requirement_key, blocking, metadata_json) as (
  values
    ('viewing_completed', 'appointment', 'completed_viewing', true, '{"appointment_type":"viewing","status":"completed"}'::jsonb),
    ('offer_submitted', 'offer', 'submitted_offer', true, '{"status":"submitted"}'::jsonb),
    ('offer_accepted', 'offer', 'accepted_offer', true, '{"status":"accepted"}'::jsonb),
    ('onboarding', 'offer', 'accepted_offer', true, '{"status":"accepted"}'::jsonb),
    ('finance', 'transaction', 'transaction_created', true, '{"source":"accepted_offer"}'::jsonb),
    ('transfer', 'finance', 'finance_lane_active', false, '{"lane_type":"finance"}'::jsonb),
    ('registered', 'transfer', 'transfer_registered', true, '{"lane_type":"transfer","stage":"registered"}'::jsonb)
)
insert into public.workflow_stage_requirements (workflow_stage_id, requirement_type, requirement_key, blocking, metadata_json)
select ws.id, requirements.requirement_type, requirements.requirement_key, requirements.blocking, requirements.metadata_json
from template
join public.workflow_stages ws on ws.workflow_template_id = template.id
join requirements on requirements.stage_key = ws.stage_key
on conflict (workflow_stage_id, requirement_type, requirement_key) do nothing;
