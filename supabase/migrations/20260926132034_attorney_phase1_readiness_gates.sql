begin;

-- The browser's completion hints are advisory. A row trigger applies this
-- check to both the atomic command and direct table writes.
create or replace function journey_private.assert_attorney_milestone_ready(
  p_transaction_id uuid,
  p_lane_key text,
  p_step_key text,
  p_status text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_profile jsonb;
  v_tax jsonb;
  v_ready_key text;
  v_lodged_key text;
  v_registered_key text;
  v_missing text;
  v_critical text[];
  v_document_missing text;
begin
  if p_status = 'completed' and p_step_key = any(array[
    'title_deed_checked', 'transfer_tax_route_confirmed',
    'transfer_duty_tdc01_submission', 'sars_evidence_request_response',
    'transfer_duty_assessment_payment', 'vat_exemption_evidence_verified',
    'non_resident_seller_withholding_review', 'sars_transfer_tax_receipt_verified',
    'municipal_rates_clearance_review', 'levy_hoa_clearance_review',
    'transfer_document_pack_review', 'buyer_signing_review',
    'seller_signing_review', 'payment_security_review',
    'bond_approval_letter_received', 'buyer_signed_bond_documents',
    'bank_approval_to_lodge_received', 'guarantee_wording_accepted',
    'cancellation_figures_received', 'figures_expiry_captured',
    'cancellation_guarantees_accepted', 'seller_cancellation_documents_signed'
  ]) and nullif(pg_catalog.btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Record the attorney evidence decision before completing this task.'
      using errcode = '22023';
  end if;
  v_ready_key := case p_lane_key
    when 'transfer' then 'lodgement_ready'
    when 'bond' then 'bond_lodgement_ready'
    when 'cancellation' then 'cancellation_lodgement_ready'
  end;
  v_lodged_key := case p_lane_key
    when 'transfer' then 'lodged_at_deeds_office'
    when 'bond' then 'bond_lodged'
    when 'cancellation' then 'cancellation_lodged'
  end;
  v_registered_key := case p_lane_key
    when 'transfer' then 'registered'
    when 'bond' then 'bond_registered'
    when 'cancellation' then 'cancellation_registered'
  end;
  if p_step_key not in (v_ready_key, v_lodged_key, v_registered_key)
    or p_status not in ('completed', 'completed_externally', 'not_applicable') then
    return;
  end if;
  if p_status <> 'completed' then
    raise exception 'A lodgement or registration milestone needs the responsible attorney to confirm it; external completion and not-applicable are unavailable.'
      using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Record the attorney readiness or milestone attestation before completing this task.'
      using errcode = '22023';
  end if;

  select t.routing_profile_json -> 'workflowPlan',
         t.routing_profile_json -> 'matterProfile',
         coalesce(t.routing_profile_json -> 'transferTaxDecision',
                  t.routing_profile_json -> 'transfer_tax_decision', '{}'::jsonb)
  into v_plan, v_profile, v_tax
  from public.transactions t where t.id = p_transaction_id;
  if coalesce(v_plan ->> 'status', '') <> 'active'
    or coalesce(v_plan ->> 'provisional', 'true') <> 'false'
    or coalesce(v_profile ->> 'status', '') <> 'confirmed'
    or (v_plan ->> 'matterProfileFingerprint') is distinct from (v_profile ->> 'factFingerprint')
    or (v_plan ->> 'matterProfileRevision') is distinct from (v_profile ->> 'revision') then
    raise exception 'Confirm and reconcile the current matter profile before a lodgement or registration milestone.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) lane
    where lane ->> 'laneKey' = p_lane_key and (lane -> 'stepKeys') ? p_step_key
  ) then
    raise exception 'This milestone is not in the active matter plan.' using errcode = '22023';
  end if;

  if p_lane_key = 'transfer' and p_step_key in (v_ready_key, v_lodged_key) then
    -- Recheck at actual lodgement because a document may expire after the
    -- attorney first attested readiness.
    select requirement.document_definition_key into v_document_missing
    from public.document_requirement_instances requirement
    where requirement.transaction_id = p_transaction_id
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
    if v_document_missing is not null then
      raise exception 'Review the required % document before transfer lodgement.',
        v_document_missing using errcode = '22023';
    end if;
  end if;

  if p_step_key = v_ready_key then
    -- Work can be done out of order; readiness needs all earlier applicable
    -- decisions resolved. N/A and external outcomes remain visible decisions.
    select task.key into v_missing
    from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) lane
    cross join lateral pg_catalog.jsonb_array_elements_text(lane -> 'stepKeys') with ordinality task(key, position)
    join public.transaction_subprocesses l on l.transaction_id = p_transaction_id
      and l.process_type = p_lane_key
    left join public.transaction_subprocess_steps s on s.subprocess_id = l.id and s.step_key = task.key
    where lane ->> 'laneKey' = p_lane_key
      and task.position < (
        select ready.position
        from pg_catalog.jsonb_array_elements_text(lane -> 'stepKeys') with ordinality ready(key, position)
        where ready.key = v_ready_key
      )
      and coalesce(s.status, 'not_started') not in ('completed', 'completed_externally', 'not_applicable')
    order by task.position limit 1;
    if v_missing is not null then
      raise exception 'Resolve % before confirming lodgement readiness.', v_missing using errcode = '22023';
    end if;

    v_critical := case p_lane_key
      when 'transfer' then array[
        'title_deed_checked', 'transfer_tax_route_confirmed', 'sars_transfer_tax_receipt_verified',
        'municipal_rates_clearance_review', 'levy_hoa_clearance_review',
        'transfer_document_pack_review', 'buyer_signing_review', 'seller_signing_review',
        'payment_security_review']
      when 'bond' then array[
        'bond_approval_letter_received', 'buyer_signed_bond_documents',
        'bank_approval_to_lodge_received', 'guarantee_wording_accepted']
      when 'cancellation' then array[
        'cancellation_figures_received', 'figures_expiry_captured',
        'cancellation_guarantees_accepted', 'seller_cancellation_documents_signed']
    end;
    if p_lane_key = 'transfer' then
      if coalesce(v_tax ->> 'status', '') <> 'confirmed'
        or coalesce(v_tax ->> 'route', '') in ('', 'needs_tax_advice') then
        raise exception 'Confirm the transfer-tax route before lodgement readiness.' using errcode = '22023';
      end if;
      if v_tax ->> 'route' = 'transfer_duty' then
        v_critical := v_critical || array['transfer_duty_tdc01_submission',
          'sars_evidence_request_response', 'transfer_duty_assessment_payment'];
      else
        v_critical := v_critical || array['vat_exemption_evidence_verified'];
      end if;
      v_critical := v_critical || array['non_resident_seller_withholding_review'];
    end if;
    select task.key into v_missing
    from pg_catalog.unnest(v_critical) task(key)
    join pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) lane
      on lane ->> 'laneKey' = p_lane_key and (lane -> 'stepKeys') ? task.key
    left join public.transaction_subprocesses l on l.transaction_id = p_transaction_id
      and l.process_type = p_lane_key
    left join public.transaction_subprocess_steps s on s.subprocess_id = l.id and s.step_key = task.key
    where coalesce(s.status, 'not_started') <> 'completed'
    limit 1;
    if v_missing is not null then
      raise exception 'Attorney-reviewed completion of % is required before lodgement readiness.', v_missing
        using errcode = '22023';
    end if;

    if p_lane_key = 'transfer' then
      select lane ->> 'laneKey' into v_missing
      from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) lane
      left join public.transaction_subprocesses l on l.transaction_id = p_transaction_id
        and l.process_type = lane ->> 'laneKey'
      left join public.transaction_subprocess_steps s on s.subprocess_id = l.id
        and s.step_key = case lane ->> 'laneKey'
          when 'bond' then 'bond_lodgement_ready'
          when 'cancellation' then 'cancellation_lodgement_ready' end
      where lane ->> 'laneKey' in ('bond', 'cancellation')
        and coalesce(s.status, 'not_started') <> 'completed'
      limit 1;
      if v_missing is not null then
        raise exception 'The % attorney must confirm lane readiness before transfer lodgement readiness.', v_missing
          using errcode = '22023';
      end if;
    end if;
  elsif p_step_key = v_lodged_key or p_step_key = v_registered_key then
    select coalesce(s.status, 'not_started') into v_missing
    from public.transaction_subprocesses l
    left join public.transaction_subprocess_steps s on s.subprocess_id = l.id
      and s.step_key = case when p_step_key = v_lodged_key then v_ready_key else v_lodged_key end
    where l.transaction_id = p_transaction_id and l.process_type = p_lane_key;
    if v_missing is distinct from 'completed' then
      raise exception 'The preceding lodgement milestone must be confirmed first.' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function journey_private.assert_attorney_milestone_ready(uuid,text,text,text,text)
  from public, anon, authenticated;

