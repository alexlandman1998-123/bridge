begin;

insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
) values
  ('transfer', 'cash_funding_source_review', pg_catalog.jsonb_build_object(
    'processKey', 'transfer', 'processLabel', 'Property transfer', 'stepKey', 'cash_funding_source_review',
    'ownerRole', 'transfer_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', pg_catalog.jsonb_build_object('title', 'Review Cash Funding Source',
      'description', 'Review the source and proof of the cash component before accepting payment security.')),
    'documents_guarantees', 'Documents & Guarantees', 3, 3),
  ('bond', 'bond_lodgement_instructions_confirmed', pg_catalog.jsonb_build_object(
    'processKey', 'bond', 'processLabel', 'Bond registration', 'stepKey', 'bond_lodgement_instructions_confirmed',
    'ownerRole', 'bond_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', pg_catalog.jsonb_build_object('title', 'Bank Lodgement Instructions Confirmed',
      'description', 'Confirm current bank instructions, conditions and coordinated lodgement.')),
    'bond_registration', 'Lodgement & Registration', 3, 0),
  ('cancellation', 'cancellation_guarantee_allocation_review', pg_catalog.jsonb_build_object(
    'processKey', 'cancellation', 'processLabel', 'Bond cancellation', 'stepKey', 'cancellation_guarantee_allocation_review',
    'ownerRole', 'cancellation_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', pg_catalog.jsonb_build_object('title', 'Review Settlement Guarantee Allocation',
      'description', 'Reconcile settlement figures with guarantees and the balance payable to the seller.')),
    'cancellation_documents', 'Guarantees & Documents', 2, 3),
  ('cancellation', 'cancellation_consent_confirmed', pg_catalog.jsonb_build_object(
    'processKey', 'cancellation', 'processLabel', 'Bond cancellation', 'stepKey', 'cancellation_consent_confirmed',
    'ownerRole', 'cancellation_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', pg_catalog.jsonb_build_object('title', 'Bondholder Consent Confirmed',
      'description', 'Verify written bondholder consent or its authorised cancellation instruction.')),
    'cancellation_documents', 'Guarantees & Documents', 2, 6),
  ('cancellation', 'cancellation_simultaneous_lodgement_confirmed', pg_catalog.jsonb_build_object(
    'processKey', 'cancellation', 'processLabel', 'Bond cancellation', 'stepKey', 'cancellation_simultaneous_lodgement_confirmed',
    'ownerRole', 'cancellation_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', pg_catalog.jsonb_build_object('title', 'Simultaneous Lodgement Confirmed',
      'description', 'Confirm the linked transfer, cancellation and buyer bond lodgement plan.')),
    'cancellation_registration', 'Registration & Close-Out', 3, 0)
on conflict (lane_key, step_key) do update set
  definition = excluded.definition, phase_key = excluded.phase_key,
  phase_label = excluded.phase_label, phase_order = excluded.phase_order, task_order = excluded.task_order;

-- The plan is the applicability contract. Insert new tasks before the
-- readiness milestone while retaining every existing outcome and audit row.
create or replace function journey_private.phase3_add_plan_step(
  p_plan jsonb, p_lane text, p_step text, p_before text
)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_lane jsonb;
  v_lanes jsonb := '[]'::jsonb;
  v_steps jsonb;
  v_key text;
  v_inserted boolean;
begin
  for v_lane in select value from pg_catalog.jsonb_array_elements(coalesce(p_plan -> 'lanes', '[]'::jsonb)) loop
    if v_lane ->> 'laneKey' = p_lane and not coalesce(v_lane -> 'stepKeys', '[]'::jsonb) ? p_step then
      v_steps := '[]'::jsonb;
      v_inserted := false;
      for v_key in select value from pg_catalog.jsonb_array_elements_text(coalesce(v_lane -> 'stepKeys', '[]'::jsonb)) loop
        if v_key = p_before then
          v_steps := v_steps || pg_catalog.to_jsonb(p_step);
          v_inserted := true;
        end if;
        v_steps := v_steps || pg_catalog.to_jsonb(v_key);
      end loop;
      if not v_inserted then v_steps := v_steps || pg_catalog.to_jsonb(p_step); end if;
      v_lane := pg_catalog.jsonb_set(v_lane, '{stepKeys}', v_steps);
      v_lane := pg_catalog.jsonb_set(v_lane, '{taskCount}', pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(v_steps)));
    end if;
    v_lanes := v_lanes || pg_catalog.jsonb_build_array(v_lane);
  end loop;
  return pg_catalog.jsonb_set(p_plan, '{lanes}', v_lanes);
end;
$$;

do $$
declare
  v_matter record;
  v_plan jsonb;
  v_finance text;
