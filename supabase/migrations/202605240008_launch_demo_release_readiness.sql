create extension if not exists "pgcrypto";

create table if not exists public.platform_environment_settings (
  id boolean primary key default true,
  environment text not null default 'production',
  demo_tools_enabled boolean not null default false,
  production_locked boolean not null default true,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint platform_environment_settings_singleton check (id = true),
  constraint platform_environment_settings_environment_check check (environment in ('local', 'demo', 'staging', 'preview', 'production'))
);

insert into public.platform_environment_settings (id, environment, demo_tools_enabled, production_locked, notes)
values (true, 'production', false, true, 'Default locked state. Change only in isolated staging/demo projects.')
on conflict (id) do nothing;

create table if not exists public.demo_seed_manifests (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'demo',
  demo_key text not null,
  workspace_type text,
  account_role text,
  account_email text,
  expected_records jsonb not null default '{}'::jsonb,
  reset_notes text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_seed_manifests_status_check check (status in ('planned', 'seeded', 'needs_reset', 'disabled')),
  constraint demo_seed_manifests_unique_key unique (environment, demo_key)
);

create table if not exists public.demo_reset_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  reset_scope text not null default 'all',
  dry_run boolean not null default true,
  status text not null default 'requested',
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  constraint demo_reset_runs_status_check check (status in ('requested', 'dry_run_completed', 'completed', 'blocked', 'failed'))
);

create index if not exists demo_reset_runs_environment_idx on public.demo_reset_runs(environment, started_at desc);
create index if not exists demo_reset_runs_requested_by_idx on public.demo_reset_runs(requested_by);

create table if not exists public.launch_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  release_version text,
  category text not null,
  status text not null,
  risk_level text not null default 'medium',
  blockers jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz not null default now(),
  constraint launch_readiness_status_check check (status in ('pass', 'warning', 'fail', 'not_checked')),
  constraint launch_readiness_risk_check check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create index if not exists launch_readiness_checks_environment_idx on public.launch_readiness_checks(environment, checked_at desc);
create index if not exists launch_readiness_checks_category_idx on public.launch_readiness_checks(category, checked_at desc);

create table if not exists public.post_deploy_verification_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  release_version text,
  status text not null default 'not_checked',
  checks jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  constraint post_deploy_verification_status_check check (status in ('pass', 'warning', 'fail', 'not_checked'))
);

create index if not exists post_deploy_verification_runs_environment_idx on public.post_deploy_verification_runs(environment, verified_at desc);

alter table public.platform_environment_settings enable row level security;
alter table public.demo_seed_manifests enable row level security;
alter table public.demo_reset_runs enable row level security;
alter table public.launch_readiness_checks enable row level security;
alter table public.post_deploy_verification_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_environment_settings' and policyname = 'Platform admins manage environment settings'
  ) then
    create policy "Platform admins manage environment settings"
      on public.platform_environment_settings for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_seed_manifests' and policyname = 'Platform admins manage demo manifests'
  ) then
    create policy "Platform admins manage demo manifests"
      on public.demo_seed_manifests for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_reset_runs' and policyname = 'Platform admins manage demo reset runs'
  ) then
    create policy "Platform admins manage demo reset runs"
      on public.demo_reset_runs for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'launch_readiness_checks' and policyname = 'Platform admins manage launch readiness'
  ) then
    create policy "Platform admins manage launch readiness"
      on public.launch_readiness_checks for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'post_deploy_verification_runs' and policyname = 'Platform admins manage post deploy verification'
  ) then
    create policy "Platform admins manage post deploy verification"
      on public.post_deploy_verification_runs for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));
  end if;
end $$;

create or replace function public.request_demo_environment_reset(
  p_reset_scope text default 'all',
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_environment text;
  v_demo_tools_enabled boolean;
  v_run_id uuid;
  v_summary jsonb;
begin
  if v_actor is null then
    raise exception 'Demo reset requires an authenticated platform admin.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'platform_admin') then
    raise exception 'Demo reset requires platform admin access.';
  end if;

  select environment, demo_tools_enabled
    into v_environment, v_demo_tools_enabled
  from public.platform_environment_settings
  where id = true;

  v_environment := coalesce(v_environment, 'production');
  v_demo_tools_enabled := coalesce(v_demo_tools_enabled, false);

  if v_environment = 'production' or not v_demo_tools_enabled then
    insert into public.demo_reset_runs (environment, reset_scope, dry_run, status, requested_by, completed_at, summary, error_message)
    values (
      v_environment,
      coalesce(nullif(p_reset_scope, ''), 'all'),
      coalesce(p_dry_run, true),
      'blocked',
      v_actor,
      now(),
      jsonb_build_object('reason', 'demo_tools_disabled', 'environment', v_environment),
      'Demo reset is blocked unless this Supabase project is explicitly marked as demo/staging.'
    )
    returning id into v_run_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'blocked',
      'runId', v_run_id,
      'environment', v_environment,
      'message', 'Demo reset is blocked in this environment.'
    );
  end if;

  v_summary := jsonb_build_object(
    'scope', coalesce(nullif(p_reset_scope, ''), 'all'),
    'dryRun', coalesce(p_dry_run, true),
    'resetPolicy', 'Only data marked as demo seed data may be reset. Production data is never eligible.',
    'seedScripts', jsonb_build_array(
      'supabase/seed/reset-bridge9-principal-demo-data.sql',
      'supabase/seed/seed-bridge9-principal-demo-data.sql',
      'supabase/seed/reset-dalawyer-demo-data.sql',
      'supabase/seed/seed-dalawyer-demo-data.sql'
    ),
    'nextStep', case when coalesce(p_dry_run, true) then 'Review the dry-run and run the staging seed/reset pipeline.' else 'Run the staging seed/reset pipeline and verify manifests.' end
  );

  insert into public.demo_reset_runs (environment, reset_scope, dry_run, status, requested_by, completed_at, summary)
  values (
    v_environment,
    coalesce(nullif(p_reset_scope, ''), 'all'),
    coalesce(p_dry_run, true),
    case when coalesce(p_dry_run, true) then 'dry_run_completed' else 'requested' end,
    v_actor,
    case when coalesce(p_dry_run, true) then now() else null end,
    v_summary
  )
  returning id into v_run_id;

  return jsonb_build_object(
    'ok', true,
    'status', case when coalesce(p_dry_run, true) then 'dry_run_completed' else 'requested' end,
    'runId', v_run_id,
    'environment', v_environment,
    'summary', v_summary
  );
end;
$$;
