begin;

-- Attorney calendar Phase 8 controlled rollout.
-- The browser receives only an evaluated decision; rollout policy remains
-- private and production is disabled until an operator explicitly enables it.

create table if not exists public.attorney_calendar_rollout_config (
  environment text primary key,
  enabled boolean not null default false,
  rollout_percentage integer not null default 0 check (rollout_percentage between 0 and 100),
  organisation_allowlist uuid[] not null default '{}'::uuid[],
  minimum_sample_size integer not null default 20 check (minimum_sample_size >= 1),
  persistence_failure_threshold numeric(6, 5) not null default 0.05000,
  delivery_failure_threshold numeric(6, 5) not null default 0.10000,
  reminder_failure_threshold numeric(6, 5) not null default 0.10000,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  release_note text
);

alter table public.attorney_calendar_rollout_config enable row level security;
revoke all on table public.attorney_calendar_rollout_config from public, anon, authenticated;

insert into public.attorney_calendar_rollout_config (
  environment,
  enabled,
  rollout_percentage,
  release_note
)
values
  ('development', true, 100, 'Phase 8 local development cohort'),
  ('preview', true, 100, 'Phase 8 preview cohort'),
  ('staging', true, 100, 'Phase 8 staging acceptance cohort'),
  ('production', false, 0, 'Production remains disabled pending explicit release approval')
on conflict (environment) do nothing;