begin
  for v_matter in
    select t.id, t.routing_profile_json from public.transactions t
    where t.routing_profile_json #>> '{workflowPlan,version}' = 'attorney_matter_workflow_plan_v11'
      and t.routing_profile_json #>> '{workflowPlan,status}' = 'active'
      and pg_catalog.lower(coalesce(t.lifecycle_state, '')) not in
        ('registered', 'completed', 'archived', 'cancelled', 'canceled')
      and not exists (
        select 1 from public.transaction_subprocesses lane
        join public.transaction_subprocess_steps step on step.subprocess_id = lane.id
        where lane.transaction_id = t.id and lane.process_type = 'transfer'
          and step.step_key = 'lodged_at_deeds_office' and step.status = 'completed')
  loop
    v_plan := v_matter.routing_profile_json -> 'workflowPlan';
    v_finance := coalesce(v_matter.routing_profile_json ->> 'financeType',
      v_plan #>> '{configuration,financeType}', 'unknown');
    if v_finance in ('cash', 'hybrid', 'combination') then
      v_plan := journey_private.phase3_add_plan_step(v_plan, 'transfer',
        'cash_funding_source_review', 'payment_security_review');
    end if;
    v_plan := journey_private.phase3_add_plan_step(v_plan, 'transfer',
      'payment_security_review', 'lodgement_ready');
    v_plan := journey_private.phase3_add_plan_step(v_plan, 'bond',
      'bond_lodgement_instructions_confirmed', 'bond_lodgement_ready');
    v_plan := journey_private.phase3_add_plan_step(v_plan, 'cancellation',
      'cancellation_guarantee_allocation_review', 'cancellation_documents_prepared');
    v_plan := journey_private.phase3_add_plan_step(v_plan, 'cancellation',
      'cancellation_consent_confirmed', 'cancellation_lodgement_ready');
    v_plan := journey_private.phase3_add_plan_step(v_plan, 'cancellation',
      'cancellation_simultaneous_lodgement_confirmed', 'cancellation_lodgement_ready');
    v_plan := pg_catalog.jsonb_set(v_plan, '{version}', '"attorney_matter_workflow_plan_v12"'::jsonb);
    update public.transactions t set routing_profile_json = pg_catalog.jsonb_set(
      t.routing_profile_json, '{workflowPlan}', v_plan) where t.id = v_matter.id;
  end loop;
end;
$$;

drop function journey_private.phase3_add_plan_step(jsonb,text,text,text);

insert into public.transaction_subprocess_steps (
  subprocess_id, step_key, step_label, status, owner_type, sort_order, visibility_scope
)
select lane.id, task.value, catalog.definition #>> '{professional,title}',
  'not_started', 'attorney', task.ordinality, 'professional_shared'
from public.transactions t
join public.transaction_subprocesses lane on lane.transaction_id = t.id
cross join lateral pg_catalog.jsonb_array_elements(
  coalesce(t.routing_profile_json #> '{workflowPlan,lanes}', '[]'::jsonb)) plan_lane
cross join lateral pg_catalog.jsonb_array_elements_text(plan_lane -> 'stepKeys')
  with ordinality task(value, ordinality)
join journey_private.task_catalog catalog on catalog.lane_key = lane.process_type
  and catalog.step_key = task.value
where t.routing_profile_json #>> '{workflowPlan,version}' = 'attorney_matter_workflow_plan_v12'
  and plan_lane ->> 'laneKey' = lane.process_type
  and task.value in ('cash_funding_source_review', 'payment_security_review',
    'bond_lodgement_instructions_confirmed', 'cancellation_guarantee_allocation_review',
    'cancellation_consent_confirmed', 'cancellation_simultaneous_lodgement_confirmed')
  and not exists (
    select 1 from public.transaction_subprocess_steps lodged
    where lodged.subprocess_id = lane.id
      and lodged.step_key = case lane.process_type
        when 'transfer' then 'lodged_at_deeds_office'
        when 'bond' then 'bond_lodged' else 'cancellation_lodged' end
      and lodged.status = 'completed')
on conflict (subprocess_id, step_key) do nothing;

create or replace function journey_private.enforce_attorney_funding_handoffs()
returns trigger language plpgsql security definer set search_path = '' as $$
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
  if v_plan ->> 'version' is distinct from 'attorney_matter_workflow_plan_v12' then
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
        and d.document_definition_key in ('bond_cancellation_figures', 'cancellation_figures')
        and d.status in ('approved', 'completed')
        and d.expiry_date > pg_catalog.now()
    ) then
      raise exception 'Current approved cancellation figures with a future expiry date are required for lodgement.'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function journey_private.enforce_attorney_funding_handoffs()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_attorney_funding_handoffs on public.transaction_subprocess_steps;
create trigger trg_enforce_attorney_funding_handoffs
before insert or update of status, comment on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_attorney_funding_handoffs();

-- Funding evidence edits invalidate unlodged attestations. Time expiry is
-- rechecked at every lodgement command even without a document edit.
create or replace function journey_private.withdraw_readiness_on_funding_evidence_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.document_requirement_instances%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if v_row.document_definition_key not in (
    'bond_cancellation_figures', 'cancellation_figures',
    'guarantees', 'guarantee_letter', 'proof_of_funds') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.expiry_date is not distinct from new.expiry_date then return new; end if;
  perform journey_private.withdraw_unlodged_attorney_readiness(
    v_row.transaction_id, 'funding_evidence_changed:' || v_row.document_definition_key,
    case when v_row.document_definition_key in ('bond_cancellation_figures', 'cancellation_figures')
      then 'cancellation'
      when v_row.document_definition_key = 'proof_of_funds' then 'transfer'
      else null end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function journey_private.withdraw_readiness_on_funding_evidence_change()
  from public, anon, authenticated;

drop trigger if exists trg_withdraw_attorney_readiness_on_funding_evidence
  on public.document_requirement_instances;
create trigger trg_withdraw_attorney_readiness_on_funding_evidence
after insert or update or delete on public.document_requirement_instances
for each row execute function journey_private.withdraw_readiness_on_funding_evidence_change();

create or replace function journey_private.reopen_funding_reviews_on_profile_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_finance_changed boolean;
  v_security_changed boolean;
  v_seller_bond_changed boolean;
begin
  v_finance_changed := old.routing_profile_json ->> 'financeType'
    is distinct from new.routing_profile_json ->> 'financeType';
  v_security_changed := coalesce(old.routing_profile_json ->> 'paymentSecurity',
      old.routing_profile_json #>> '{mvpProfile,paymentSecurity}')
    is distinct from coalesce(new.routing_profile_json ->> 'paymentSecurity',
      new.routing_profile_json #>> '{mvpProfile,paymentSecurity}');
  v_seller_bond_changed := old.routing_profile_json ->> 'sellerHasExistingBond'
    is distinct from new.routing_profile_json ->> 'sellerHasExistingBond'
    or old.routing_profile_json ->> 'cancellationRequired'
    is distinct from new.routing_profile_json ->> 'cancellationRequired'
    or old.routing_profile_json #>> '{mvpProfile,cancellationWorkflow}'
    is distinct from new.routing_profile_json #>> '{mvpProfile,cancellationWorkflow}';
  if not (v_finance_changed or v_security_changed or v_seller_bond_changed) then return new; end if;

  update public.transaction_subprocess_steps step
  set status = 'not_started', completed_at = null, completed_by = null,
      updated_at = pg_catalog.now()
  from public.transaction_subprocesses lane
  where step.subprocess_id = lane.id and lane.transaction_id = new.id
    and lane.process_type in ('transfer', 'bond', 'cancellation')
    and step.status in ('completed', 'completed_externally', 'not_applicable')
    and not exists (
      select 1 from public.transaction_subprocess_steps lodged
      where lodged.subprocess_id = lane.id
        and lodged.step_key = case lane.process_type
          when 'transfer' then 'lodged_at_deeds_office'
          when 'bond' then 'bond_lodged' else 'cancellation_lodged' end
        and lodged.status = 'completed')
    and (
      (v_finance_changed and (
        (lane.process_type = 'transfer' and step.step_key in
          ('cash_funding_source_review', 'payment_security_review'))
        or (lane.process_type = 'bond' and step.step_key in
          ('bond_instruction_received', 'bank_requirements_confirmed',
           'bank_conditions_resolved', 'buyer_signed_bond_documents',
           'guarantees_issued', 'guarantee_wording_accepted',
           'bond_lodgement_instructions_confirmed'))
        or (lane.process_type = 'cancellation' and step.step_key in
          ('cancellation_guarantee_allocation_review',
           'cancellation_simultaneous_lodgement_confirmed'))))
      or (v_security_changed and (
        (lane.process_type = 'transfer' and step.step_key = 'payment_security_review')
        or (lane.process_type = 'bond' and step.step_key = 'guarantee_wording_accepted')
        or (lane.process_type = 'cancellation' and step.step_key = 'cancellation_guarantee_allocation_review')))
      or (v_seller_bond_changed and (
        (lane.process_type = 'transfer' and step.step_key in
          ('existing_bond_confirmed', 'payment_security_review'))
        or (lane.process_type = 'bond' and step.step_key = 'bond_lodgement_instructions_confirmed')
        or (lane.process_type = 'cancellation' and step.step_key in
          ('cancellation_existing_bond_confirmed', 'cancellation_figures_received',
           'figures_expiry_captured', 'cancellation_guarantee_allocation_review',
           'cancellation_consent_confirmed',
           'cancellation_simultaneous_lodgement_confirmed'))))
    );
  perform journey_private.withdraw_unlodged_attorney_readiness(
    new.id, 'funding_or_seller_bond_changed', null);
  return new;
end;
$$;

revoke all on function journey_private.reopen_funding_reviews_on_profile_change()
  from public, anon, authenticated;

drop trigger if exists trg_reopen_attorney_funding_reviews on public.transactions;
create trigger trg_reopen_attorney_funding_reviews
after update of routing_profile_json on public.transactions
for each row execute function journey_private.reopen_funding_reviews_on_profile_change();

commit;
