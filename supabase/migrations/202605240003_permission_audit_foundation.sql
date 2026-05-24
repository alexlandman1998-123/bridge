begin;

create extension if not exists "pgcrypto";

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.organisations(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_workspace_action_idx
  on public.security_audit_events (workspace_id, action, created_at desc);

create index if not exists security_audit_events_user_idx
  on public.security_audit_events (user_id, created_at desc);

alter table public.security_audit_events enable row level security;

drop policy if exists security_audit_events_insert_authenticated on public.security_audit_events;
create policy security_audit_events_insert_authenticated on public.security_audit_events
for insert to authenticated
with check (user_id is null or user_id = auth.uid());

drop policy if exists security_audit_events_select_workspace_admin on public.security_audit_events;
create policy security_audit_events_select_workspace_admin on public.security_audit_events
for select to authenticated
using (
  workspace_id is not null
  and public.bridge_is_org_admin(workspace_id)
);

grant select, insert on public.security_audit_events to authenticated;

commit;