create table if not exists public.attorney_calendar_rollout_events (
  event_id uuid primary key default gen_random_uuid(),
  environment text not null,
  organisation_id uuid not null,
  transaction_id uuid,
  appointment_id uuid,
  actor_id uuid,
  event_type text not null check (event_type in (
    'invite_attempted',
    'invite_created',
    'persistence_failed',
    'delivery_failed',
    'reminder_failed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists attorney_calendar_rollout_events_health_idx
  on public.attorney_calendar_rollout_events (environment, occurred_at desc, event_type);
create index if not exists attorney_calendar_rollout_events_org_idx
  on public.attorney_calendar_rollout_events (organisation_id, occurred_at desc);

alter table public.attorney_calendar_rollout_events enable row level security;
revoke all on table public.attorney_calendar_rollout_events from public, anon, authenticated;

create or replace function public.bridge_attorney_calendar_environment(p_environment text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_environment, '')))
    when 'production' then 'production'
    when 'staging' then 'staging'
    when 'preview' then 'preview'
    when 'development' then 'development'
    when 'test' then 'development'
    else 'development'
  end;
$$;

create or replace function public.bridge_can_access_attorney_calendar_org(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_organisation_id is not null
    and (
      public.bridge_membership_role(p_organisation_id) is not null
      or exists (
        select 1
        from public.transactions transaction_row
        where transaction_row.organisation_id = p_organisation_id
          and public.bridge_attorney_can_manage_transaction(transaction_row.id)
      )
    );
$$;

revoke all on function public.bridge_can_access_attorney_calendar_org(uuid) from public, anon;
grant execute on function public.bridge_can_access_attorney_calendar_org(uuid) to authenticated;

create or replace function public.get_attorney_calendar_rollout_status(
  p_organisation_id uuid,
  p_environment text default 'development'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalised_environment text := public.bridge_attorney_calendar_environment(p_environment);
  rollout public.attorney_calendar_rollout_config%rowtype;
  bucket integer;
  eligible boolean := false;
  reason text := 'rollout_disabled';
begin
  if not public.bridge_can_access_attorney_calendar_org(p_organisation_id) then
    raise exception 'Attorney calendar rollout status is not available for this organisation'
      using errcode = '42501';
  end if;

  select * into rollout
  from public.attorney_calendar_rollout_config
  where environment = normalised_environment;

  if not found then
    return jsonb_build_object(
      'enabled', false,
      'environment', normalised_environment,
      'reason', 'configuration_missing',
      'rolloutPercentage', 0
    );
  end if;

  bucket := abs(mod(hashtextextended(p_organisation_id::text, 8008), 100))::integer;
  eligible := rollout.enabled and (
    p_organisation_id = any(rollout.organisation_allowlist)
    or bucket < rollout.rollout_percentage
  );

  if eligible then
    reason := case
      when p_organisation_id = any(rollout.organisation_allowlist) then 'allowlisted'
      else 'percentage_cohort'
    end;
  elsif rollout.enabled then
    reason := 'outside_cohort';
  end if;

  return jsonb_build_object(
    'enabled', eligible,
    'environment', normalised_environment,
    'reason', reason,
    'rolloutPercentage', rollout.rollout_percentage,
    'cohortBucket', bucket
  );
end;
$$;

revoke all on function public.get_attorney_calendar_rollout_status(uuid, text) from public, anon;
grant execute on function public.get_attorney_calendar_rollout_status(uuid, text) to authenticated;

create or replace function public.record_attorney_calendar_rollout_event(
  p_environment text,
  p_organisation_id uuid,
  p_transaction_id uuid,
  p_appointment_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if not public.bridge_can_access_attorney_calendar_org(p_organisation_id) then
    raise exception 'Attorney calendar rollout telemetry is not available for this organisation'
      using errcode = '42501';
  end if;

  if p_transaction_id is not null and not exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = p_transaction_id
      and transaction_row.organisation_id = p_organisation_id
  ) then
    raise exception 'Rollout telemetry transaction does not belong to the organisation'
      using errcode = '23514';
  end if;

  if p_event_type not in (
    'invite_attempted', 'invite_created', 'persistence_failed',
    'delivery_failed', 'reminder_failed'
  ) then
    raise exception 'Unsupported attorney calendar rollout event'
      using errcode = '23514';
  end if;

  insert into public.attorney_calendar_rollout_events (
    environment,
    organisation_id,
    transaction_id,
    appointment_id,
    actor_id,
    event_type,
    metadata
  ) values (
    public.bridge_attorney_calendar_environment(p_environment),
    p_organisation_id,
    p_transaction_id,
    p_appointment_id,
    auth.uid(),
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning event_id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.record_attorney_calendar_rollout_event(text, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.record_attorney_calendar_rollout_event(text, uuid, uuid, uuid, text, jsonb) to authenticated;

create or replace function public.attorney_calendar_rollout_health(
  p_environment text default 'staging',
  p_since timestamptz default (now() - interval '24 hours')
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalised_environment text := public.bridge_attorney_calendar_environment(p_environment);
  rollout public.attorney_calendar_rollout_config%rowtype;
  attempted integer := 0;
  created integer := 0;
  persistence_failed integer := 0;
  delivery_failed integer := 0;
  reminder_failed integer := 0;
  persistence_rate numeric := 0;
  delivery_rate numeric := 0;
  reminder_rate numeric := 0;
  reasons jsonb := '[]'::jsonb;
begin
  select * into rollout
  from public.attorney_calendar_rollout_config
  where environment = normalised_environment;

  if not found then
    raise exception 'Attorney calendar rollout configuration is missing';
  end if;

  select
    count(*) filter (where event_type = 'invite_attempted'),
    count(*) filter (where event_type = 'invite_created'),
    count(*) filter (where event_type = 'persistence_failed'),
    count(*) filter (where event_type = 'delivery_failed'),
    count(*) filter (where event_type = 'reminder_failed')
  into attempted, created, persistence_failed, delivery_failed, reminder_failed
  from public.attorney_calendar_rollout_events
  where environment = normalised_environment
    and occurred_at >= p_since;

  if attempted > 0 then
    persistence_rate := persistence_failed::numeric / attempted;
  end if;
  if created > 0 then
    delivery_rate := delivery_failed::numeric / created;
    reminder_rate := reminder_failed::numeric / created;
  end if;

  if attempted >= rollout.minimum_sample_size and persistence_rate >= rollout.persistence_failure_threshold then
    reasons := reasons || jsonb_build_array('persistence_failure_rate');
  end if;
  if created >= rollout.minimum_sample_size and delivery_rate >= rollout.delivery_failure_threshold then
    reasons := reasons || jsonb_build_array('delivery_failure_rate');
  end if;
  if created >= rollout.minimum_sample_size and reminder_rate >= rollout.reminder_failure_threshold then
    reasons := reasons || jsonb_build_array('reminder_failure_rate');
  end if;

  return jsonb_build_object(
    'environment', normalised_environment,
    'since', p_since,
    'enabled', rollout.enabled,
    'rolloutPercentage', rollout.rollout_percentage,
    'minimumSampleSize', rollout.minimum_sample_size,
    'counts', jsonb_build_object(
      'attempted', attempted,
      'created', created,
      'persistenceFailed', persistence_failed,
      'deliveryFailed', delivery_failed,
      'reminderFailed', reminder_failed
    ),
    'rates', jsonb_build_object(
      'persistenceFailure', round(persistence_rate, 5),
      'deliveryFailure', round(delivery_rate, 5),
      'reminderFailure', round(reminder_rate, 5)
    ),
    'rollbackRecommended', jsonb_array_length(reasons) > 0,
    'rollbackReasons', reasons
  );
end;
$$;

revoke all on function public.attorney_calendar_rollout_health(text, timestamptz) from public, anon, authenticated;
grant execute on function public.attorney_calendar_rollout_health(text, timestamptz) to service_role;

notify pgrst, 'reload schema';

commit;
