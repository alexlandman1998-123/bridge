begin;

insert into journey_private.task_catalog (lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order)
select 'transfer', entry.step_key,
  pg_catalog.jsonb_build_object('processKey','transfer','processLabel','Property transfer',
    'stepKey',entry.step_key,'ownerRole','transfer_attorney','defaultVisibility','professional_shared',
    'clientVisibleAllowed',false,'professional',pg_catalog.jsonb_build_object(
      'title',entry.title,'description',entry.description)),
  'financial_preparation','Financial Preparation',2,entry.task_order
from (values
  ('ordinary_vat_basis_verified','Verify Ordinary VAT Basis','Review VAT vendor, enterprise and agreement evidence.',5),
  ('going_concern_zero_rate_verified','Verify Going-Concern Zero Rate','Review the written going-concern agreement and zero-rate conditions.',6),
  ('transfer_duty_exemption_basis_verified','Verify Claimed Exemption','Review the specific statutory exemption and its supporting proof.',7),
  ('non_resident_seller_applicability_review','Review Each Non-Resident Seller','Decide withholding applicability separately for each seller.',8),
  ('non_resident_seller_directive_review','Verify SARS Directive','Review each applicable directive and its proof.',9),
  ('non_resident_seller_withholding_payment_review','Verify Non-Resident Withholding','Review withholding, payment and proof by seller.',10),
  ('body_corporate_levy_clearance_review','Review Body-Corporate Clearance','Review the issuer, certificate and validity.',13),
  ('hoa_clearance_review','Review HOA Clearance','Review the issuer, certificate and validity.',14),
  ('property_conditions_applicability_review','Classify Property Conditions','Decide title and certificate applicability.',15),
  ('title_conditions_review','Review Title Conditions','Review applicable title restrictions and conditions.',16)
) entry(step_key,title,description,task_order)
on conflict (lane_key,step_key) do update set
  definition=excluded.definition,phase_key=excluded.phase_key,phase_label=excluded.phase_label,
  phase_order=excluded.phase_order,task_order=excluded.task_order;

