begin;

-- The existing milestone gate checks the saved plan and the preceding task.
-- Recheck evidence at the actual transfer lodgement and registration writes;
-- neither a once-ready flag nor a stale browser snapshot is sufficient.
create function journey_private.enforce_stage_five_current_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_lane_key text;
  v_profile jsonb;
  v_tax jsonb;
  v_property jsonb;
  v_clearance jsonb;
  v_clearance_type text;
  v_document_key text;
  v_cross_lane text;
  v_cross_step text;
begin
  if new.status <> 'completed' or new.step_key not in
    ('lodgement_ready', 'lodged_at_deeds_office', 'registered') then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.comment is not distinct from new.comment then return new; end if;

  select lane.transaction_id, lane.process_type into v_transaction_id, v_lane_key
  from public.transaction_subprocesses lane where lane.id = new.subprocess_id;
  if v_lane_key <> 'transfer' then return new; end if;
  select t.routing_profile_json into v_profile from public.transactions t
  where t.id = v_transaction_id;
  v_tax := coalesce(v_profile -> 'transferTaxDecision',
    v_profile -> 'transfer_tax_decision', '{}'::jsonb);
  v_property := coalesce(v_profile #> '{mvpProfile,propertyConditions}', '{}'::jsonb);

  if coalesce(v_tax ->> 'status', '') <> 'confirmed'
    or coalesce(v_tax ->> 'route', '') not in
      ('transfer_duty', 'vat', 'zero_rated_going_concern', 'exempt')
    or coalesce(v_tax ->> 'sarsStatus', '') <> 'receipted'
    or nullif(pg_catalog.btrim(coalesce(v_tax ->> 'sarsProofReference', '')), '') is null then
    raise exception 'Recheck the confirmed tax route and SARS proof before recording the transfer milestone.'
      using errcode = '22023';
  end if;

  select requirement.document_definition_key into v_document_key
  from public.document_requirement_instances requirement
  where requirement.transaction_id = v_transaction_id
    and 'lodgement_ready' = any(requirement.stage_gates)
    and requirement.requirement_level in ('blocker', 'required')
    and (
      requirement.expiry_date <= pg_catalog.now()
      or (requirement.requirement_level = 'blocker'
        and requirement.status not in ('approved', 'completed'))
      or (requirement.requirement_level = 'required'
        and requirement.status not in ('approved', 'completed', 'waived'))
      or (requirement.status = 'waived'
        and nullif(pg_catalog.btrim(coalesce(requirement.waiver_reason, '')), '') is null)
    )
  order by requirement.document_definition_key limit 1;
  if v_document_key is not null then
    raise exception 'Recheck the required % document before recording transfer lodgement or registration.',
      v_document_key using errcode = '22023';
  end if;

  if new.step_key = 'registered' then
    -- A certificate's date in the confirmed matter facts may lapse even when
    -- the document row has no explicit expiry_date.
    for v_clearance_type in select value from (values
      ('municipal'), ('bodyCorporate'), ('hoa')) clearance(value)
    loop
      if v_clearance_type = 'bodyCorporate'
        and v_profile ->> 'propertyTenure' is distinct from 'sectional_title' then continue; end if;
      if v_clearance_type = 'hoa'
        and v_profile ->> 'propertyTenure' is distinct from 'estate_hoa'
        and v_profile ->> 'hoaApplicable' is distinct from 'yes' then continue; end if;
      v_clearance := coalesce(v_property #> array['clearances', v_clearance_type], '{}'::jsonb);
      if nullif(pg_catalog.btrim(coalesce(v_clearance ->> 'issuer', '')), '') is null
        or coalesce(v_clearance ->> 'validUntil', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or (v_clearance ->> 'validUntil')::date <= current_date then
        raise exception 'Recheck the current % clearance before transfer registration.',
          v_clearance_type using errcode = '22023';
      end if;
    end loop;
  end if;

  if new.step_key in ('lodged_at_deeds_office', 'registered') then
    v_cross_step := case new.step_key
      when 'registered' then 'lodged' else 'ready' end;
    select planned ->> 'laneKey' into v_cross_lane
    from pg_catalog.jsonb_array_elements(
      coalesce(v_profile #> '{workflowPlan,lanes}', '[]'::jsonb)) planned
    left join public.transaction_subprocesses lane
      on lane.transaction_id = v_transaction_id
      and lane.process_type = planned ->> 'laneKey'
    left join public.transaction_subprocess_steps step
      on step.subprocess_id = lane.id
      and step.step_key = case
        when planned ->> 'laneKey' = 'bond' and v_cross_step = 'ready'
          then 'bond_lodgement_ready'
        when planned ->> 'laneKey' = 'bond' then 'bond_lodged'
        when v_cross_step = 'ready' then 'cancellation_lodgement_ready'
        else 'cancellation_lodged' end
    where planned ->> 'laneKey' in ('bond', 'cancellation')
      and coalesce(step.status, 'not_started') <> 'completed'
    order by planned ->> 'laneKey' limit 1;
    if v_cross_lane is not null then
      raise exception 'The % attorney must confirm % before transfer %.',
        v_cross_lane, v_cross_step,
        case new.step_key when 'registered' then 'registration' else 'lodgement' end
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function journey_private.enforce_stage_five_current_evidence()
  from public, anon, authenticated;
create trigger trg_enforce_stage_five_current_evidence
before insert or update of status, comment on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_stage_five_current_evidence();

commit;
