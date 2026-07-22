begin;

create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  task_id uuid primary key default gen_random_uuid(),
  id uuid generated always as (task_id) stored,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid references public.leads(lead_id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  assigned_agent_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  title text not null default 'Follow-up',
  description text,
  due_date date,
  status text not null default 'Pending',
  priority text not null default 'Medium',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `create table if not exists` does not add columns to the legacy task table.
-- Bring that table forward before the canonical indexes and API surface use them.
alter table public.tasks
  add column if not exists id uuid generated always as (task_id) stored;
alter table public.tasks
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
alter table public.tasks
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists tasks_id_unique_idx on public.tasks (id);
create index if not exists tasks_org_updated_idx on public.tasks (organisation_id, updated_at desc);
create index if not exists tasks_org_lead_idx on public.tasks (organisation_id, lead_id, updated_at desc) where lead_id is not null;
create index if not exists tasks_org_transaction_idx on public.tasks (organisation_id, transaction_id, updated_at desc) where transaction_id is not null;
create index if not exists tasks_org_assignee_idx on public.tasks (organisation_id, assigned_agent_id, due_date) where assigned_agent_id is not null;

alter table public.tasks enable row level security;

drop policy if exists tasks_org_members_select on public.tasks;
create policy tasks_org_members_select
  on public.tasks
  for select
  to authenticated
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists tasks_org_members_insert on public.tasks;
create policy tasks_org_members_insert
  on public.tasks
  for insert
  to authenticated
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists tasks_org_members_update on public.tasks;
create policy tasks_org_members_update
  on public.tasks
  for update
  to authenticated
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists tasks_org_members_delete on public.tasks;
create policy tasks_org_members_delete
  on public.tasks
  for delete
  to authenticated
  using (public.bridge_is_active_member(organisation_id));

grant select, insert, update, delete on public.tasks to authenticated;

create or replace function public.bridge_delete_agency_lead(
  p_organisation_id uuid,
  p_lead_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead public.leads%rowtype;
begin
  if p_organisation_id is null or p_lead_id is null then
    return false;
  end if;

  select *
    into target_lead
  from public.leads
  where organisation_id = p_organisation_id
    and lead_id = p_lead_id
  limit 1;

  if target_lead.lead_id is null then
    return false;
  end if;

  if not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'You do not have permission to delete this lead.'
      using errcode = '42501';
  end if;

  if to_regclass('public.appointments') is not null then
    update public.appointments
       set lead_id = null,
           updated_at = now()
     where organisation_id = p_organisation_id
       and lead_id = p_lead_id;
  end if;

  if to_regclass('public.lead_activities') is not null then
    delete from public.lead_activities
     where organisation_id = p_organisation_id
       and lead_id = p_lead_id;
  end if;

  if to_regclass('public.tasks') is not null then
    delete from public.tasks
     where organisation_id = p_organisation_id
       and lead_id = p_lead_id;
  end if;

  if to_regclass('public.crm_deals') is not null then
    update public.crm_deals
       set lead_id = null,
           updated_at = now()
     where organisation_id = p_organisation_id
       and lead_id = p_lead_id;
  end if;

  if to_regclass('public.document_packets') is not null then
    update public.document_packets
       set lead_id = null,
           updated_at = now()
     where organisation_id = p_organisation_id
       and lead_id = p_lead_id;
  end if;

  delete from public.leads
   where organisation_id = p_organisation_id
     and lead_id = p_lead_id;

  return true;
end;
$$;

grant execute on function public.bridge_delete_agency_lead(uuid, uuid) to authenticated;

commit;
