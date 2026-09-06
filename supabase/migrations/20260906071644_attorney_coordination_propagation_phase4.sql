begin;

-- Attribution travels with the canonical progress projection without changing
-- the existing publish RPC contract used by attorney, client and Televent views.
alter table public.transaction_shared_progress
  add column if not exists attorney_action_attribution jsonb not null default '{}'::jsonb;

create or replace function public.bridge_current_attorney_action_attribution(
  p_transaction_id uuid,
  p_attorney_role text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'actualActorId', auth.uid(),
    'actingOnBehalf', delegation.id is not null,
    'delegationId', delegation.id,
    'responsibleFirmId', delegation.responsible_firm_id,
    'delegatedAttorneyRole', delegation.attorney_role
  )
  from (select 1 where auth.uid() is not null) seed
  left join lateral (
    select item.id, item.responsible_firm_id, item.attorney_role
    from public.attorney_lane_delegations item
    where item.transaction_id = p_transaction_id
      and item.attorney_role = lower(trim(coalesce(p_attorney_role, '')))
      and item.delegate_user_id = auth.uid()
      and item.status = 'active'
      and item.starts_at <= now()
      and item.expires_at > now()
    order by item.created_at desc
    limit 1
  ) delegation on true;
$$;

create or replace function public.bridge_apply_attorney_action_attribution_phase4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_role text;
  v_attribution jsonb;
begin
  v_transaction_id := new.transaction_id;
  if tg_table_name = 'transaction_shared_progress' then
    v_role := case
      when new.process_key like 'bond%' then 'bond_attorney'
      when new.process_key like 'cancellation%' then 'cancellation_attorney'
      when new.process_key like 'transfer%' then 'transfer_attorney'
      else null end;
  elsif tg_table_name = 'transaction_activity_projections' then
    v_role := case new.lane_key
      when 'bond' then 'bond_attorney'
      when 'cancellation' then 'cancellation_attorney'
      when 'transfer' then 'transfer_attorney'
      else null end;
  elsif tg_table_name = 'transaction_events' then
    v_role := coalesce(
      new.event_data ->> 'attorneyRole',
      case new.event_data ->> 'laneKey'
        when 'bond' then 'bond_attorney'
        when 'cancellation' then 'cancellation_attorney'
        when 'transfer' then 'transfer_attorney'
        else null end
    );
  else
    v_role := coalesce(
      new.attorney_role,
      case new.lane_key
        when 'bond' then 'bond_attorney'
        when 'cancellation' then 'cancellation_attorney'
        when 'transfer' then 'transfer_attorney'
        else null end
    );
  end if;

  if v_transaction_id is null or v_role is null or auth.uid() is null then return new; end if;
  v_attribution := public.bridge_current_attorney_action_attribution(v_transaction_id, v_role);

  if tg_table_name = 'transaction_shared_progress' then
    new.attorney_action_attribution := v_attribution;
  elsif tg_table_name = 'transaction_activity_projections' then
    new.payload_json := coalesce(new.payload_json, '{}'::jsonb)
      || jsonb_build_object('attorneyActionAttribution', v_attribution);
  elsif tg_table_name = 'transaction_events' then
    new.event_data := coalesce(new.event_data, '{}'::jsonb)
      || jsonb_build_object('attorneyActionAttribution', v_attribution);
  else
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('attorneyActionAttribution', v_attribution);
  end if;
  return new;
end;
$$;

drop trigger if exists attorney_lane_updates_attribution_phase4 on public.transaction_attorney_lane_updates;
create trigger attorney_lane_updates_attribution_phase4
before insert or update on public.transaction_attorney_lane_updates
for each row execute function public.bridge_apply_attorney_action_attribution_phase4();

drop trigger if exists attorney_lane_history_attribution_phase4 on public.transaction_attorney_lane_history;
create trigger attorney_lane_history_attribution_phase4
before insert or update on public.transaction_attorney_lane_history
for each row execute function public.bridge_apply_attorney_action_attribution_phase4();

drop trigger if exists attorney_transaction_events_attribution_phase4 on public.transaction_events;
create trigger attorney_transaction_events_attribution_phase4
before insert or update on public.transaction_events
for each row
when (new.event_type like 'Attorney%' or new.event_data ->> 'originalEventType' like 'Attorney%')
execute function public.bridge_apply_attorney_action_attribution_phase4();

drop trigger if exists attorney_shared_progress_attribution_phase4 on public.transaction_shared_progress;
create trigger attorney_shared_progress_attribution_phase4
before insert or update on public.transaction_shared_progress
for each row
when (new.process_key like 'transfer%' or new.process_key like 'bond%' or new.process_key like 'cancellation%')
execute function public.bridge_apply_attorney_action_attribution_phase4();

drop trigger if exists attorney_activity_projection_attribution_phase4 on public.transaction_activity_projections;
create trigger attorney_activity_projection_attribution_phase4
before insert or update on public.transaction_activity_projections
for each row
when (new.lane_key in ('transfer', 'bond', 'cancellation'))
execute function public.bridge_apply_attorney_action_attribution_phase4();

revoke all on function public.bridge_current_attorney_action_attribution(uuid, text) from public, anon, authenticated;
revoke all on function public.bridge_apply_attorney_action_attribution_phase4() from public, anon, authenticated;

comment on column public.transaction_shared_progress.attorney_action_attribution is
  'Actual actor and controlled delegation attribution propagated to shared professional, client and Televent progress readers.';

notify pgrst, 'reload schema';
commit;
