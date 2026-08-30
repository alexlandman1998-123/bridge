-- Phase 6: release the assignment-first matter snapshot behind a firm-scoped,
-- server-evaluated rollout. Production intentionally starts disabled.

create table if not exists public.attorney_matter_snapshot_rollout_config (
  environment text primary key,
  enabled boolean not null default false,
  rollout_percentage integer not null default 0 check (rollout_percentage between 0 and 100),
  updated_at timestamptz not null default now(),
  release_note text
);

alter table public.attorney_matter_snapshot_rollout_config enable row level security;
revoke all on table public.attorney_matter_snapshot_rollout_config from public, anon;
grant select on table public.attorney_matter_snapshot_rollout_config to authenticated;

drop policy if exists "Authenticated users can read attorney matter snapshot rollout" on public.attorney_matter_snapshot_rollout_config;
create policy "Authenticated users can read attorney matter snapshot rollout"
  on public.attorney_matter_snapshot_rollout_config
  for select
  to authenticated
  using ((select auth.uid()) is not null);

insert into public.attorney_matter_snapshot_rollout_config (
  environment,
  enabled,
  rollout_percentage,
  release_note
)
values
  ('development', true, 100, 'Phase 6 local development verification'),
  ('preview', true, 100, 'Phase 6 preview verification'),
  ('staging', true, 100, 'Phase 6 staging certification'),
  ('production', false, 0, 'Production remains disabled pending live RPC and query-plan approval')
on conflict (environment) do nothing;

create or replace function public.bridge_attorney_matter_snapshot_environment(p_environment text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_environment, '')))
    when 'production' then 'production'
    when 'staging' then 'staging'
    when 'preview' then 'preview'
    else 'development'
  end;
$$;

create or replace function public.get_attorney_matter_snapshot_rollout_status(
  p_attorney_firm_id uuid,
  p_environment text default 'development'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with context as (
    select public.bridge_attorney_matter_snapshot_environment(p_environment) as environment,
      exists (
        select 1
        from public.attorney_firm_members member
        where member.firm_id = p_attorney_firm_id
          and member.user_id = auth.uid()
          and member.status = 'active'
      ) as has_membership
  ), config as (
    select config.*
    from public.attorney_matter_snapshot_rollout_config config
    join context on context.environment = config.environment
  )
  select jsonb_build_object(
    'enabled', coalesce(config.enabled, false)
      and context.has_membership
      and abs(mod(hashtextextended(p_attorney_firm_id::text, 8606), 100))::integer < coalesce(config.rollout_percentage, 0),
    'environment', context.environment,
    'reason', case
      when not context.has_membership then 'firm_access_required'
      when config.environment is null then 'configuration_missing'
      when not config.enabled then 'rollout_disabled'
      when abs(mod(hashtextextended(p_attorney_firm_id::text, 8606), 100))::integer >= config.rollout_percentage then 'outside_cohort'
      else 'percentage_cohort'
    end,
    'rolloutPercentage', coalesce(config.rollout_percentage, 0)
  )
  from context
  left join config on true;
$$;

revoke all on function public.get_attorney_matter_snapshot_rollout_status(uuid, text) from public, anon;
grant execute on function public.get_attorney_matter_snapshot_rollout_status(uuid, text) to authenticated;

comment on function public.get_attorney_matter_snapshot_rollout_status(uuid, text) is
  'Security-invoker, firm-scoped rollout decision for the attorney assignment-first matter list snapshot.';
