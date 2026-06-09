begin;

create table if not exists public.agent_support_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assistant_user_id uuid not null references auth.users(id) on delete cascade,
  supported_user_id uuid not null references auth.users(id) on delete cascade,
  support_role text not null default 'assistant',
  status text not null default 'active',
  notification_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  constraint agent_support_assignments_role_check
    check (support_role in ('assistant','transaction_coordinator','listing_coordinator','admin_coordinator')),
  constraint agent_support_assignments_status_check
    check (status in ('active','paused','revoked')),
  constraint agent_support_assignments_not_self_check
    check (assistant_user_id <> supported_user_id)
);

create unique index if not exists agent_support_assignments_active_unique_idx
  on public.agent_support_assignments (organisation_id, assistant_user_id, supported_user_id, support_role)
  where status = 'active';

create index if not exists agent_support_assignments_assistant_idx
  on public.agent_support_assignments (organisation_id, assistant_user_id, status);

create index if not exists agent_support_assignments_supported_idx
  on public.agent_support_assignments (organisation_id, supported_user_id, status);

create or replace function public.bridge_assists_user(target_org uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agent_support_assignments asa
    where asa.organisation_id = target_org
      and asa.supported_user_id = target_user
      and asa.assistant_user_id = auth.uid()
      and asa.status = 'active'
  );
$$;

alter table public.agent_support_assignments enable row level security;

drop policy if exists agent_support_assignments_select on public.agent_support_assignments;
create policy agent_support_assignments_select on public.agent_support_assignments
for select
using (
  public.bridge_is_org_admin(organisation_id)
  or assistant_user_id = auth.uid()
  or supported_user_id = auth.uid()
);

drop policy if exists agent_support_assignments_insert on public.agent_support_assignments;
create policy agent_support_assignments_insert on public.agent_support_assignments
for insert
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_is_active_member(organisation_id)
    and supported_user_id = auth.uid()
  )
);

drop policy if exists agent_support_assignments_update on public.agent_support_assignments;
create policy agent_support_assignments_update on public.agent_support_assignments
for update
using (
  public.bridge_is_org_admin(organisation_id)
  or supported_user_id = auth.uid()
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or supported_user_id = auth.uid()
);

drop policy if exists agent_support_assignments_delete on public.agent_support_assignments;
create policy agent_support_assignments_delete on public.agent_support_assignments
for delete
using (
  public.bridge_is_org_admin(organisation_id)
  or supported_user_id = auth.uid()
);

grant execute on function public.bridge_assists_user(uuid, uuid) to authenticated;

commit;
