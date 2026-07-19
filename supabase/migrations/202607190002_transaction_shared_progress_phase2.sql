begin;

create table if not exists public.transaction_shared_progress (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  process_key text not null,
  process_label text not null,
  step_key text not null,
  status text not null default 'not_started',
  responsible_role text not null,
  blocked boolean not null default false,
  safe_explanation text,
  expected_next_step text,
  visibility text not null default 'professional_shared',
  professional_title text not null,
  professional_description text not null,
  client_title text,
  client_description text,
  source_type text not null default 'workflow',
  source_id text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_shared_progress_process_key_check check (length(trim(process_key)) between 1 and 80),
  constraint transaction_shared_progress_step_key_check check (length(trim(step_key)) between 1 and 120),
  constraint transaction_shared_progress_status_check check (status in ('not_started', 'in_progress', 'waiting', 'blocked', 'completed')),
  constraint transaction_shared_progress_visibility_check check (visibility in ('internal', 'professional_shared', 'client_visible')),
  constraint transaction_shared_progress_client_copy_check check (
    visibility <> 'client_visible'
    or (nullif(trim(client_title), '') is not null and nullif(trim(client_description), '') is not null)
  ),
  unique (transaction_id, process_key)
);

create index if not exists transaction_shared_progress_transaction_idx
  on public.transaction_shared_progress (transaction_id, updated_at desc);
create index if not exists transaction_shared_progress_process_idx
  on public.transaction_shared_progress (process_key, status, updated_at desc);

alter table public.transaction_shared_progress enable row level security;

drop policy if exists transaction_shared_progress_select_professional on public.transaction_shared_progress;
create policy transaction_shared_progress_select_professional
  on public.transaction_shared_progress
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and (
      visibility = 'client_visible'
      or (
        visibility = 'professional_shared'
        and exists (
          select 1 from public.profiles profile
          where profile.id = auth.uid()
            and lower(coalesce(profile.role, '')) in (
              'developer', 'platform_admin', 'internal_admin', 'admin', 'agent',
              'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney',
              'cancellation_attorney', 'bond_originator'
            )
        )
      )
      or (
        visibility = 'internal'
        and (
          public.bridge_transaction_scope_is_internal_user()
          or exists (
            select 1 from public.profiles profile
            where profile.id = auth.uid()
              and lower(coalesce(profile.role, '')) in (
                'attorney', 'conveyancer', 'transfer_attorney',
                'bond_attorney', 'cancellation_attorney'
              )
          )
        )
      )
      or exists (
        select 1 from public.profiles profile
        where profile.id = auth.uid()
          and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
      )
    )
  );

drop policy if exists transaction_shared_progress_select_client_portal on public.transaction_shared_progress;
create policy transaction_shared_progress_select_client_portal
  on public.transaction_shared_progress
  for select
  to anon, authenticated
  using (
    visibility = 'client_visible'
    and (
      public.bridge_has_client_portal_token_transaction_access(transaction_id)
      or public.bridge_has_onboarding_token_transaction_access(transaction_id)
    )
  );

grant select on public.transaction_shared_progress to anon, authenticated;

