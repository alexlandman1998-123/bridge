create extension if not exists "pgcrypto";
create table if not exists public.onboarding_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_status text not null default 'not_started',
  onboarding_step text not null default 'select_business_type',
  onboarding_path text,
  workspace_action text,
  workspace_type text,
  app_role text,
  intended_org_role text,
  last_completed_step text,
  onboarding_context_json jsonb not null default '{}'::jsonb,
  recovery_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint onboarding_states_status_check check (
    onboarding_status in (
      'not_started',
      'signup_started',
      'email_verification_pending',
      'onboarding_in_progress',
      'workspace_setup_required',
      'workspace_pending_approval',
      'onboarding_blocked',
      'onboarding_recovery_required',
      'onboarding_completed',
      'suspended',
      'archived'
    )
  )
);
create index if not exists onboarding_states_status_idx on public.onboarding_states(onboarding_status);
create index if not exists onboarding_states_app_role_idx on public.onboarding_states(app_role);
create index if not exists onboarding_states_workspace_type_idx on public.onboarding_states(workspace_type);
create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.organisations(id) on delete set null,
  onboarding_step text,
  event_type text not null,
  failure_reason text,
  recovery_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_events_user_id_idx on public.onboarding_events(user_id);
create index if not exists onboarding_events_workspace_id_idx on public.onboarding_events(workspace_id);
create index if not exists onboarding_events_event_type_idx on public.onboarding_events(event_type);
create or replace function public.set_onboarding_states_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists onboarding_states_set_updated_at on public.onboarding_states;
create trigger onboarding_states_set_updated_at
before update on public.onboarding_states
for each row execute function public.set_onboarding_states_updated_at();
alter table public.onboarding_states enable row level security;
alter table public.onboarding_events enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_states'
      and policyname = 'Users can view their onboarding state'
  ) then
    create policy "Users can view their onboarding state"
      on public.onboarding_states
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_states'
      and policyname = 'Users can insert their onboarding state'
  ) then
    create policy "Users can insert their onboarding state"
      on public.onboarding_states
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_states'
      and policyname = 'Users can update their onboarding state'
  ) then
    create policy "Users can update their onboarding state"
      on public.onboarding_states
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_events'
      and policyname = 'Users can view their onboarding events'
  ) then
    create policy "Users can view their onboarding events"
      on public.onboarding_events
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_events'
      and policyname = 'Users can create their onboarding events'
  ) then
    create policy "Users can create their onboarding events"
      on public.onboarding_events
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
