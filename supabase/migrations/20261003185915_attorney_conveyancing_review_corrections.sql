begin;

-- Corrective helpers are defined before replacing the existing guards.
create function journey_private.attorney_review_date(p_value text)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(p_value,'') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p_value::date;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end; $$;

create function journey_private.attorney_electrical_not_applicable(p_matter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(t.routing_profile_json #>> '{mvpProfile,propertyConditions,certificates,electrical}'='no'
    and nullif(pg_catalog.btrim(coalesce(t.routing_profile_json #>> '{mvpProfile,propertyConditions,electricalBasisNote}','')),'') is not null
    and exists (select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
      where l.transaction_id=t.id and l.process_type='transfer' and s.step_key='property_conditions_applicability_review' and s.status='completed'),false)
  from public.transactions t where t.id=p_matter;
$$;

create function journey_private.assert_attorney_withholding_remittance(p_review jsonb, p_closing boolean)
returns void language plpgsql stable set search_path = '' as $$
declare v_due date; v_withheld date; v_today date := (pg_catalog.now() at time zone 'Africa/Johannesburg')::date; v_field text;
begin
  if p_review ->> 'applicable' is distinct from 'yes' or p_review ->> 'withholdingRequired' is distinct from 'yes' then return; end if;
  if nullif(pg_catalog.btrim(coalesce(p_review ->> 'paymentReference','')),'') is not null then return; end if;
  if p_closing then raise exception 'Withholding remittance payment proof is required before financial close-out.' using errcode='22023'; end if;
  foreach v_field in array array['reservedFundsReference','remittanceOwner','paymentEvent'] loop
    if nullif(pg_catalog.btrim(coalesce(p_review ->> v_field,'')),'') is null then
      raise exception 'Record reserved withholding funds, a remittance owner and the reviewed payment event.' using errcode='22023'; end if;
  end loop;
  v_due := journey_private.attorney_review_date(p_review ->> 'dueOn');
  if coalesce(p_review ->> 'remittanceStatus','unknown') not in ('planned','withheld') or v_due is null or v_due <= v_today then
    raise exception 'Record a future remittance deadline or the payment proof when due.' using errcode='22023'; end if;
  if p_review ->> 'remittanceStatus'='withheld' then
    v_withheld := journey_private.attorney_review_date(p_review ->> 'withheldOn');
    if v_withheld is null or v_withheld > v_today or coalesce(p_review ->> 'purchaserResidence','unknown') not in ('resident','non_resident')
      or v_due < v_withheld or v_due > v_withheld + (case p_review ->> 'purchaserResidence' when 'resident' then 14 else 28 end) then
      raise exception 'Record the actual withholding date, purchaser residence and deadline within the applicable remittance period.' using errcode='22023'; end if;
  end if;
end; $$;

create function journey_private.assert_attorney_seller_withholding_review(p_review jsonb,p_closing boolean)
returns void language plpgsql stable set search_path = '' as $$
begin
  if coalesce(p_review ->> 'applicable','') not in ('yes','no') or nullif(pg_catalog.btrim(coalesce(p_review ->> 'basisNote','')),'') is null then
    raise exception 'Record the current seller-specific withholding applicability and basis.' using errcode='22023'; end if;
  if p_review ->> 'applicable'='yes' then
    if coalesce(p_review ->> 'directiveStatus','') not in ('issued','not_required') or
      coalesce(p_review ->> 'withholdingRequired','') not in ('yes','no') or
      nullif(pg_catalog.btrim(coalesce(p_review ->> 'proofReference','')),'') is null or
      (p_review ->> 'directiveStatus'='issued' and nullif(pg_catalog.btrim(coalesce(p_review ->> 'directiveReference','')),'') is null) then
      raise exception 'Record the current seller-specific directive, withholding and evidence decision.' using errcode='22023'; end if;
    perform journey_private.assert_attorney_withholding_remittance(p_review,p_closing);
  end if;
end; $$;
revoke all on function journey_private.assert_attorney_seller_withholding_review(jsonb,boolean) from public,anon,authenticated;

create function journey_private.attorney_registration_communicated(p_matter uuid,p_step uuid,p_registered_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_response jsonb; v_item jsonb; v_party jsonb; v_role text; v_profile jsonb; v_roles text[] := array[]::text[]; v_covered text[] := array[]::text[]; v_sent date;
begin
  select routing_profile_json into v_profile from public.transactions where id=p_matter;
  for v_party in select value from pg_catalog.jsonb_array_elements(coalesce(v_profile #> '{scenarioProfile,parties}','[]'::jsonb)) loop
    if v_party ->> 'role' in ('buyer','seller') then v_roles := pg_catalog.array_append(v_roles,v_party ->> 'role'); end if;
  end loop;
  for v_item in select pg_catalog.jsonb_build_object('audience',r.value)
    from public.transaction_attorney_lane_updates u cross join lateral pg_catalog.jsonb_array_elements_text(u.client_recipients) r(value)
    where u.transaction_id=p_matter and u.lane_key='transfer' and u.update_type='transfer_journey_progress'
      and u.visibility='client_visible' and u.metadata #>> '{journeyBrief,stageKey}'='registration'
      and u.created_at >= p_registered_at loop
    if v_item ->> 'audience' in ('buyer','seller') then v_covered := pg_catalog.array_append(v_covered,v_item ->> 'audience'); end if;
  end loop;
  select task_confirmations -> 'registration_communication_review' into v_response from public.attorney_task_confirmations where step_id=p_step;
  if v_response ->> 'answer'='yes' then
    for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(v_response -> 'items','[]'::jsonb)) loop
      v_sent := journey_private.attorney_review_date(v_item ->> 'sentOn');
      if v_sent is null or v_sent < (p_registered_at at time zone 'Africa/Johannesburg')::date or
        v_sent > (pg_catalog.now() at time zone 'Africa/Johannesburg')::date or
        coalesce(v_item ->> 'channel','') not in ('email','letter','phone','meeting','portal','other') or
        nullif(pg_catalog.btrim(coalesce(v_item ->> 'reference','')),'') is null or nullif(pg_catalog.btrim(coalesce(v_item ->> 'recipients','')),'') is null then continue; end if;
      if v_item ->> 'audience'='both' then v_covered := v_covered || array['buyer','seller'];
      elsif v_item ->> 'audience' in ('buyer','seller') then v_covered := pg_catalog.array_append(v_covered,v_item ->> 'audience'); end if;
    end loop;
  end if;
  if pg_catalog.array_length(v_roles,1) is null then return v_covered && array['buyer','seller']; end if;
  foreach v_role in array v_roles loop if not v_role=any(v_covered) then return false; end if; end loop;
  return true;
end; $$;

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
      and not (requirement.document_definition_key = 'electrical_compliance_certificate'
        and journey_private.attorney_electrical_not_applicable(p_transaction_id))
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
        'cancellation_guarantees_accepted', 'cancellation_consent_confirmed']
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

create or replace function journey_private.enforce_attorney_phase4_tax_clearances()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_matter uuid;
  v_lane text;
  v_profile jsonb;
  v_tax jsonb;
  v_property jsonb;
  v_required text[];
  v_step text;
  v_seller jsonb;
  v_review jsonb;
  v_claim jsonb;
  v_applicable_claim boolean;
  v_type text;
  v_doc text;
  v_clearance jsonb;
begin
  if new.status not in ('completed','completed_externally','not_applicable') then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.comment is not distinct from new.comment then return new; end if;
  select lane.transaction_id,lane.process_type into v_matter,v_lane
    from public.transaction_subprocesses lane where lane.id=new.subprocess_id;
  if v_lane <> 'transfer' then return new; end if;
  select routing_profile_json into v_profile from public.transactions where id=v_matter;
  if v_profile #>> '{workflowPlan,version}' not in ('attorney_matter_workflow_plan_v13','attorney_matter_workflow_plan_v14') then return new; end if;
  v_required := journey_private.phase4_required_transfer_steps(v_profile);
  if new.step_key = any(v_required) then
    if new.status <> 'completed' or nullif(pg_catalog.btrim(coalesce(new.comment,'')),'') is null then
      raise exception 'Attorney-reviewed evidence and a note are required for %.',new.step_key using errcode='22023';
    end if;
  end if;
  if new.step_key not in ('lodgement_ready','lodged_at_deeds_office') then return new; end if;
  v_tax := coalesce(v_profile -> 'transferTaxDecision','{}'::jsonb);
  v_property := coalesce(v_profile #> '{mvpProfile,propertyConditions}','{}'::jsonb);
  if coalesce(v_tax ->> 'status','') <> 'confirmed' or
    coalesce(v_tax ->> 'route','') not in ('transfer_duty','vat','zero_rated_going_concern','exempt') or
    coalesce(v_tax ->> 'sarsStatus','') <> 'receipted' or
    nullif(pg_catalog.btrim(coalesce(v_tax ->> 'basisNote','')),'') is null or
    nullif(pg_catalog.btrim(coalesce(v_tax ->> 'sarsProofReference','')),'') is null then
    raise exception 'Confirmed tax basis and SARS proof are required before transfer lodgement.' using errcode='22023';
  end if;
  case v_tax ->> 'route'
    when 'transfer_duty' then
      if nullif(v_tax ->> 'tdc01Reference','') is null or
        coalesce(v_tax ->> 'dutyPaymentRequired','unknown') not in ('yes','no') then
        raise exception 'TDC01 proof and duty payment applicability are required.' using errcode='22023'; end if;
      if v_tax ->> 'dutyPaymentRequired'='yes' and
        (nullif(v_tax ->> 'assessmentReference','') is null or nullif(v_tax ->> 'paymentReference','') is null) then
        raise exception 'SARS assessment and duty payment proof are required.' using errcode='22023'; end if;
    when 'vat' then
      if coalesce(v_tax ->> 'sellerVatRegistered','unknown')<>'yes' or
        coalesce(v_tax ->> 'supplyInCourseOfEnterprise','unknown')<>'yes' or
        nullif(v_tax ->> 'sellerVatNumberReference','') is null then
        raise exception 'VAT vendor and enterprise evidence are required.' using errcode='22023'; end if;
    when 'zero_rated_going_concern' then
      if coalesce(v_tax ->> 'sellerVatRegistered','unknown')<>'yes' or
        coalesce(v_tax ->> 'supplyInCourseOfEnterprise','unknown')<>'yes' or
        nullif(v_tax ->> 'sellerVatNumberReference','') is null or
        coalesce(v_tax ->> 'buyerVatRegistered','unknown')<>'yes' or
        nullif(v_tax ->> 'buyerVatNumberReference','') is null or
        nullif(v_tax ->> 'goingConcernAgreementReference','') is null then
        raise exception 'Going-concern agreement and VAT evidence are required.' using errcode='22023'; end if;
    when 'exempt' then
      v_applicable_claim := false;
      if pg_catalog.jsonb_array_length(coalesce(v_tax -> 'exemptionClaims','[]'::jsonb)) > 0 then
        for v_claim in select value from pg_catalog.jsonb_array_elements(v_tax -> 'exemptionClaims') loop
          if coalesce(v_claim ->> 'applicable','unknown') not in ('yes','no') or
            nullif(pg_catalog.btrim(coalesce(v_claim ->> 'statutoryBasis','')),'') is null or
            nullif(pg_catalog.btrim(coalesce(v_claim ->> 'appliesTo','')),'') is null or
            nullif(pg_catalog.btrim(coalesce(v_claim ->> 'basisNote','')),'') is null then
            raise exception 'Each claimed exemption needs an applicability and attorney basis.' using errcode='22023'; end if;
          if v_claim ->> 'applicable'='yes' then
            v_applicable_claim := true;
            if nullif(pg_catalog.btrim(coalesce(v_claim ->> 'evidenceReference','')),'') is null then
              raise exception 'Each applicable exemption needs supporting proof.' using errcode='22023'; end if;
          end if;
        end loop;
      elsif nullif(v_tax ->> 'exemptionType','') is not null and
        nullif(v_tax ->> 'exemptionEvidenceReference','') is not null then
        v_applicable_claim := true;
      end if;
      if not v_applicable_claim then
        raise exception 'An applicable statutory exemption and its evidence are required.' using errcode='22023'; end if;
  end case;
  if (v_tax ->> 'sarsEvidenceRequest'='yes' or v_tax ->> 'sarsStatus'='query')
    and nullif(v_tax ->> 'sarsQueryResponseReference','') is null then
    raise exception 'The SARS evidence request response is required.' using errcode='22023'; end if;
  for v_seller in select value from pg_catalog.jsonb_array_elements(coalesce(v_profile #> '{scenarioProfile,parties}','[]'::jsonb)) loop
    if v_seller ->> 'role' <> 'seller' or v_seller ->> 'taxResidence'='south_africa' then continue; end if;
    v_review := coalesce(v_tax #> array['nonResidentSellers',v_seller ->> 'id'],'{}'::jsonb);
    if coalesce(v_review ->> 'applicable','unknown') not in ('yes','no') then
      raise exception 'Review withholding applicability for seller %.',v_seller ->> 'id' using errcode='22023'; end if;
    if nullif(pg_catalog.btrim(coalesce(v_review ->> 'basisNote','')),'') is null then
      raise exception 'Record the seller-specific withholding basis for %.',v_seller ->> 'id' using errcode='22023'; end if;
    if v_review ->> 'applicable'='yes' then
      if coalesce(v_review ->> 'directiveStatus','unknown') not in ('issued','not_required') or
        coalesce(v_review ->> 'withholdingRequired','unknown') not in ('yes','no') or
        nullif(v_review ->> 'proofReference','') is null then
        raise exception 'Directive, withholding and proof decisions are required for seller %.',v_seller ->> 'id' using errcode='22023'; end if;
      if v_review ->> 'directiveStatus'='issued' and nullif(v_review ->> 'directiveReference','') is null then
        raise exception 'SARS directive proof is required for seller %.',v_seller ->> 'id' using errcode='22023'; end if;
      perform journey_private.assert_attorney_withholding_remittance(v_review, false);
    end if;
  end loop;
  if coalesce(v_profile ->> 'hoaApplicable','unknown') not in ('yes','no') or
    coalesce(v_property ->> 'titleRestrictions','unknown') not in ('yes','no') or
    coalesce(v_property ->> 'complianceCertificates','unknown') not in ('yes','no') then
    raise exception 'Classify HOA, title restrictions and compliance certificates before lodgement.' using errcode='22023'; end if;
  if v_property ->> 'titleRestrictions'='yes' and nullif(v_property ->> 'titleConditionsReference','') is null then
    raise exception 'Title-condition evidence is required.' using errcode='22023'; end if;
  if coalesce(v_property #>> '{certificates,electrical}','unknown') not in ('yes','no') then
    raise exception 'Review electrical installation and certificate applicability.' using errcode='22023'; end if;
  if v_property #>> '{certificates,electrical}'='no' and
    not journey_private.attorney_electrical_not_applicable(v_matter) then
    raise exception 'Record and complete the electrical non-applicability review.' using errcode='22023'; end if;
  if v_property #>> '{certificates,electrical}'='yes' and not exists (
    select 1 from public.document_requirement_instances d where d.transaction_id=v_matter
      and d.document_definition_key='electrical_compliance_certificate' and d.status in ('approved','completed')
      and (d.expiry_date is null or d.expiry_date > pg_catalog.now())) then
    raise exception 'Current approved electrical compliance evidence is required.' using errcode='22023'; end if;
  if v_property ->> 'complianceCertificates'='yes' then
    for v_type,v_doc in select * from (values
      ('water','water_installation_certificate'),('gas','gas_compliance_certificate'),
      ('electricFence','electric_fence_certificate'),('beetle','beetle_certificate')) x(type,doc) loop
      if coalesce(v_property #>> array['certificates',v_type],'unknown') not in ('yes','no') then
        raise exception 'Classify the % compliance certificate.',v_type using errcode='22023'; end if;
      if v_property #>> array['certificates',v_type]='yes' and not exists (
        select 1 from public.document_requirement_instances d where d.transaction_id=v_matter
          and d.document_definition_key=v_doc and d.status in ('approved','completed')
          and (d.expiry_date is null or d.expiry_date > pg_catalog.now())) then
        raise exception 'Approved % compliance evidence is required.',v_type using errcode='22023'; end if;
    end loop;
  end if;
  foreach v_step in array v_required loop
    if not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(v_profile #> '{workflowPlan,lanes}','[]'::jsonb)) l
      where l ->> 'laneKey'='transfer' and (l -> 'stepKeys') ? v_step) or
      not exists (select 1 from public.transaction_subprocess_steps s
        where s.subprocess_id=new.subprocess_id and s.step_key=v_step and s.status='completed') then
      raise exception 'Attorney-reviewed completion of % is required before lodgement.',v_step using errcode='22023'; end if;
  end loop;
  for v_type,v_doc in select * from (values
    ('municipal','rates_clearance_certificate'),
    ('bodyCorporate','levy_clearance_certificate'),
    ('hoa','hoa_clearance_certificate')) x(type,doc) loop
    if v_type='bodyCorporate' and v_profile ->> 'propertyTenure'<>'sectional_title' then continue; end if;
    if v_type='hoa' and v_profile ->> 'propertyTenure'<>'estate_hoa' and v_profile ->> 'hoaApplicable'<>'yes' then continue; end if;
    v_clearance := coalesce(v_property #> array['clearances',v_type],'{}'::jsonb);
    if nullif(pg_catalog.btrim(coalesce(v_clearance ->> 'issuer','')),'') is null or
      nullif(v_clearance ->> 'validUntil','') is null or
      (v_clearance ->> 'validUntil')::date <= (pg_catalog.now() at time zone 'Africa/Johannesburg')::date then
      raise exception 'Record a current % clearance issuer and validity.',v_type using errcode='22023'; end if;
    if not exists (select 1 from public.document_requirement_instances d
      where d.transaction_id=v_matter and d.document_definition_key=v_doc
        and d.status in ('approved','completed')
        and (d.expiry_date is null or d.expiry_date > pg_catalog.now())) then
      raise exception 'A current approved % clearance certificate is required.',v_type using errcode='22023'; end if;
  end loop;
  return new;
end;
$$;

revoke all on function journey_private.phase4_required_transfer_steps(jsonb) from public,anon,authenticated;
create or replace function journey_private.enforce_stage_five_current_evidence()
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
    and not (requirement.document_definition_key = 'electrical_compliance_certificate'
      and journey_private.attorney_electrical_not_applicable(v_transaction_id))
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
        or (v_clearance ->> 'validUntil')::date <= (pg_catalog.now() at time zone 'Africa/Johannesburg')::date then
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

create or replace function journey_private.enforce_stage_six_closure()
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
  if not journey_private.attorney_registration_communicated(v_transaction_id, new.id, v_registered.completed_at) then
    raise exception 'Record registration communication evidence for all appropriate buyer and seller audiences before closing the matter.' using errcode='22023';
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

create function journey_private.attorney_task_review(p_matter uuid,p_lane text,p_step text,p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(c.task_confirmations -> p_key,'{}'::jsonb)
  from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
  left join public.attorney_task_confirmations c on c.step_id=s.id
  where l.transaction_id=p_matter and l.process_type=p_lane and s.step_key=p_step limit 1;
$$;

create function journey_private.assert_conveyancing_review(p_matter uuid,p_lane text,p_step text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_profile jsonb; v_response jsonb; v_item jsonb; v_party jsonb; v_review jsonb;
  v_field text; v_signature jsonb; v_signature_status text; v_keys text[] := array[]::text[];
  v_key text; v_due date; v_amount numeric; v_allocated numeric; v_settlement jsonb;
  v_today date := (pg_catalog.now() at time zone 'Africa/Johannesburg')::date;
begin
  select routing_profile_json into v_profile from public.transactions where id=p_matter;
  if p_step in ('post_registration_closeout_review','matter_closed') then
    for v_party in select value from pg_catalog.jsonb_array_elements(coalesce(v_profile #> '{scenarioProfile,parties}','[]'::jsonb)) loop
      if v_party ->> 'role'='seller' and v_party ->> 'taxResidence' is distinct from 'south_africa' then
        perform journey_private.assert_attorney_seller_withholding_review(v_profile #> array['transferTaxDecision','nonResidentSellers',v_party ->> 'id'],true);
      end if;
    end loop;
    return;
  end if;
  if p_step not in ('lodgement_ready','lodged_at_deeds_office','registered','bond_lodgement_ready','bond_lodged','bond_registered',
    'cancellation_lodgement_ready','cancellation_lodged','cancellation_registered','cancellation_close_out_complete','bond_close_out_complete') then return; end if;
  if p_step in ('cancellation_close_out_complete','bond_close_out_complete') then
    if not exists (select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
      where l.transaction_id=p_matter and l.process_type=p_lane and s.step_key=p_lane || '_registered' and s.status='completed') then
      raise exception 'Confirm the responsible attorney lane registration before close-out.' using errcode='22023'; end if;
    if p_lane='cancellation' and not exists (select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
      where l.transaction_id=p_matter and l.process_type=p_lane and s.step_key='settlement_proof_captured' and s.status='completed') then
      raise exception 'Complete the cancellation settlement review before close-out.' using errcode='22023'; end if;
  end if;

  if p_lane='transfer' then
    if not exists (select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
      where l.transaction_id=p_matter and l.process_type='transfer' and s.step_key='otp_source_docs_checked' and s.status='completed') then
      raise exception 'Complete the current agreement review before the milestone.' using errcode='22023'; end if;
    v_response := journey_private.attorney_task_review(p_matter,'transfer','otp_source_docs_checked','agreement_conditions_review');
    if not (coalesce(v_response ->> 'answer','')='not_applicable' and
      nullif(pg_catalog.btrim(coalesce(v_response ->> 'note','')),'') is not null and
      pg_catalog.jsonb_array_length(coalesce(v_response -> 'items','[]'::jsonb))=0) then
      if coalesce(v_response ->> 'answer','')<>'yes' or pg_catalog.jsonb_array_length(coalesce(v_response -> 'items','[]'::jsonb))=0 then
        raise exception 'Review current agreement conditions or record why none apply.' using errcode='22023'; end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_response -> 'items') loop
        foreach v_field in array array['description','owner','evidenceReference','basisNote'] loop
          if nullif(pg_catalog.btrim(coalesce(v_item ->> v_field,'')),'') is null then
            raise exception 'Agreement conditions need an owner, deadline, current evidence and attorney decision.' using errcode='22023'; end if;
        end loop;
        v_due := journey_private.attorney_review_date(v_item ->> 'deadline');
        if (nullif(pg_catalog.btrim(coalesce(v_item ->> 'deadline','')),'') is not null and v_due is null) or coalesce(v_item ->> 'kind','') not in ('suspensive','payment','other') or
          not (coalesce(v_item ->> 'status','') in ('fulfilled','waived','not_applicable') or
            (v_item ->> 'kind'='payment' and v_item ->> 'status'='secured' and v_due is not null and v_due > v_today)) then
          raise exception 'Resolve agreement conditions against the current agreement; an extension alone is insufficient.' using errcode='22023'; end if;
      end loop;
    end if;
    for v_party in select value from pg_catalog.jsonb_array_elements(coalesce(v_profile #> '{scenarioProfile,parties}','[]'::jsonb)) loop
      if v_party ->> 'role' not in ('buyer','seller') then continue; end if;
      if not exists (select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
        where l.transaction_id=p_matter and l.process_type='transfer' and s.step_key=(v_party ->> 'role') || '_fica_review' and s.status='completed') then
        raise exception 'Complete the current party FICA review before the milestone.' using errcode='22023'; end if;
      v_review := journey_private.attorney_task_review(p_matter,'transfer',(v_party ->> 'role') || '_fica_review','rmcp_review:' || (v_party ->> 'id'));
      if coalesce(v_review ->> 'answer','')<>'yes' or nullif(pg_catalog.btrim(coalesce(v_review ->> 'note','')),'') is null then
        raise exception 'Record the firm RMCP review and internal evidence reference for party %.',v_party ->> 'id' using errcode='22023'; end if;
      if v_party ->> 'role'='seller' and v_party ->> 'taxResidence' is distinct from 'south_africa' then
        perform journey_private.assert_attorney_seller_withholding_review(v_profile #> array['transferTaxDecision','nonResidentSellers',v_party ->> 'id'],false);
      end if;
    end loop;
  end if;

  if p_lane='cancellation' or (p_lane='transfer' and exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_profile #> '{workflowPlan,lanes}','[]'::jsonb)) l where l ->> 'laneKey'='cancellation')) then
    v_response := journey_private.attorney_task_review(p_matter,'cancellation','cancellation_guarantee_allocation_review','registered_securities_review');
    if coalesce(v_response ->> 'answer','')<>'yes' or pg_catalog.jsonb_array_length(coalesce(v_response -> 'items','[]'::jsonb))=0 then
      raise exception 'Record every registered security and linked settlement account.' using errcode='22023'; end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(v_response -> 'items') loop
      foreach v_field in array array['bondReference','property','lender','account','owner','instrumentReference','figuresReference','consentReference','allocationReference'] loop
        if nullif(pg_catalog.btrim(coalesce(v_item ->> v_field,'')),'') is null then
          raise exception 'Every security account needs instrument, current figures, consent and allocation evidence.' using errcode='22023'; end if;
      end loop;
      v_key := pg_catalog.btrim(v_item ->> 'bondReference') || ':' || pg_catalog.btrim(v_item ->> 'account');
      if v_key=any(v_keys) then raise exception 'Duplicate registered bond and account in the security review.' using errcode='22023'; end if;
      v_keys := pg_catalog.array_append(v_keys,v_key);
      if coalesce(v_item ->> 'disposition','') not in ('cancellation','release','substitution') then
        raise exception 'Resolve the specialist security instrument before the milestone.' using errcode='22023'; end if;
      if p_step='cancellation_close_out_complete' then
        v_settlement := journey_private.attorney_task_review(p_matter,'cancellation','settlement_proof_captured','security_settlement_review');
        if coalesce(v_settlement ->> 'answer','')<>'yes' or not exists (
          select 1 from pg_catalog.jsonb_array_elements(coalesce(v_settlement -> 'items','[]'::jsonb)) item
          where pg_catalog.btrim(item ->> 'bondReference')=pg_catalog.btrim(v_item ->> 'bondReference')
            and pg_catalog.btrim(item ->> 'account')=pg_catalog.btrim(v_item ->> 'account')
            and nullif(pg_catalog.btrim(coalesce(item ->> 'registrationReference','')),'') is not null
            and nullif(pg_catalog.btrim(coalesce(item ->> 'settlementReference','')),'') is not null) then
          raise exception 'Record registration and settlement evidence for each security account before close-out.' using errcode='22023'; end if;
      else
        v_due := journey_private.attorney_review_date(v_item ->> 'validUntil');
        if v_due is null or v_due <= v_today then raise exception 'Refresh expired security settlement figures before the milestone.' using errcode='22023'; end if;
        if coalesce(v_item ->> 'settlementAmount','') !~ '^\d+(\.\d{1,2})?$' or coalesce(v_item ->> 'allocatedAmount','') !~ '^\d+(\.\d{1,2})?$' then
          raise exception 'Record non-negative settlement and allocation amounts.' using errcode='22023'; end if;
        v_amount := (v_item ->> 'settlementAmount')::numeric; v_allocated := (v_item ->> 'allocatedAmount')::numeric;
        if v_allocated < v_amount then raise exception 'Resolve the security settlement shortfall before the milestone.' using errcode='22023'; end if;
      end if;
    end loop;
    if p_step<>'cancellation_close_out_complete' then
      v_signature := journey_private.attorney_task_review(p_matter,'cancellation','seller_cancellation_documents_signed','seller_signature_applicability');
      select s.status into v_signature_status from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
        where l.transaction_id=p_matter and l.process_type='cancellation' and s.step_key='seller_cancellation_documents_signed';
      if coalesce(v_signature ->> 'answer','') not in ('yes','no') or nullif(pg_catalog.btrim(coalesce(v_signature ->> 'note','')),'') is null or
        (v_signature ->> 'answer'='yes' and v_signature_status is distinct from 'completed') or
        (v_signature ->> 'answer'='no' and coalesce(v_signature_status,'') not in ('completed','not_applicable')) then
        raise exception 'Review seller signature applicability; complete required signing or record the reviewed not-applicable outcome.' using errcode='22023'; end if;
      if not exists (select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
        where l.transaction_id=p_matter and l.process_type='cancellation' and s.step_key='cancellation_consent_confirmed' and s.status='completed') then
        raise exception 'Bondholder consent remains required regardless of seller-signature applicability.' using errcode='22023'; end if;
    end if;
  end if;
end; $$;

create function journey_private.enforce_conveyancing_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_matter uuid; v_lane text;
begin
  if new.step_key in ('buyer_fica_review','seller_fica_review') and new.visibility_scope is distinct from 'internal' then
    raise exception 'FICA and RMCP review notes must remain internal to the attorney firm.' using errcode='42501'; end if;
  if new.status<>'completed' then return new; end if;
  select transaction_id,process_type into v_matter,v_lane from public.transaction_subprocesses where id=new.subprocess_id;
  perform journey_private.assert_conveyancing_review(v_matter,v_lane,new.step_key);
  return new;
end; $$;
create trigger trg_enforce_conveyancing_review before insert or update of status,comment,visibility_scope on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_conveyancing_review();

-- Existing commands save confirmations and history atomically. A changed
-- reviewed record withdraws unlodged readiness; historical answers remain.
create function journey_private.withdraw_conveyancing_review_readiness()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_matter uuid; v_lane text; v_step text;
begin
  if tg_op='UPDATE' and new.task_confirmations is not distinct from old.task_confirmations then return new; end if;
  select l.transaction_id,l.process_type,s.step_key into v_matter,v_lane,v_step
    from public.transaction_subprocess_steps s join public.transaction_subprocesses l on l.id=s.subprocess_id where s.id=new.step_id;
  if v_step in ('otp_source_docs_checked','buyer_fica_review','seller_fica_review','seller_cancellation_documents_signed','cancellation_guarantee_allocation_review') then
    perform journey_private.withdraw_unlodged_attorney_readiness(v_matter,'conveyancing_review_changed',v_lane);
    if v_lane='cancellation' then perform journey_private.withdraw_unlodged_attorney_readiness(v_matter,'security_review_changed','transfer'); end if;
  end if;
  return new;
end; $$;
create trigger trg_withdraw_conveyancing_review_readiness after insert or update on public.attorney_task_confirmations
for each row execute function journey_private.withdraw_conveyancing_review_readiness();

create function journey_private.authorize_electrical_applicability_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.routing_profile_json #> '{mvpProfile,propertyConditions,certificates,electrical}' is distinct from new.routing_profile_json #> '{mvpProfile,propertyConditions,certificates,electrical}'
    or old.routing_profile_json #> '{mvpProfile,propertyConditions,electricalBasisNote}' is distinct from new.routing_profile_json #> '{mvpProfile,propertyConditions,electricalBasisNote}')
    and (auth.uid() is null or not coalesce(public.bridge_can_mutate_attorney_lane(new.id,'transfer_attorney','workflow'),false)) then
    raise exception 'Only the assigned transfer attorney may change the electrical applicability review.' using errcode='42501'; end if;
  return new;
end; $$;
create trigger trg_authorize_electrical_applicability_review before update of routing_profile_json on public.transactions
for each row execute function journey_private.authorize_electrical_applicability_review();

-- Unknown remains applicable. Only an explicit attorney-reviewed decision can
-- suppress this canonical requirement; the milestone also checks its task.
update public.document_requirement_rules set condition_json='{"all":[{"fact":"context.type","operator":"eq","value":"transaction"},{"fact":"compliance.electrical_not_applicable","operator":"neq","value":true}]}'::jsonb
where document_definition_key='electrical_compliance_certificate' and context_type='transaction';

update journey_private.task_catalog set phase_key='instruction',phase_label='Instruction & File Opening',phase_order=0,
  task_order=case step_key when 'title_deed_checked' then 3 else 4 end
where lane_key='transfer' and step_key in ('title_deed_checked','existing_bond_confirmed');
update journey_private.task_catalog set definition=pg_catalog.jsonb_set(pg_catalog.jsonb_set(definition,
  '{defaultVisibility}','"internal"'::jsonb),'{clientVisibleAllowed}','false'::jsonb)
where lane_key='transfer' and step_key in ('buyer_fica_review','seller_fica_review');
-- Reorder active saved plans without removing tasks or historical step rows.
update public.transactions t set routing_profile_json=pg_catalog.jsonb_set(t.routing_profile_json,'{workflowPlan,lanes}',(
  select pg_catalog.jsonb_agg(case when lane ->> 'laneKey'='transfer' then pg_catalog.jsonb_set(lane,'{stepKeys}',(
    select pg_catalog.jsonb_agg(task.key order by case task.key when 'instruction_received' then 0 when 'matter_opened' then 1 when 'otp_source_docs_checked' then 2 when 'title_deed_checked' then 3 when 'existing_bond_confirmed' then 4 else 5+task.position end)
    from pg_catalog.jsonb_array_elements_text(lane -> 'stepKeys') with ordinality task(key,position)
)) else lane end order by lanes.position)
  from pg_catalog.jsonb_array_elements(t.routing_profile_json #> '{workflowPlan,lanes}') with ordinality lanes(lane,position)))
where t.routing_profile_json #>> '{workflowPlan,status}'='active';

revoke all on function journey_private.attorney_review_date(text),journey_private.attorney_electrical_not_applicable(uuid),
  journey_private.assert_attorney_withholding_remittance(jsonb,boolean),journey_private.attorney_registration_communicated(uuid,uuid,timestamptz),
  journey_private.attorney_task_review(uuid,text,text,text),journey_private.assert_conveyancing_review(uuid,text,text),
  journey_private.enforce_conveyancing_review(),journey_private.withdraw_conveyancing_review_readiness(),
  journey_private.authorize_electrical_applicability_review() from public,anon,authenticated;
create or replace function journey_private.enforce_municipal_clearance_issue_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lane text;
  v_profile jsonb;
  v_issue_text text;
  v_expiry_text text;
  v_issued date;
  v_expiry date;
begin
  if new.step_key not in ('lodgement_ready', 'lodged_at_deeds_office') or new.status <> 'completed' then
    return new;
  end if;

  select lane.process_type, matter.routing_profile_json
    into v_lane, v_profile
    from public.transaction_subprocesses lane
    join public.transactions matter on matter.id = lane.transaction_id
    where lane.id = new.subprocess_id;
  if v_lane is distinct from 'transfer' then return new; end if;

  v_issue_text := v_profile #>> '{mvpProfile,propertyConditions,clearances,municipal,issuedOn}';
  if nullif(pg_catalog.btrim(coalesce(v_issue_text, '')), '') is null then return new; end if;
  v_expiry_text := v_profile #>> '{mvpProfile,propertyConditions,clearances,municipal,validUntil}';
  if v_issue_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(v_expiry_text, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Record valid municipal clearance issue and expiry dates.' using errcode = '22023';
  end if;
  begin
    v_issued := v_issue_text::date;
    v_expiry := v_expiry_text::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Record valid municipal clearance issue and expiry dates.' using errcode = '22023';
  end;
  if v_issued > (pg_catalog.now() at time zone 'Africa/Johannesburg')::date or v_expiry <= (pg_catalog.now() at time zone 'Africa/Johannesburg')::date or v_expiry < v_issued or v_expiry > v_issued + 60 then
    raise exception 'Municipal clearance must be current and expire within 60 days of issue.' using errcode = '22023';
  end if;
  return new;
end;
$$;


-- A changed source agreement reopens its substantive review while preserving
-- the earlier history and any actual lodgement / registration event.
create function journey_private.reopen_agreement_review_on_source_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.transaction_id is null or new.document_definition_key not in
    ('signed_otp','sales_agreement_or_otp','sale_agreement','signed_sale_agreement') or
    new.satisfied_by_document_id is not distinct from old.satisfied_by_document_id then return new; end if;
  if exists (select 1 from public.transaction_subprocess_steps s join public.transaction_subprocesses l on l.id=s.subprocess_id
    where l.transaction_id=new.transaction_id and l.process_type='transfer' and s.step_key='matter_closed' and s.status='completed') then
    raise exception 'Reopen matter closure before replacing the source agreement.' using errcode='22023'; end if;
  update public.transaction_subprocess_steps s set status='not_started',completed_at=null,completed_by=null,
    comment='Source agreement changed; review the current agreement and conditions.',updated_at=pg_catalog.now()
    from public.transaction_subprocesses l where s.subprocess_id=l.id and l.transaction_id=new.transaction_id
      and l.process_type='transfer' and s.step_key='otp_source_docs_checked'
      and s.status in ('completed','completed_externally','not_applicable');
  perform journey_private.withdraw_unlodged_attorney_readiness(new.transaction_id,'agreement_source_changed','transfer');
  return new;
end; $$;
revoke all on function journey_private.reopen_agreement_review_on_source_change() from public,anon,authenticated;
create trigger trg_reopen_agreement_review_on_source_change after update of satisfied_by_document_id on public.document_requirement_instances
for each row execute function journey_private.reopen_agreement_review_on_source_change();

create function journey_private.reopen_fica_review_on_party_facts_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text; v_old jsonb; v_new jsonb;
begin
  foreach v_role in array array['buyer','seller'] loop
    select coalesce(pg_catalog.jsonb_agg(p - 'capacityReview' order by p ->> 'id'),'[]'::jsonb) into v_old
      from pg_catalog.jsonb_array_elements(coalesce(old.routing_profile_json #> '{scenarioProfile,parties}','[]'::jsonb)) p where p ->> 'role'=v_role;
    select coalesce(pg_catalog.jsonb_agg(p - 'capacityReview' order by p ->> 'id'),'[]'::jsonb) into v_new
      from pg_catalog.jsonb_array_elements(coalesce(new.routing_profile_json #> '{scenarioProfile,parties}','[]'::jsonb)) p where p ->> 'role'=v_role;
    if v_old is not distinct from v_new then continue; end if;
    if exists (select 1 from public.transaction_subprocess_steps s join public.transaction_subprocesses l on l.id=s.subprocess_id
      where l.transaction_id=new.id and l.process_type='transfer' and s.step_key='matter_closed' and s.status='completed') then
      raise exception 'Reopen matter closure before changing material party facts.' using errcode='22023'; end if;
    update public.transaction_subprocess_steps s set status='not_started',completed_at=null,completed_by=null,
      visibility_scope='internal',comment='Party facts changed; review current FICA and RMCP evidence.',updated_at=pg_catalog.now()
      from public.transaction_subprocesses l where s.subprocess_id=l.id and l.transaction_id=new.id and l.process_type='transfer'
        and s.step_key=v_role || '_fica_review' and s.status in ('completed','completed_externally','not_applicable');
    update public.attorney_task_confirmations c set task_confirmations=coalesce((
      select pg_catalog.jsonb_object_agg(entry.key,entry.value) from pg_catalog.jsonb_each(c.task_confirmations) entry where entry.key not like 'rmcp_review:%'),'{}'::jsonb)
      from public.transaction_subprocess_steps s join public.transaction_subprocesses l on l.id=s.subprocess_id
      where c.step_id=s.id and l.transaction_id=new.id and l.process_type='transfer' and s.step_key=v_role || '_fica_review';
    perform journey_private.withdraw_unlodged_attorney_readiness(new.id,'party_fica_facts_changed','transfer');
  end loop;
  return new;
end; $$;
revoke all on function journey_private.reopen_fica_review_on_party_facts_change() from public,anon,authenticated;
create trigger trg_reopen_fica_review_on_party_facts_change after update of routing_profile_json on public.transactions
for each row execute function journey_private.reopen_fica_review_on_party_facts_change();

commit;
