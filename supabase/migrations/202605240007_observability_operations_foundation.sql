create extension if not exists "pgcrypto";

create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.organisations(id) on delete set null,
  category text not null,
  event_name text not null,
  route text,
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint telemetry_events_severity_check check (severity in ('debug', 'info', 'warning', 'error', 'critical'))
);

create index if not exists telemetry_events_user_idx on public.telemetry_events(user_id);
create index if not exists telemetry_events_workspace_idx on public.telemetry_events(workspace_id);
create index if not exists telemetry_events_category_idx on public.telemetry_events(category, event_name);
create index if not exists telemetry_events_created_at_idx on public.telemetry_events(created_at desc);

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.organisations(id) on delete set null,
  route text,
  operation text,
  category text not null,
  severity text not null default 'error',
  message text not null,
  stack text,
  environment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint error_events_severity_check check (severity in ('warning', 'error', 'critical'))
);

create index if not exists error_events_user_idx on public.error_events(user_id);
create index if not exists error_events_workspace_idx on public.error_events(workspace_id);
create index if not exists error_events_category_idx on public.error_events(category);
create index if not exists error_events_created_at_idx on public.error_events(created_at desc);

create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.organisations(id) on delete set null,
  metric_name text not null,
  route text,
  duration_ms numeric,
  value numeric,
  unit text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists performance_metrics_name_idx on public.performance_metrics(metric_name);
create index if not exists performance_metrics_route_idx on public.performance_metrics(route);
create index if not exists performance_metrics_created_at_idx on public.performance_metrics(created_at desc);

create table if not exists public.deployment_check_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'unknown',
  environment text,
  checks jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint deployment_check_runs_status_check check (status in ('passed', 'warning', 'failed', 'unknown'))
);

create index if not exists deployment_check_runs_created_at_idx on public.deployment_check_runs(created_at desc);

create table if not exists public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.organisations(id) on delete set null,
  action text not null,
  key_hash text,
  status text not null default 'observed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint rate_limit_events_status_check check (status in ('observed', 'allowed', 'blocked', 'warning'))
);

create index if not exists rate_limit_events_action_idx on public.rate_limit_events(action, created_at desc);
create index if not exists rate_limit_events_user_idx on public.rate_limit_events(user_id);

alter table public.telemetry_events enable row level security;
alter table public.error_events enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.deployment_check_runs enable row level security;
alter table public.rate_limit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'telemetry_events' and policyname = 'Users can create own telemetry'
  ) then
    create policy "Users can create own telemetry"
      on public.telemetry_events for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'error_events' and policyname = 'Users can create own errors'
  ) then
    create policy "Users can create own errors"
      on public.error_events for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'performance_metrics' and policyname = 'Users can create own performance metrics'
  ) then
    create policy "Users can create own performance metrics"
      on public.performance_metrics for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_limit_events' and policyname = 'Users can create own rate limit events'
  ) then
    create policy "Users can create own rate limit events"
      on public.rate_limit_events for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'deployment_check_runs' and policyname = 'Platform admins manage deployment checks'
  ) then
    create policy "Platform admins manage deployment checks"
      on public.deployment_check_runs for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'telemetry_events' and policyname = 'Platform admins view telemetry'
  ) then
    create policy "Platform admins view telemetry"
      on public.telemetry_events for select
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'error_events' and policyname = 'Platform admins view errors'
  ) then
    create policy "Platform admins view errors"
      on public.error_events for select
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'performance_metrics' and policyname = 'Platform admins view performance metrics'
  ) then
    create policy "Platform admins view performance metrics"
      on public.performance_metrics for select
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;
end $$;
