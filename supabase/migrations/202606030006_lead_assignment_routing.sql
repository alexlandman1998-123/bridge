alter table if exists public.leads
  add column if not exists assigned_queue_id text,
  add column if not exists assigned_at timestamptz,
  add column if not exists first_contacted_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists ownership_status text not null default 'awaiting_assignment';

alter table if exists public.leads
  drop constraint if exists leads_ownership_status_check;

alter table if exists public.leads
  add constraint leads_ownership_status_check
  check (
    ownership_status in (
      'awaiting_assignment',
      'assigned',
      'contacted',
      'working',
      'dormant',
      'escalated'
    )
  );

create index if not exists leads_assignment_owner_idx
  on public.leads (organisation_id, assigned_agent_id, assigned_queue_id);

create index if not exists leads_assignment_sla_idx
  on public.leads (organisation_id, ownership_status, sla_due_at);

create index if not exists leads_assigned_at_idx
  on public.leads (organisation_id, assigned_at desc);

create table if not exists public.lead_assignment_history (
  assignment_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  previous_agent_id uuid,
  new_agent_id uuid,
  previous_queue_id text,
  new_queue_id text,
  reason text,
  assignment_source text not null default 'manual',
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_assignment_history_org_idx
  on public.lead_assignment_history (organisation_id, created_at desc);

create index if not exists lead_assignment_history_lead_idx
  on public.lead_assignment_history (lead_id, created_at desc);

create index if not exists lead_assignment_history_new_agent_idx
  on public.lead_assignment_history (organisation_id, new_agent_id, created_at desc);

alter table public.lead_assignment_history enable row level security;

drop policy if exists lead_assignment_history_select_member on public.lead_assignment_history;
create policy lead_assignment_history_select_member
  on public.lead_assignment_history
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_assignment_history_insert_member on public.lead_assignment_history;
create policy lead_assignment_history_insert_member
  on public.lead_assignment_history
  for insert
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_assignment_history_update_member on public.lead_assignment_history;
create policy lead_assignment_history_update_member
  on public.lead_assignment_history
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));
