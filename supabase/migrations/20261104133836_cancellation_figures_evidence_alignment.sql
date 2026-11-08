-- The canonical catalogue uses settlement_figure; retain the historical aliases.
CREATE OR REPLACE FUNCTION journey_private.enforce_attorney_funding_handoffs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_matter uuid;
  v_lane text;
  v_plan jsonb;
  v_finance text;
  v_step text;
  v_missing text;
begin
  if new.status not in ('completed', 'completed_externally', 'not_applicable') then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.comment is not distinct from new.comment then return new; end if;
  select lane.transaction_id, lane.process_type into v_matter, v_lane
  from public.transaction_subprocesses lane where lane.id = new.subprocess_id;
  if v_lane not in ('transfer', 'bond', 'cancellation') then return new; end if;
  select t.routing_profile_json -> 'workflowPlan',
    coalesce(t.routing_profile_json ->> 'financeType',
      t.routing_profile_json #>> '{workflowPlan,configuration,financeType}', 'unknown')
  into v_plan, v_finance from public.transactions t where t.id = v_matter;

  if new.step_key = any(array[
    'cash_funding_source_review', 'bond_lodgement_instructions_confirmed',
    'cancellation_guarantee_allocation_review', 'cancellation_consent_confirmed',
    'cancellation_simultaneous_lodgement_confirmed'
  ]) then
    if new.status <> 'completed' or nullif(pg_catalog.btrim(coalesce(new.comment, '')), '') is null then
      raise exception 'Attorney-reviewed evidence and a recorded decision are required for %.', new.step_key
        using errcode = '22023';
    end if;
  end if;

  if new.step_key not in ('lodgement_ready', 'lodged_at_deeds_office',
    'bond_lodgement_ready', 'bond_lodged',
    'cancellation_lodgement_ready', 'cancellation_lodged') then return new; end if;
  if v_plan ->> 'version' not in ('attorney_matter_workflow_plan_v12', 'attorney_matter_workflow_plan_v13', 'attorney_matter_workflow_plan_v14') then
    raise exception 'Reconcile the current funding and cancellation task plan before lodgement.' using errcode = '22023';
  end if;

  if v_lane = 'transfer' then
    if v_finance in ('bond', 'hybrid', 'combination') and not exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) plan_lane
      where plan_lane ->> 'laneKey' = 'bond') then
      raise exception 'Buyer bond funding requires a bond-attorney lane.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.transactions t where t.id = v_matter
        and pg_catalog.lower(coalesce(t.routing_profile_json ->> 'sellerHasExistingBond', 'false'))
          in ('true', 'yes', '1')
    ) and not exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) plan_lane
      where plan_lane ->> 'laneKey' = 'cancellation') then
      raise exception 'Seller existing bond requires a cancellation-attorney lane.' using errcode = '22023';
    end if;
    if v_finance in ('cash', 'hybrid', 'combination') then
      select s.status into v_missing from public.transaction_subprocess_steps s
      where s.subprocess_id = new.subprocess_id and s.step_key = 'cash_funding_source_review';
      if v_missing is distinct from 'completed' then
        raise exception 'Review the cash funding source before transfer lodgement.' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.document_requirement_instances d
        where d.transaction_id = v_matter and d.document_definition_key = 'proof_of_funds'
          and d.status in ('approved', 'completed')
      ) then
        raise exception 'Approve cash source-of-funds evidence before transfer lodgement.' using errcode = '22023';
      end if;
    end if;
    select s.status into v_missing from public.transaction_subprocess_steps s
    where s.subprocess_id = new.subprocess_id and s.step_key = 'payment_security_review';
    if v_missing is distinct from 'completed' then
      raise exception 'Review cleared funds or accepted payment security before transfer lodgement.' using errcode = '22023';
    end if;
    select plan_lane ->> 'laneKey' into v_missing
    from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) plan_lane
    left join public.transaction_subprocesses linked_lane
      on linked_lane.transaction_id = v_matter and linked_lane.process_type = plan_lane ->> 'laneKey'
    left join public.transaction_subprocess_steps linked_ready
      on linked_ready.subprocess_id = linked_lane.id
      and linked_ready.step_key = case plan_lane ->> 'laneKey'
        when 'bond' then 'bond_lodgement_ready' else 'cancellation_lodgement_ready' end
    where plan_lane ->> 'laneKey' in ('bond', 'cancellation')
      and coalesce(linked_ready.status, 'not_started') <> 'completed'
    limit 1;
    if v_missing is not null then
      raise exception 'The % attorney must hand over lodgement readiness before transfer lodgement.', v_missing
        using errcode = '22023';
    end if;
  elsif v_lane = 'bond' then
    foreach v_step in array array['bond_instruction_received', 'bank_requirements_confirmed',
      'bank_conditions_resolved', 'buyer_signed_bond_documents', 'guarantees_issued',
      'guarantee_wording_accepted', 'bond_lodgement_instructions_confirmed'] loop
      select s.status into v_missing from public.transaction_subprocess_steps s
      where s.subprocess_id = new.subprocess_id and s.step_key = v_step;
      if v_missing is distinct from 'completed' then
        raise exception 'Complete and review % before bond lodgement.', v_step using errcode = '22023';
      end if;
    end loop;
    if not exists (
      select 1 from public.document_requirement_instances d
      where d.transaction_id = v_matter
        and d.document_definition_key in ('guarantees', 'guarantee_letter')
        and d.status in ('approved', 'completed')
        and (d.expiry_date is null or d.expiry_date > pg_catalog.now())
    ) then
      raise exception 'Approved current bond guarantees are required before bond lodgement.'
        using errcode = '22023';
    end if;
  end if;

  if v_lane = 'cancellation' or (v_lane = 'transfer' and exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_plan -> 'lanes', '[]'::jsonb)) plan_lane
    where plan_lane ->> 'laneKey' = 'cancellation')) then
    if v_lane = 'cancellation' then
      foreach v_step in array array['cancellation_existing_bond_confirmed',
        'cancellation_bank_captured', 'cancellation_bond_account_captured',
        'cancellation_instruction_received', 'notice_period_captured',
        'cancellation_figures_received', 'figures_expiry_captured',
        'cancellation_guarantees_accepted', 'cancellation_guarantee_allocation_review',
        'cancellation_consent_confirmed', 'cancellation_simultaneous_lodgement_confirmed'] loop
        select s.status into v_missing from public.transaction_subprocess_steps s
        where s.subprocess_id = new.subprocess_id and s.step_key = v_step;
        if v_missing is distinct from 'completed' then
          raise exception 'Complete and review % before cancellation lodgement.', v_step using errcode = '22023';
        end if;
      end loop;
      if not exists (
        select 1 from public.document_requirement_instances d
        where d.transaction_id = v_matter
          and d.document_definition_key in ('guarantees', 'guarantee_letter')
          and d.status in ('approved', 'completed')
          and (d.expiry_date is null or d.expiry_date > pg_catalog.now())
      ) then
        raise exception 'Approved cancellation guarantees are required before cancellation lodgement.'
          using errcode = '22023';
      end if;
    end if;
    if not exists (
      select 1 from public.document_requirement_instances d
      where d.transaction_id = v_matter
        and d.document_definition_key in ('bond_cancellation_figures', 'cancellation_figures', 'settlement_figure')
        and d.status in ('approved', 'completed')
        and d.expiry_date > pg_catalog.now()
    ) then
      raise exception 'Current approved cancellation figures with a future expiry date are required for lodgement.'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION journey_private.withdraw_readiness_on_funding_evidence_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.document_requirement_instances%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if v_row.document_definition_key not in (
    'bond_cancellation_figures', 'cancellation_figures', 'settlement_figure',
    'guarantees', 'guarantee_letter', 'proof_of_funds') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.expiry_date is not distinct from new.expiry_date then return new; end if;
  perform journey_private.withdraw_unlodged_attorney_readiness(
    v_row.transaction_id, 'funding_evidence_changed:' || v_row.document_definition_key,
    case when v_row.document_definition_key in ('bond_cancellation_figures', 'cancellation_figures', 'settlement_figure')
      then 'cancellation'
      when v_row.document_definition_key = 'proof_of_funds' then 'transfer'
      else null end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;


-- The task's checked date belongs to its current approved figures file. Keep
-- it in the canonical evidence used by the existing lodgement gate.
create function journey_private.capture_cancellation_figures_validity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_matter uuid; v_lane text; v_response jsonb; v_text text; v_date date;
 v_requirement public.document_requirement_instances%rowtype;
 v_prior jsonb:=coalesce(old.step_metadata->'cancellationFiguresEvidence','{}'::jsonb);
begin
 if new.step_key<>'figures_expiry_captured' or new.status<>'completed' then return new; end if;
 select transaction_id,process_type into v_matter,v_lane from public.transaction_subprocesses where id=new.subprocess_id;
 if v_lane<>'cancellation' then return new; end if;
 if auth.uid() is null or not public.bridge_can_mutate_attorney_lane(v_matter,'cancellation_attorney','workflow') then
  raise exception 'Only the appointed cancellation team may review figures validity.' using errcode='42501';
 end if;
 select task_confirmations->'evidence:figures_expiry_captured:0' into v_response
 from public.attorney_task_confirmations where step_id=new.id;
 v_text:=v_response#>>'{items,0,validUntil}';
 if v_response->>'answer' is distinct from 'yes' or v_text is null or v_text!~'^\d{4}-\d{2}-\d{2}$' then
  raise exception 'Record the checked expiry date from the current cancellation figures.' using errcode='22023';
 end if;
 begin v_date:=v_text::date;
 exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Record a valid cancellation figures expiry date.' using errcode='22023';
 end;
 if to_char(v_date,'YYYY-MM-DD')<>v_text then raise exception 'Record a valid cancellation figures expiry date.' using errcode='22023'; end if;
 select * into v_requirement from public.document_requirement_instances
 where transaction_id=v_matter and context_type='transaction'
  and document_definition_key in ('settlement_figure','bond_cancellation_figures','cancellation_figures')
  and status in ('approved','completed') and satisfied_by_document_id is not null
 order by updated_at desc,id limit 1 for update;
 if not found then raise exception 'Review the current cancellation figures document before recording its expiry.' using errcode='22023'; end if;
 if v_prior->>'documentId'=v_requirement.satisfied_by_document_id::text
    and nullif(v_prior->>'validUntil','') is not null and v_date>(v_prior->>'validUntil')::date then
  raise exception 'Upload and review replacement bank figures before extending their recorded expiry.' using errcode='22023';
 end if;
 update public.document_requirement_instances
 set expiry_date=(v_date::timestamp at time zone 'Africa/Johannesburg'),updated_at=now()
 where id=v_requirement.id and expiry_date is distinct from (v_date::timestamp at time zone 'Africa/Johannesburg');
 new.step_metadata:=coalesce(new.step_metadata,'{}'::jsonb)||jsonb_build_object('cancellationFiguresEvidence',
  jsonb_build_object('requirementId',v_requirement.id,'documentId',v_requirement.satisfied_by_document_id,'validUntil',v_text));
 return new;
end;
$$;
revoke all on function journey_private.capture_cancellation_figures_validity() from public,anon,authenticated;
create trigger a_capture_cancellation_figures_validity before update of status,comment on public.transaction_subprocess_steps
for each row execute function journey_private.capture_cancellation_figures_validity();

-- A different file or withdrawn approval must not inherit the prior file's
-- validity attestation. Preserve completed, lodged and historical outcomes.
create function journey_private.invalidate_replaced_cancellation_figures()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.document_definition_key not in ('settlement_figure','bond_cancellation_figures','cancellation_figures') then return new; end if;
 if old.satisfied_by_document_id is distinct from new.satisfied_by_document_id or
    (old.status in ('approved','completed') and new.status not in ('approved','completed')) then
  new.expiry_date:=null;
  update public.transaction_subprocess_steps s
  set status='not_started',completed_at=null,completed_by=null,updated_at=now()
  from public.transaction_subprocesses l,public.transactions t
  where s.subprocess_id=l.id and l.transaction_id=new.transaction_id and l.process_type='cancellation'
   and t.id=l.transaction_id and t.registered_at is null and coalesce(t.lifecycle_state,'active') not in ('completed','registered','archived','cancelled')
   and s.step_key='figures_expiry_captured' and s.status='completed'
   and not exists(select 1 from public.transaction_subprocess_steps lodged where lodged.subprocess_id=l.id and lodged.step_key='cancellation_lodged' and lodged.status='completed');
 end if;
 return new;
end;
$$;
revoke all on function journey_private.invalidate_replaced_cancellation_figures() from public,anon,authenticated;
create trigger a_invalidate_replaced_cancellation_figures before update of satisfied_by_document_id,status on public.document_requirement_instances
for each row execute function journey_private.invalidate_replaced_cancellation_figures();