create function journey_private.phase4_required_transfer_steps(p_profile jsonb)
returns text[] language plpgsql stable set search_path = '' as $$
declare
  v_tax jsonb := coalesce(p_profile -> 'transferTaxDecision','{}'::jsonb);
  v_scenario jsonb := coalesce(p_profile #> '{scenarioProfile,parties}','[]'::jsonb);
  v_property jsonb := coalesce(p_profile #> '{mvpProfile,propertyConditions}','{}'::jsonb);
  v_steps text[] := array['transfer_tax_route_confirmed'];
  v_seller jsonb;
  v_potential boolean := false;
  v_directive boolean := false;
  v_withholding boolean := false;
begin
  if v_tax ->> 'route' = 'transfer_duty' then
    v_steps := v_steps || array['transfer_duty_tdc01_submission'];
  end if;
  if v_tax ->> 'sarsEvidenceRequest' = 'yes' or v_tax ->> 'sarsStatus' = 'query' then
    v_steps := v_steps || array['sars_evidence_request_response'];
  end if;
  case v_tax ->> 'route'
    when 'transfer_duty' then
      if v_tax ->> 'dutyPaymentRequired' = 'yes' then
        v_steps := v_steps || array['transfer_duty_assessment_payment'];
      end if;
    when 'vat' then v_steps := v_steps || array['ordinary_vat_basis_verified'];
    when 'zero_rated_going_concern' then v_steps := v_steps || array['going_concern_zero_rate_verified'];
    when 'exempt' then v_steps := v_steps || array['transfer_duty_exemption_basis_verified'];
  end case;
  for v_seller in select value from pg_catalog.jsonb_array_elements(v_scenario) loop
    if v_seller ->> 'role' = 'seller' and coalesce(v_seller ->> 'taxResidence','unknown') <> 'south_africa' then
      v_potential := true;
      if v_tax #>> array['nonResidentSellers',v_seller ->> 'id','directiveStatus'] = 'issued' then v_directive := true; end if;
      if v_tax #>> array['nonResidentSellers',v_seller ->> 'id','withholdingRequired'] = 'yes' then v_withholding := true; end if;
    end if;
  end loop;
  if v_potential or v_tax ->> 'sellerNonResidentReview' = 'yes' then
    v_steps := v_steps || array['non_resident_seller_applicability_review'];
    if v_directive then v_steps := v_steps || array['non_resident_seller_directive_review']; end if;
    if v_withholding or v_tax ->> 'sellerNonResidentReview' = 'yes' then
      v_steps := v_steps || array['non_resident_seller_withholding_payment_review'];
    end if;
  end if;
  v_steps := v_steps || array['sars_transfer_tax_receipt_verified','municipal_rates_clearance_review'];
  if p_profile ->> 'propertyTenure' = 'sectional_title' then
    v_steps := v_steps || array['body_corporate_levy_clearance_review'];
  end if;
  if p_profile ->> 'propertyTenure' = 'estate_hoa' or p_profile ->> 'hoaApplicable' = 'yes' then
    v_steps := v_steps || array['hoa_clearance_review'];
  end if;
  v_steps := v_steps || array['property_conditions_applicability_review'];
  if v_property ->> 'titleRestrictions' is distinct from 'no' then
    v_steps := v_steps || array['title_conditions_review'];
  end if;
  if v_property ->> 'complianceCertificates' is distinct from 'no' then
    v_steps := v_steps || array['property_compliance_review'];
  end if;
  return v_steps;
end;
$$;

-- Keep the Phase 3 funding handoff gate active for both plan generations.
do $$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef('journey_private.enforce_attorney_funding_handoffs()'::pg_catalog.regprocedure)
    into v_definition;
  if pg_catalog.strpos(v_definition,
    'v_plan ->> ''version'' is distinct from ''attorney_matter_workflow_plan_v12''') = 0 then
    raise exception 'Phase 3 funding gate definition changed; review the Phase 4 version extension.';
  end if;
  execute pg_catalog.replace(v_definition,
    'v_plan ->> ''version'' is distinct from ''attorney_matter_workflow_plan_v12''',
    'v_plan ->> ''version'' not in (''attorney_matter_workflow_plan_v12'', ''attorney_matter_workflow_plan_v13'')');
end;
$$;

-- Migrate unlodged v12 plans in place. Task rows are retained for audit; only
-- the applicability list is replaced and newly required rows are added.
do $$
declare
  v_matter record;
  v_lane jsonb;
  v_lanes jsonb;
  v_steps jsonb;
  v_key text;
  v_required text[];
  v_inserted boolean;
begin
  for v_matter in select t.id,t.routing_profile_json as profile from public.transactions t
    where t.routing_profile_json #>> '{workflowPlan,version}' = 'attorney_matter_workflow_plan_v12'
      and t.routing_profile_json #>> '{workflowPlan,status}' = 'active'
      and pg_catalog.lower(coalesce(t.lifecycle_state,'')) not in ('registered','completed','archived','cancelled','canceled')
      and not exists (select 1 from public.transaction_subprocesses l
        join public.transaction_subprocess_steps s on s.subprocess_id=l.id
        where l.transaction_id=t.id and l.process_type='transfer'
          and s.step_key='lodged_at_deeds_office' and s.status='completed')
  loop
    v_lanes := '[]'::jsonb;
    v_required := journey_private.phase4_required_transfer_steps(v_matter.profile);
    for v_lane in select value from pg_catalog.jsonb_array_elements(v_matter.profile #> '{workflowPlan,lanes}') loop
      if v_lane ->> 'laneKey' = 'transfer' then
        v_steps := '[]'::jsonb;
        v_inserted := false;
        for v_key in select value from pg_catalog.jsonb_array_elements_text(v_lane -> 'stepKeys') loop
          if v_key = 'transfer_document_pack_review' then
            select v_steps || coalesce(pg_catalog.jsonb_agg(required.key order by required.ordinality),'[]'::jsonb)
              into v_steps from pg_catalog.unnest(v_required) with ordinality required(key,ordinality);
            v_inserted := true;
          end if;
          if v_key <> all(array['transfer_tax_route_confirmed','transfer_duty_tdc01_submission',
            'sars_evidence_request_response','transfer_duty_assessment_payment','vat_exemption_evidence_verified',
            'non_resident_seller_withholding_review','sars_transfer_tax_receipt_verified',
            'municipal_rates_clearance_review','levy_hoa_clearance_review','property_compliance_review']) then
            v_steps := v_steps || pg_catalog.to_jsonb(v_key);
          end if;
        end loop;
        if not v_inserted then
          select v_steps || coalesce(pg_catalog.jsonb_agg(required.key order by required.ordinality),'[]'::jsonb)
            into v_steps from pg_catalog.unnest(v_required) with ordinality required(key,ordinality);
        end if;
        v_lane := pg_catalog.jsonb_set(v_lane,'{stepKeys}',v_steps);
        v_lane := pg_catalog.jsonb_set(v_lane,'{taskCount}',pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(v_steps)));
      end if;
      v_lanes := v_lanes || pg_catalog.jsonb_build_array(v_lane);
    end loop;
    update public.transactions t set routing_profile_json = pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(v_matter.profile,'{workflowPlan,lanes}',v_lanes),
          '{workflowPlan,configuration,propertyConditions}',
          coalesce(v_matter.profile #> '{mvpProfile,propertyConditions}','{}'::jsonb),true),
        '{workflowPlan,configuration,transferTaxDecision}',
        coalesce(v_matter.profile -> 'transferTaxDecision','{}'::jsonb),true),
      '{workflowPlan,version}','"attorney_matter_workflow_plan_v13"'::jsonb)
    where t.id=v_matter.id;
  end loop;
end;
$$;

insert into public.transaction_subprocess_steps
  (subprocess_id,step_key,step_label,status,owner_type,sort_order,visibility_scope)
select lane.id,task.value,coalesce(catalog.definition #>> '{professional,title}',task.value),
  'not_started','attorney',task.ordinality,'professional_shared'
from public.transactions t
join public.transaction_subprocesses lane on lane.transaction_id=t.id and lane.process_type='transfer'
cross join lateral pg_catalog.jsonb_array_elements(t.routing_profile_json #> '{workflowPlan,lanes}') plan_lane
cross join lateral pg_catalog.jsonb_array_elements_text(plan_lane -> 'stepKeys') with ordinality task(value,ordinality)
left join journey_private.task_catalog catalog on catalog.lane_key='transfer' and catalog.step_key=task.value
where t.routing_profile_json #>> '{workflowPlan,version}'='attorney_matter_workflow_plan_v13'
  and plan_lane ->> 'laneKey'='transfer'
  and task.value = any(array['ordinary_vat_basis_verified','going_concern_zero_rate_verified',
    'transfer_duty_exemption_basis_verified','non_resident_seller_applicability_review',
    'non_resident_seller_directive_review','non_resident_seller_withholding_payment_review',
    'body_corporate_levy_clearance_review','hoa_clearance_review',
    'property_conditions_applicability_review','title_conditions_review'])
  and not exists (select 1 from public.transaction_subprocess_steps lodged
    where lodged.subprocess_id=lane.id and lodged.step_key='lodged_at_deeds_office' and lodged.status='completed')
on conflict (subprocess_id,step_key) do nothing;

create function journey_private.enforce_attorney_phase4_tax_clearances()
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
  if v_profile #>> '{workflowPlan,version}' <> 'attorney_matter_workflow_plan_v13' then return new; end if;
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
      if v_review ->> 'withholdingRequired'='yes' and nullif(v_review ->> 'paymentReference','') is null then
        raise exception 'Withholding payment proof is required for seller %.',v_seller ->> 'id' using errcode='22023'; end if;
    end if;
  end loop;
  if coalesce(v_profile ->> 'hoaApplicable','unknown') not in ('yes','no') or
    coalesce(v_property ->> 'titleRestrictions','unknown') not in ('yes','no') or
    coalesce(v_property ->> 'complianceCertificates','unknown') not in ('yes','no') then
    raise exception 'Classify HOA, title restrictions and compliance certificates before lodgement.' using errcode='22023'; end if;
  if v_property ->> 'titleRestrictions'='yes' and nullif(v_property ->> 'titleConditionsReference','') is null then
    raise exception 'Title-condition evidence is required.' using errcode='22023'; end if;
  if v_property ->> 'complianceCertificates'='yes' then
    for v_type,v_doc in select * from (values
      ('gas','gas_compliance_certificate'),
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
      (v_clearance ->> 'validUntil')::date <= current_date then
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
revoke all on function journey_private.enforce_attorney_phase4_tax_clearances() from public,anon,authenticated;
create trigger trg_enforce_attorney_phase4_tax_clearances
before insert or update of status,comment on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_attorney_phase4_tax_clearances();

-- Any clearance review or expiry correction withdraws an unlodged attestation.
create function journey_private.withdraw_phase4_clearance_readiness()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row public.document_requirement_instances%rowtype;
begin
  if tg_op='DELETE' then v_row:=old; else v_row:=new; end if;
  if v_row.transaction_id is not null and v_row.document_definition_key in
    ('rates_clearance_certificate','levy_clearance_certificate','hoa_clearance_certificate',
      'electrical_compliance_certificate','gas_compliance_certificate',
      'electric_fence_certificate','beetle_certificate') then
    if tg_op<>'UPDATE' or old.status is distinct from new.status or old.expiry_date is distinct from new.expiry_date then
      perform journey_private.withdraw_unlodged_attorney_readiness(v_row.transaction_id,'phase4_clearance_changed','transfer');
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function journey_private.withdraw_phase4_clearance_readiness() from public,anon,authenticated;
create trigger trg_withdraw_phase4_clearance_readiness
after insert or update or delete on public.document_requirement_instances
for each row execute function journey_private.withdraw_phase4_clearance_readiness();

create function journey_private.reopen_phase4_reviews_on_basis_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_steps text[] := array[]::text[];
begin
  if old.routing_profile_json #>> '{transferTaxDecision,route}' is distinct from
       new.routing_profile_json #>> '{transferTaxDecision,route}' or
     old.routing_profile_json #>> '{transferTaxDecision,exemptionType}' is distinct from
       new.routing_profile_json #>> '{transferTaxDecision,exemptionType}' or
     old.routing_profile_json #> '{transferTaxDecision,exemptionClaims}' is distinct from
       new.routing_profile_json #> '{transferTaxDecision,exemptionClaims}' then
    v_steps := v_steps || array['transfer_tax_route_confirmed','ordinary_vat_basis_verified',
      'going_concern_zero_rate_verified','transfer_duty_exemption_basis_verified',
      'transfer_duty_tdc01_submission','transfer_duty_assessment_payment',
      'sars_evidence_request_response','sars_transfer_tax_receipt_verified'];
  elsif old.routing_profile_json #>> '{transferTaxDecision,sarsProofReference}' is distinct from
        new.routing_profile_json #>> '{transferTaxDecision,sarsProofReference}' then
    v_steps := v_steps || array['sars_transfer_tax_receipt_verified'];
  end if;
  if old.routing_profile_json #> '{transferTaxDecision,nonResidentSellers}' is distinct from
       new.routing_profile_json #> '{transferTaxDecision,nonResidentSellers}' or
     old.routing_profile_json #> '{scenarioProfile,parties}' is distinct from
       new.routing_profile_json #> '{scenarioProfile,parties}' then
    v_steps := v_steps || array['non_resident_seller_applicability_review',
      'non_resident_seller_directive_review','non_resident_seller_withholding_payment_review'];
  end if;
  if old.routing_profile_json #> '{mvpProfile,propertyConditions}' is distinct from
       new.routing_profile_json #> '{mvpProfile,propertyConditions}' or
     old.routing_profile_json ->> 'propertyTenure' is distinct from
       new.routing_profile_json ->> 'propertyTenure' or
     old.routing_profile_json ->> 'hoaApplicable' is distinct from
       new.routing_profile_json ->> 'hoaApplicable' then
    v_steps := v_steps || array['municipal_rates_clearance_review',
      'body_corporate_levy_clearance_review','hoa_clearance_review',
      'property_conditions_applicability_review','title_conditions_review','property_compliance_review'];
  end if;
  if pg_catalog.array_length(v_steps,1) is null then return new; end if;
  update public.transaction_subprocess_steps s
    set status='not_started',comment=null,completed_at=null,completed_by=null,
      updated_at=pg_catalog.now()
    from public.transaction_subprocesses lane
    where s.subprocess_id=lane.id and lane.transaction_id=new.id and lane.process_type='transfer'
      and s.step_key=any(v_steps) and s.status in ('completed','completed_externally','not_applicable')
      and not exists (select 1 from public.transaction_subprocess_steps lodged
        where lodged.subprocess_id=lane.id and lodged.step_key='lodged_at_deeds_office'
          and lodged.status='completed');
  return new;
end;
$$;
revoke all on function journey_private.reopen_phase4_reviews_on_basis_change() from public,anon,authenticated;
create trigger trg_reopen_phase4_reviews_on_basis_change
after update of routing_profile_json on public.transactions
for each row execute function journey_private.reopen_phase4_reviews_on_basis_change();

commit;