create or replace function public.bridge_publish_transaction_shared_progress_phase2(
  p_transaction_id uuid,
  p_process_key text,
  p_process_label text,
  p_step_key text,
  p_status text,
  p_responsible_role text,
  p_blocked boolean,
  p_safe_explanation text,
  p_expected_next_step text,
  p_visibility text,
  p_professional_title text,
  p_professional_description text,
  p_client_title text default null,
  p_client_description text default null,
  p_source_type text default 'workflow',
  p_source_id text default null
)
returns public.transaction_shared_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_previous public.transaction_shared_progress%rowtype;
  v_progress public.transaction_shared_progress%rowtype;
  v_has_changed boolean := true;
  v_event_title text;
  v_event_description text;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this transaction.' using errcode = '42501';
  end if;
  select lower(coalesce(profile.role, ''))
  into v_actor_role
  from public.profiles profile
  where profile.id = v_actor_id;
  if coalesce(v_actor_role, '') not in (
    'developer', 'platform_admin', 'internal_admin', 'admin', 'agent',
    'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney',
    'cancellation_attorney', 'bond_originator'
  ) then
    raise exception 'Only an authorised transaction professional may publish progress.' using errcode = '42501';
  end if;
  if p_status not in ('not_started', 'in_progress', 'waiting', 'blocked', 'completed') then
    raise exception 'Invalid shared progress status.' using errcode = '22023';
  end if;
  if p_visibility not in ('internal', 'professional_shared', 'client_visible') then
    raise exception 'Invalid shared progress visibility.' using errcode = '22023';
  end if;
  if p_visibility = 'client_visible' and (
    nullif(trim(coalesce(p_client_title, '')), '') is null
    or nullif(trim(coalesce(p_client_description, '')), '') is null
  ) then
    raise exception 'Client-visible progress requires client-safe wording.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_transaction_id::text || ':' || trim(p_process_key), 0)
  );
  select * into v_previous
  from public.transaction_shared_progress
  where transaction_id = p_transaction_id
    and process_key = trim(p_process_key);

  insert into public.transaction_shared_progress (
    transaction_id, process_key, process_label, step_key, status,
    responsible_role, blocked, safe_explanation, expected_next_step,
    visibility, professional_title, professional_description,
    client_title, client_description, source_type, source_id,
    updated_by, updated_at
  ) values (
    p_transaction_id, trim(p_process_key), trim(p_process_label), trim(p_step_key), p_status,
    trim(p_responsible_role), coalesce(p_blocked, p_status = 'blocked'),
    nullif(trim(coalesce(p_safe_explanation, '')), ''),
    nullif(trim(coalesce(p_expected_next_step, '')), ''),
    p_visibility, trim(p_professional_title), trim(p_professional_description),
    nullif(trim(coalesce(p_client_title, '')), ''),
    nullif(trim(coalesce(p_client_description, '')), ''),
    coalesce(nullif(trim(p_source_type), ''), 'workflow'),
    nullif(trim(coalesce(p_source_id, '')), ''),
    v_actor_id, v_now
  )
  on conflict (transaction_id, process_key) do update set
    process_label = excluded.process_label,
    step_key = excluded.step_key,
    status = excluded.status,
    responsible_role = excluded.responsible_role,
    blocked = excluded.blocked,
    safe_explanation = excluded.safe_explanation,
    expected_next_step = excluded.expected_next_step,
    visibility = excluded.visibility,
    professional_title = excluded.professional_title,
    professional_description = excluded.professional_description,
    client_title = excluded.client_title,
    client_description = excluded.client_description,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_progress;

  if v_previous.id is not null then
    v_has_changed := row(
      v_previous.step_key, v_previous.status, v_previous.responsible_role,
      v_previous.blocked, v_previous.safe_explanation, v_previous.expected_next_step,
      v_previous.visibility, v_previous.professional_title, v_previous.professional_description,
      v_previous.client_title, v_previous.client_description
    ) is distinct from row(
      v_progress.step_key, v_progress.status, v_progress.responsible_role,
      v_progress.blocked, v_progress.safe_explanation, v_progress.expected_next_step,
      v_progress.visibility, v_progress.professional_title, v_progress.professional_description,
      v_progress.client_title, v_progress.client_description
    );
  end if;

  if not v_has_changed then
    update public.transaction_shared_progress
    set updated_by = v_previous.updated_by,
        updated_at = v_previous.updated_at
    where id = v_progress.id
    returning * into v_progress;
  else
    update public.transactions
    set current_sub_stage_summary = v_progress.professional_description,
        next_action = coalesce(v_progress.expected_next_step, next_action),
        waiting_on_role = case when v_progress.status in ('waiting', 'blocked') then v_progress.responsible_role else null end,
        last_meaningful_activity_at = v_now,
        updated_at = v_now
    where id = p_transaction_id;
  end if;

  v_event_title := case when p_visibility = 'client_visible' then v_progress.client_title else v_progress.professional_title end;
  v_event_description := case when p_visibility = 'client_visible' then v_progress.client_description else v_progress.professional_description end;

  if v_has_changed then
    insert into public.transaction_events (
      transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
    ) values (
      p_transaction_id,
      'TransactionProgressPublished',
      jsonb_strip_nulls(jsonb_build_object(
        'processKey', v_progress.process_key,
        'processLabel', v_progress.process_label,
        'stepKey', v_progress.step_key,
        'status', v_progress.status,
        'responsibleRole', v_progress.responsible_role,
        'blocked', v_progress.blocked,
        'safeExplanation', v_progress.safe_explanation,
        'expectedNextStep', v_progress.expected_next_step,
        'title', v_event_title,
        'description', v_event_description,
        'sourceType', v_progress.source_type,
        'sourceId', v_progress.source_id
      )),
      v_actor_id,
      coalesce(nullif(trim(v_actor_role), ''), 'professional'),
      v_progress.visibility
    );
  end if;

  return v_progress;