create or replace function journey_private.enforce_attorney_task_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_lane_key text;
begin
  if new.status not in ('completed', 'completed_externally', 'not_applicable') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.comment is not distinct from new.comment then return new; end if;
  end if;
  select lane.transaction_id, lane.process_type into v_transaction_id, v_lane_key
  from public.transaction_subprocesses lane where lane.id = new.subprocess_id;
  if v_lane_key in ('transfer', 'bond', 'cancellation') then
    perform journey_private.assert_attorney_milestone_ready(
      v_transaction_id, v_lane_key, new.step_key, new.status, new.comment);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_attorney_task_outcome on public.transaction_subprocess_steps;
create trigger trg_enforce_attorney_task_outcome
before insert or update of status, comment on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_attorney_task_outcome();

-- A corrected plan or reopened prerequisite withdraws an unlodged readiness
-- attestation. The actual lodgement and registration events remain historical.
create or replace function journey_private.withdraw_unlodged_attorney_readiness(
  p_transaction_id uuid,
  p_reason text,
  p_lane_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lane record;
  v_ready_key text;
  v_lodged_key text;
  v_changed integer;
begin
  for v_lane in
    select l.id, l.process_type from public.transaction_subprocesses l
    where l.transaction_id = p_transaction_id
      and l.process_type in ('transfer', 'bond', 'cancellation')
      and (p_lane_key is null or l.process_type = p_lane_key
        or (p_lane_key in ('bond', 'cancellation') and l.process_type = 'transfer'))
  loop
    v_ready_key := case v_lane.process_type
      when 'transfer' then 'lodgement_ready'
      when 'bond' then 'bond_lodgement_ready'
      else 'cancellation_lodgement_ready' end;
    v_lodged_key := case v_lane.process_type
      when 'transfer' then 'lodged_at_deeds_office'
      when 'bond' then 'bond_lodged'
      else 'cancellation_lodged' end;
    if exists (
      select 1 from public.transaction_subprocess_steps lodged
      where lodged.subprocess_id = v_lane.id and lodged.step_key = v_lodged_key
        and lodged.status = 'completed'
    ) then continue; end if;
    update public.transaction_subprocess_steps s
    set status = 'not_started', completed_at = null, completed_by = null,
        comment = null, updated_at = pg_catalog.now()
    where s.subprocess_id = v_lane.id and s.step_key = v_ready_key
      and s.status in ('completed', 'completed_externally', 'not_applicable');
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      update public.transaction_subprocesses
      set lane_status = 'in_progress', status = 'in_progress',
          current_stage = v_ready_key, completed_at = null, updated_at = pg_catalog.now()
      where id = v_lane.id;
      insert into public.transaction_events (
        transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
      ) values (
        p_transaction_id, 'AttorneyReadinessWithdrawn',
        pg_catalog.jsonb_build_object('laneKey', v_lane.process_type,
          'stepKey', v_ready_key, 'reason', p_reason),
        auth.uid(),
        coalesce((select lower(profile.role) from public.profiles profile
          where profile.id = auth.uid()), 'system'),
        'internal'
      );
    end if;
  end loop;
end;
$$;

revoke all on function journey_private.withdraw_unlodged_attorney_readiness(uuid,text,text)
  from public, anon, authenticated;

create or replace function journey_private.withdraw_readiness_on_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.document_requirement_instances%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if v_row.transaction_id is null
    or 'lodgement_ready' <> all(v_row.stage_gates)
    or v_row.requirement_level not in ('blocker', 'required') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.expiry_date is not distinct from new.expiry_date
      and old.waiver_reason is not distinct from new.waiver_reason
      and old.requirement_level is not distinct from new.requirement_level then
      return new;
    end if;
  end if;
  perform journey_private.withdraw_unlodged_attorney_readiness(
    v_row.transaction_id, 'lodgement_document_changed:' || v_row.document_definition_key, 'transfer');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_withdraw_attorney_readiness_on_document_change
  on public.document_requirement_instances;
create trigger trg_withdraw_attorney_readiness_on_document_change
after insert or update or delete on public.document_requirement_instances
for each row execute function journey_private.withdraw_readiness_on_document_change();

create or replace function journey_private.withdraw_readiness_on_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_lane_key text;
  v_lodged_key text;
begin
  if pg_catalog.pg_trigger_depth() > 1 or old.status is not distinct from new.status
    or old.status not in ('completed', 'completed_externally', 'not_applicable')
    or new.status = 'completed' then return new; end if;
  select l.transaction_id, l.process_type into v_transaction_id, v_lane_key
  from public.transaction_subprocesses l where l.id = new.subprocess_id;
  if v_lane_key not in ('transfer', 'bond', 'cancellation') then return new; end if;
  v_lodged_key := case v_lane_key
    when 'transfer' then 'lodged_at_deeds_office'
    when 'bond' then 'bond_lodged'
    else 'cancellation_lodged' end;
  if new.step_key in (v_lodged_key, 'registered', 'bond_registered',
    'cancellation_registered', 'post_registration_closeout_review',
    'matter_closed', 'bond_close_out_complete', 'settlement_proof_captured',
    'cancellation_close_out_complete') then return new; end if;
  perform journey_private.withdraw_unlodged_attorney_readiness(
    v_transaction_id, 'prerequisite_reopened:' || new.step_key, v_lane_key);
  return new;
end;
$$;

drop trigger if exists trg_withdraw_attorney_readiness_on_task_change
  on public.transaction_subprocess_steps;
create trigger trg_withdraw_attorney_readiness_on_task_change
after update of status on public.transaction_subprocess_steps
for each row execute function journey_private.withdraw_readiness_on_task_change();

create or replace function journey_private.withdraw_readiness_on_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.routing_profile_json #> '{workflowPlan,lanes}')
      is distinct from (new.routing_profile_json #> '{workflowPlan,lanes}')
    or (old.routing_profile_json #> '{workflowPlan,scenarioFingerprint}')
      is distinct from (new.routing_profile_json #> '{workflowPlan,scenarioFingerprint}')
    or (old.routing_profile_json -> 'transferTaxDecision')
      is distinct from (new.routing_profile_json -> 'transferTaxDecision')
    or (old.routing_profile_json #> '{matterProfile,factFingerprint}')
      is distinct from (new.routing_profile_json #> '{matterProfile,factFingerprint}')
  then
    perform journey_private.withdraw_unlodged_attorney_readiness(new.id, 'matter_profile_changed');
    perform public.bridge_recompute_matter_lifecycle_from_attorney_workflows(
      new.id, auth.uid(), null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_withdraw_attorney_readiness_on_plan_change
  on public.transactions;
create trigger trg_withdraw_attorney_readiness_on_plan_change
after update of routing_profile_json on public.transactions
for each row execute function journey_private.withdraw_readiness_on_plan_change();

commit;
