begin;

alter table public.attorney_matter_snapshot_rollout_config
  add column if not exists canary_firm_id uuid
    references public.attorney_firms(id) on delete set null;

create index if not exists attorney_matter_snapshot_rollout_canary_firm_idx
  on public.attorney_matter_snapshot_rollout_config(canary_firm_id)
  where canary_firm_id is not null;

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
          and member.user_id = (select auth.uid())
          and member.status = 'active'
      ) as has_membership
  ), config as (
    select config.*
    from public.attorney_matter_snapshot_rollout_config config
    join context on context.environment = config.environment
  ), decision as (
    select
      context.*,
      config.enabled,
      config.rollout_percentage,
      config.canary_firm_id,
      coalesce(config.canary_firm_id = p_attorney_firm_id, false) as is_explicit_canary,
      abs(mod(hashtextextended(p_attorney_firm_id::text, 8606), 100))::integer
        < coalesce(config.rollout_percentage, 0) as is_percentage_canary
    from context
    left join config on true
  )
  select jsonb_build_object(
    'enabled', coalesce(decision.enabled, false)
      and decision.has_membership
      and (decision.is_explicit_canary or decision.is_percentage_canary),
    'environment', decision.environment,
    'reason', case
      when not decision.has_membership then 'firm_access_required'
      when decision.enabled is null then 'configuration_missing'
      when not decision.enabled then 'rollout_disabled'
      when decision.is_explicit_canary then 'explicit_firm_canary'
      when decision.is_percentage_canary then 'percentage_cohort'
      else 'outside_cohort'
    end,
    'rolloutPercentage', coalesce(decision.rollout_percentage, 0),
    'explicitCanary', decision.is_explicit_canary
  )
  from decision;
$$;

revoke all on function public.get_attorney_matter_snapshot_rollout_status(uuid, text)
  from public, anon;
grant execute on function public.get_attorney_matter_snapshot_rollout_status(uuid, text)
  to authenticated;

do $$
declare
  eligible_firm_count integer;
  eligible_firm_id uuid;
begin
  select
    count(distinct assignment.attorney_firm_id),
    min(assignment.attorney_firm_id::text)::uuid
  into eligible_firm_count, eligible_firm_id
  from public.transaction_attorney_assignments assignment
  join public.transactions transaction_record
    on transaction_record.id = assignment.transaction_id
   and transaction_record.is_active is distinct from false
  where assignment.attorney_firm_id is not null
    and assignment.assignment_status in ('pending', 'active', 'paused')
    and assignment.scope_metadata ->> 'source' = 'canonical_attorney_assignment_backfill'
    and exists (
      select 1
      from public.attorney_firm_members member
      where member.firm_id = assignment.attorney_firm_id
        and member.status = 'active'
        and member.role in ('firm_admin', 'director_partner')
    );

  if eligible_firm_count <> 1 or eligible_firm_id is null then
    raise exception
      'Attorney matter snapshot canary requires exactly one parity-certified eligible firm; found %.',
      eligible_firm_count;
  end if;

  update public.attorney_matter_snapshot_rollout_config
  set
    enabled = true,
    rollout_percentage = 0,
    canary_firm_id = eligible_firm_id,
    updated_at = now(),
    release_note = 'One-firm production canary after canonical assignment parity certification'
  where environment = 'production';

  if not found then
    raise exception 'Production attorney matter snapshot rollout configuration is missing.';
  end if;
end;
$$;

comment on column public.attorney_matter_snapshot_rollout_config.canary_firm_id is
  'Explicit one-firm canary. Percentage remains zero until a separately approved cohort expansion.';

commit;
