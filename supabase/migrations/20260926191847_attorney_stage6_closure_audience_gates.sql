begin;

-- Keep the final-account decision private. Client registration news is a
-- separate, recipient-scoped journey update; closing the file is professional.
update journey_private.task_catalog
set definition = jsonb_set(jsonb_set(jsonb_set(definition,
  '{clientVisibleAllowed}', 'false'::jsonb),
  '{defaultVisibility}', '"internal"'::jsonb),
  '{professional,title}', '"Review Final Accounts"'::jsonb)
where lane_key = 'transfer' and step_key = 'post_registration_closeout_review';

update journey_private.task_catalog
set definition = jsonb_set(jsonb_set(definition,
  '{clientVisibleAllowed}', 'false'::jsonb),
  '{defaultVisibility}', '"professional_shared"'::jsonb)
where lane_key = 'transfer' and step_key = 'matter_closed';

create function journey_private.enforce_stage_six_closure()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_transaction_id uuid;
  v_lane_key text;
  v_registered public.transaction_subprocess_steps%rowtype;
  v_financial public.transaction_subprocess_steps%rowtype;
  v_confirmations jsonb;
  v_answer jsonb;
  v_financial_answer jsonb;
  v_missing_lane text;
begin
  if new.step_key not in ('registered', 'post_registration_closeout_review', 'matter_closed') then return new; end if;
  select lane.transaction_id, lane.process_type into v_transaction_id, v_lane_key
  from public.transaction_subprocesses lane where lane.id = new.subprocess_id;
  if v_lane_key <> 'transfer' then return new; end if;
  if new.step_key in ('registered', 'post_registration_closeout_review')
    and tg_op = 'UPDATE' and old.status = 'completed' and new.status <> 'completed'
    and exists (select 1 from public.transaction_subprocess_steps closed
      where closed.subprocess_id = new.subprocess_id and closed.step_key = 'matter_closed'
        and closed.status = 'completed') then
    raise exception 'Reopen matter closure first; the earlier registration and close-out records will remain in history.'
      using errcode = '22023';
  end if;
  if new.step_key = 'registered' then return new; end if;
  if new.step_key = 'post_registration_closeout_review'
    and new.visibility_scope is distinct from 'internal' then
    raise exception 'Final-account notes must remain internal to the attorney firm.' using errcode = '42501';
  end if;
  if new.visibility_scope = 'client_visible' then
    raise exception 'Financial close-out and file closure notes are not client-visible. Publish a separate registration update to selected clients.'
      using errcode = '42501';
  end if;
  if new.status <> 'completed' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.comment is not distinct from new.comment then return new; end if;

  select step.* into v_registered from public.transaction_subprocess_steps step
  where step.subprocess_id = new.subprocess_id and step.step_key = 'registered';
  if v_registered.status is distinct from 'completed' then
    raise exception 'Confirm transfer registration before post-registration close-out.' using errcode = '22023';
  end if;
  select coalesce(saved.task_confirmations, '{}'::jsonb) into v_confirmations
  from public.attorney_task_confirmations saved where saved.step_id = new.id;
  v_answer := coalesce(v_confirmations -> case new.step_key
    when 'matter_closed' then 'matter_closure_confirmed'
    else 'final_account_position_reviewed' end, '{}'::jsonb);

  if new.step_key = 'post_registration_closeout_review' then
    if coalesce(v_answer ->> 'answer', '') <> 'yes' and not (
      v_answer ->> 'answer' = 'not_applicable'
      and nullif(pg_catalog.btrim(coalesce(v_answer ->> 'note', '')), '') is not null
    ) then
      raise exception 'Review the final account or record why it does not apply before financial close-out.'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if coalesce(v_answer ->> 'answer', '') <> 'yes' then
    raise exception 'Confirm the administrative file-closure checklist first.' using errcode = '22023';
  end if;
  select step.* into v_financial from public.transaction_subprocess_steps step
  where step.subprocess_id = new.subprocess_id and step.step_key = 'post_registration_closeout_review';
  if v_financial.status is distinct from 'completed' then
    raise exception 'Complete financial close-out before closing the matter.' using errcode = '22023';
  end if;
  select saved.task_confirmations -> 'final_account_position_reviewed' into v_financial_answer
  from public.attorney_task_confirmations saved where saved.step_id = v_financial.id;
  if coalesce(v_financial_answer ->> 'answer', '') <> 'yes' and not (
    v_financial_answer ->> 'answer' = 'not_applicable'
    and nullif(pg_catalog.btrim(coalesce(v_financial_answer ->> 'note', '')), '') is not null
  ) then
    raise exception 'Review the final-account decision before closing the matter.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.transaction_attorney_lane_updates update_row
    where update_row.transaction_id = v_transaction_id and update_row.lane_key = 'transfer'
      and update_row.update_type = 'transfer_journey_progress'
      and update_row.visibility = 'client_visible'
      and update_row.metadata #>> '{journeyBrief,stageKey}' = 'registration'
      and update_row.client_recipients ?| array['buyer', 'seller']
      and update_row.created_at >= v_registered.completed_at
  ) then
    raise exception 'Publish a registration-stage update to the selected buyer or seller portal before closing the matter.'
      using errcode = '22023';
  end if;
  select planned ->> 'laneKey' into v_missing_lane
  from public.transactions transaction_row
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(transaction_row.routing_profile_json #> '{workflowPlan,lanes}', '[]'::jsonb)) planned
  left join public.transaction_subprocesses lane
    on lane.transaction_id = transaction_row.id and lane.process_type = planned ->> 'laneKey'
  left join public.transaction_subprocess_steps step
    on step.subprocess_id = lane.id and step.step_key = case planned ->> 'laneKey'
      when 'bond' then 'bond_close_out_complete' else 'cancellation_close_out_complete' end
  where transaction_row.id = v_transaction_id and planned ->> 'laneKey' in ('bond', 'cancellation')
    and coalesce(step.status, 'not_started') <> 'completed'
  order by planned ->> 'laneKey' limit 1;
  if v_missing_lane is not null then
    raise exception 'Complete the % attorney close-out before closing the transfer matter.', v_missing_lane
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function journey_private.enforce_stage_six_closure()
  from public, anon, authenticated;
create trigger trg_enforce_stage_six_closure
before insert or update of status, comment, visibility_scope on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_stage_six_closure();

commit;