end;
$$;

revoke all on function public.bridge_publish_transaction_shared_progress_phase2(
  uuid, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.bridge_publish_transaction_shared_progress_phase2(
  uuid, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text
) to authenticated;

-- Reconcile the duplicated lane status columns from their actual step state.
with computed as (
  select
    lane.id,
    case
      when count(step.id) > 0 and bool_and(step.status = 'completed') then 'completed'
      when bool_or(step.status = 'blocked') then 'blocked'
      when bool_or(step.status in ('in_progress', 'completed')) then 'in_progress'
      else 'not_started'
    end as computed_status
  from public.transaction_subprocesses lane
  left join public.transaction_subprocess_steps step on step.subprocess_id = lane.id
  group by lane.id
)
update public.transaction_subprocesses lane
set status = computed.computed_status,
    lane_status = computed.computed_status,
    updated_at = now()
from computed
where lane.id = computed.id
  and (lane.status is distinct from computed.computed_status or lane.lane_status is distinct from computed.computed_status);

-- Give every existing transaction a baseline transaction-level progress record.
-- Lane publications add one current record per real process as work advances.
insert into public.transaction_shared_progress (
  transaction_id, process_key, process_label, step_key, status,
  responsible_role, blocked, visibility,
  professional_title, professional_description,
  source_type, source_id, updated_at
)
select
  tx.id,
  'transaction',
  'Transaction',
  lower(regexp_replace(coalesce(nullif(tx.current_main_stage, ''), nullif(tx.stage, ''), 'not_started'), '[^a-zA-Z0-9]+', '_', 'g')),
  case
    when lower(coalesce(tx.lifecycle_state, '')) in ('completed', 'registered') then 'completed'
    when lower(coalesce(tx.lifecycle_state, '')) = 'cancelled' then 'blocked'
    when coalesce(tx.current_main_stage, tx.stage) is null then 'not_started'
    else 'in_progress'
  end,
  coalesce(nullif(tx.waiting_on_role, ''), 'transaction_team'),
  lower(coalesce(tx.lifecycle_state, '')) = 'cancelled',
  'professional_shared',
  coalesce(nullif(tx.current_main_stage, ''), nullif(tx.stage, ''), 'Transaction opened'),
  'Transaction is currently at ' || coalesce(nullif(tx.current_main_stage, ''), nullif(tx.stage, ''), 'the opening stage') || '.',
  'phase2_backfill',
  tx.id::text,
  coalesce(tx.updated_at, now())
from public.transactions tx
on conflict (transaction_id, process_key) do nothing;

notify pgrst, 'reload schema';
commit;
