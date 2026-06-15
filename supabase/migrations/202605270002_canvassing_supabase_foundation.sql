begin;
create extension if not exists "pgcrypto";
create table if not exists public.canvassing_prospects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_agent_name text,
  assigned_agent_email text,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  prospect_type text not null default 'Seller Prospect',
  area text,
  property_type text,
  canvassing_method text not null default 'Cold Call',
  status text not null default 'New',
  next_follow_up_date date,
  follow_up_priority text not null default 'Medium',
  follow_up_note text,
  estimated_value numeric(14, 2),
  notes text,
  converted_lead_id uuid references public.leads(lead_id) on delete set null,
  converted_at timestamptz,
  lost_reason text,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  is_demo_data boolean not null default false,
  demo_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.canvassing_activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  prospect_id uuid not null references public.canvassing_prospects(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  agent_name text,
  activity_type text not null default 'Note',
  activity_note text,
  outcome text,
  activity_date timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  is_demo_data boolean not null default false,
  demo_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.canvassing_prospects drop constraint if exists canvassing_prospects_status_check;
alter table public.canvassing_prospects
  add constraint canvassing_prospects_status_check
  check (status in ('New', 'Contacted', 'Interested', 'Follow-Up Later', 'Not Interested', 'Converted to Lead', 'Lost', 'Archived'));
alter table public.canvassing_prospects drop constraint if exists canvassing_prospects_priority_check;
alter table public.canvassing_prospects
  add constraint canvassing_prospects_priority_check
  check (follow_up_priority in ('Low', 'Medium', 'High', 'Urgent'));
create index if not exists canvassing_prospects_org_status_idx
  on public.canvassing_prospects (organisation_id, status, created_at desc);
create index if not exists canvassing_prospects_org_agent_idx
  on public.canvassing_prospects (organisation_id, assigned_agent_id, created_at desc);
create index if not exists canvassing_prospects_converted_lead_idx
  on public.canvassing_prospects (converted_lead_id)
  where converted_lead_id is not null;
create index if not exists canvassing_activities_org_date_idx
  on public.canvassing_activities (organisation_id, activity_date desc);
create index if not exists canvassing_activities_prospect_idx
  on public.canvassing_activities (prospect_id, activity_date desc);
create or replace function public.bridge_canvassing_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_canvassing_prospects_updated_at on public.canvassing_prospects;
create trigger trg_canvassing_prospects_updated_at
before update on public.canvassing_prospects
for each row execute function public.bridge_canvassing_set_updated_at();
alter table public.canvassing_prospects enable row level security;
alter table public.canvassing_activities enable row level security;
drop policy if exists canvassing_prospects_select_member on public.canvassing_prospects;
create policy canvassing_prospects_select_member
on public.canvassing_prospects
for select
to authenticated
using (public.bridge_is_active_member(organisation_id));
drop policy if exists canvassing_prospects_insert_member on public.canvassing_prospects;
create policy canvassing_prospects_insert_member
on public.canvassing_prospects
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id is null
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);
drop policy if exists canvassing_prospects_update_member on public.canvassing_prospects;
create policy canvassing_prospects_update_member
on public.canvassing_prospects
for update
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
)
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);
drop policy if exists canvassing_prospects_delete_member on public.canvassing_prospects;
create policy canvassing_prospects_delete_member
on public.canvassing_prospects
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);
drop policy if exists canvassing_activities_select_member on public.canvassing_activities;
create policy canvassing_activities_select_member
on public.canvassing_activities
for select
to authenticated
using (public.bridge_is_active_member(organisation_id));
drop policy if exists canvassing_activities_insert_member on public.canvassing_activities;
create policy canvassing_activities_insert_member
on public.canvassing_activities
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and exists (
    select 1
    from public.canvassing_prospects prospect
    where prospect.id = prospect_id
      and prospect.organisation_id = canvassing_activities.organisation_id
      and (
        public.bridge_is_org_admin(prospect.organisation_id)
        or prospect.assigned_agent_id = auth.uid()
        or prospect.created_by = auth.uid()
      )
  )
);
drop policy if exists canvassing_activities_delete_member on public.canvassing_activities;
create policy canvassing_activities_delete_member
on public.canvassing_activities
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and exists (
    select 1
    from public.canvassing_prospects prospect
    where prospect.id = prospect_id
      and (
        public.bridge_is_org_admin(prospect.organisation_id)
        or prospect.assigned_agent_id = auth.uid()
        or prospect.created_by = auth.uid()
      )
  )
);
grant select, insert, update, delete on public.canvassing_prospects to authenticated;
grant select, insert, delete on public.canvassing_activities to authenticated;
commit;
