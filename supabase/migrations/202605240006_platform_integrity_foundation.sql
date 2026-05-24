create extension if not exists "pgcrypto";

create table if not exists public.integrity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  workspace_id uuid references public.organisations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  issue_code text not null,
  severity text not null default 'warning',
  status text not null default 'open',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  constraint integrity_logs_severity_check check (severity in ('info', 'warning', 'error', 'critical')),
  constraint integrity_logs_status_check check (status in ('open', 'acknowledged', 'resolved', 'dismissed'))
);

create index if not exists integrity_logs_entity_idx on public.integrity_logs(entity_type, entity_id);
create index if not exists integrity_logs_workspace_idx on public.integrity_logs(workspace_id);
create index if not exists integrity_logs_user_idx on public.integrity_logs(user_id);
create index if not exists integrity_logs_status_idx on public.integrity_logs(status, severity);

create table if not exists public.repair_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  workspace_id uuid references public.organisations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  repair_action text not null,
  status text not null default 'recommended',
  requested_by uuid references auth.users(id) on delete set null,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint repair_logs_status_check check (status in ('recommended', 'approved', 'applied', 'failed', 'rejected'))
);

create index if not exists repair_logs_entity_idx on public.repair_logs(entity_type, entity_id);
create index if not exists repair_logs_workspace_idx on public.repair_logs(workspace_id);
create index if not exists repair_logs_user_idx on public.repair_logs(user_id);

create table if not exists public.validation_states (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  workspace_id uuid references public.organisations(id) on delete set null,
  validation_status text not null default 'unknown',
  issue_count integer not null default 0,
  critical_count integer not null default 0,
  last_checked_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  unique(entity_type, entity_id),
  constraint validation_states_status_check check (validation_status in ('valid', 'warning', 'invalid', 'unknown'))
);

create index if not exists validation_states_workspace_idx on public.validation_states(workspace_id);
create index if not exists validation_states_status_idx on public.validation_states(validation_status);

create table if not exists public.system_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'unknown',
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint system_health_snapshots_status_check check (status in ('healthy', 'warning', 'critical', 'unknown'))
);

create index if not exists system_health_snapshots_created_at_idx on public.system_health_snapshots(created_at desc);

alter table public.integrity_logs enable row level security;
alter table public.repair_logs enable row level security;
alter table public.validation_states enable row level security;
alter table public.system_health_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'integrity_logs' and policyname = 'Platform admins manage integrity logs'
  ) then
    create policy "Platform admins manage integrity logs"
      on public.integrity_logs
      for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'repair_logs' and policyname = 'Platform admins manage repair logs'
  ) then
    create policy "Platform admins manage repair logs"
      on public.repair_logs
      for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'validation_states' and policyname = 'Platform admins manage validation states'
  ) then
    create policy "Platform admins manage validation states"
      on public.validation_states
      for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'system_health_snapshots' and policyname = 'Platform admins manage health snapshots'
  ) then
    create policy "Platform admins manage health snapshots"
      on public.system_health_snapshots
      for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;
end $$;
