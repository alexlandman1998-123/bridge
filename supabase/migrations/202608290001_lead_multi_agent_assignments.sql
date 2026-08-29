begin;

create table if not exists public.lead_agent_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_role text not null default 'collaborator',
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_agent_assignments_role_check check (assignment_role in ('collaborator')),
  constraint lead_agent_assignments_status_check check (status in ('active', 'removed')),
  constraint lead_agent_assignments_unique unique (organisation_id, lead_id, user_id)
);

create index if not exists lead_agent_assignments_user_idx
  on public.lead_agent_assignments (organisation_id, user_id, status);
create index if not exists lead_agent_assignments_lead_idx
  on public.lead_agent_assignments (organisation_id, lead_id, status);

alter table public.lead_agent_assignments enable row level security;

create policy lead_agent_assignments_select on public.lead_agent_assignments
for select using (public.bridge_is_active_member(organisation_id));

create policy lead_agent_assignments_insert on public.lead_agent_assignments
for insert with check (public.bridge_is_active_member(organisation_id));

create policy lead_agent_assignments_update on public.lead_agent_assignments
for update using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

grant select, insert, update on public.lead_agent_assignments to authenticated;

commit;
