begin;

-- A completed lodgement pack is evidence for readiness, not a separate matter
-- milestone. Keep four material outcomes: ready, lodged, on prep, registered.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
)
values
  ('transfer','lodgement_ready',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','lodgement_ready','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Lodgement readiness reviewed','description','The transfer attorneys are reviewing lodgement readiness and coordination.'),'client',jsonb_build_object('title','Preparing for lodgement','description','The transfer attorneys are preparing the matter for Deeds Office lodgement.')),'lodgement_registration','Lodgement & Registration',4,0),
  ('transfer','lodged_at_deeds_office',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','lodged_at_deeds_office','ownerRole','transfer_attorney','defaultVisibility','client_visible','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Deeds Office lodgement confirmed','description','The transfer has been accepted for lodgement at the Deeds Office.'),'client',jsonb_build_object('title','Transfer lodged','description','Your transfer has been lodged at the Deeds Office.')),'lodgement_registration','Lodgement & Registration',4,1),
  ('transfer','in_prep',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','in_prep','ownerRole','transfer_attorney','defaultVisibility','client_visible','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Deeds Office prep confirmed','description','The matter is in preparation for registration at the Deeds Office.'),'client',jsonb_build_object('title','Preparing for registration','description','Your transfer is in preparation for registration.')),'lodgement_registration','Lodgement & Registration',4,2),
  ('transfer','registered',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','registered','ownerRole','transfer_attorney','defaultVisibility','client_visible','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Transfer registration confirmed','description','The transfer registration has been confirmed.'),'client',jsonb_build_object('title','Transfer registered','description','Your transfer registration has been completed.')),'lodgement_registration','Lodgement & Registration',4,3)
on conflict (lane_key,step_key) do update set definition=excluded.definition,phase_key=excluded.phase_key,phase_label=excluded.phase_label,phase_order=excluded.phase_order,task_order=excluded.task_order;

-- Retain historical rows, but ensure every transfer lane has a durable row for
-- each active outcome. Existing completed/blocked state wins over defaults.
insert into public.transaction_subprocess_steps (subprocess_id,step_key,step_label,status,owner_type,sort_order,visibility_scope)
select lane.id, outcome.step_key, outcome.step_label, coalesce(legacy.status,'not_started'),'attorney',outcome.sort_order,'internal'
from public.transaction_subprocesses lane
cross join (values
  ('lodgement_ready','Lodgement Ready',16,array['lodgement_pack_prepared','lodgement_pack_checked','ready_for_lodgement']::text[]),
  ('lodged_at_deeds_office','Lodged at Deeds Office',17,array['lodged','lodgement_submitted']::text[]),
  ('in_prep','On Prep',18,array['prep']::text[]),
  ('registered','Registered',19,array['registration_confirmed']::text[])
) outcome(step_key,step_label,sort_order,legacy_keys)
left join lateral (
  select case when bool_or(step.status in ('completed','completed_externally')) then 'completed'
    when bool_or(step.status='blocked') then 'blocked' when bool_or(step.status='waiting') then 'waiting'
    when bool_or(step.status='in_progress') then 'in_progress' when bool_and(step.status='not_applicable') then 'not_applicable'
    else 'not_started' end status
  from public.transaction_subprocess_steps step
  where step.subprocess_id=lane.id and step.step_key=any(outcome.legacy_keys)
) legacy on true
where lane.process_type='transfer'
  and not exists (
    select 1 from public.transaction_subprocess_steps existing
    where existing.subprocess_id=lane.id and existing.step_key=outcome.step_key
  );

-- Some matters already have the outcome row as well as a completed legacy
-- sub-step. Reconcile that historical state instead of silently resetting the
-- new, consolidated milestone to not started.
with reconciled_state as (
  select target.id,
    case when bool_or(source.status in ('completed','completed_externally')) then 'completed'
      when bool_or(source.status='blocked') then 'blocked'
      when bool_or(source.status='waiting') then 'waiting'
      when bool_or(source.status='in_progress') then 'in_progress'
      when bool_and(source.status='not_applicable') then 'not_applicable'
      else 'not_started' end as status
  from public.transaction_subprocess_steps target
  join public.transaction_subprocesses lane on lane.id=target.subprocess_id and lane.process_type='transfer'
  join (values
    ('lodgement_ready',array['lodgement_ready','lodgement_pack_prepared','lodgement_pack_checked','ready_for_lodgement']::text[]),
    ('lodged_at_deeds_office',array['lodged_at_deeds_office','lodged','lodgement_submitted']::text[]),
    ('in_prep',array['in_prep','prep']::text[]),
    ('registered',array['registered','registration_confirmed']::text[])
  ) outcome(step_key,legacy_keys) on target.step_key=outcome.step_key
  join public.transaction_subprocess_steps source on source.subprocess_id=target.subprocess_id and source.step_key=any(outcome.legacy_keys)
  group by target.id
)
update public.transaction_subprocess_steps target
set status=reconciled_state.status
from reconciled_state
where target.id=reconciled_state.id;

update public.transaction_subprocess_steps step
set step_label=outcome.step_label,sort_order=outcome.sort_order
from public.transaction_subprocesses lane
join (values
  ('lodgement_ready','Lodgement Ready',16),
  ('lodged_at_deeds_office','Lodged at Deeds Office',17),
  ('in_prep','On Prep',18),
  ('registered','Registered',19)
) outcome(step_key,step_label,sort_order) on true
where step.subprocess_id=lane.id and lane.process_type='transfer' and step.step_key=outcome.step_key;

with rebuilt as (
  select transaction_row.id,
    jsonb_set(transaction_row.routing_profile_json,'{workflowPlan}',
      jsonb_set(transaction_row.routing_profile_json->'workflowPlan','{lanes}',(
        select jsonb_agg(case when lane.value->>'laneKey'<>'transfer' then lane.value else jsonb_set(lane.value,'{stepKeys}',
          jsonb_build_array(
            'instruction_received','matter_opened','otp_source_docs_checked','title_deed_checked','existing_bond_confirmed',
            'buyer_fica_review','seller_fica_review',
            'transfer_duty_vat_review','municipal_rates_clearance_review'
          ) || case when lower(coalesce(transaction_row.routing_profile_json->>'propertyTenure',''))='freehold' then '[]'::jsonb else jsonb_build_array('levy_hoa_clearance_review') end ||
          jsonb_build_array('property_compliance_review','transfer_document_pack_review','buyer_signing_review','seller_signing_review') ||
          case when lower(coalesce(transaction_row.routing_profile_json->>'financeType',''))='cash'
                    and lower(coalesce(transaction_row.routing_profile_json->'mvpProfile'->>'paymentSecurity',''))='cleared_trust_funds'
               then '[]'::jsonb else jsonb_build_array('payment_security_review') end ||
          jsonb_build_array('lodgement_ready','lodged_at_deeds_office','in_prep','registered') ||
          coalesce((select jsonb_agg(step.value) from jsonb_array_elements(coalesce(lane.value->'stepKeys','[]'::jsonb)) step(value)
            where step.value#>>'{}' not in (
              'instruction_received','matter_opened','otp_source_docs_checked','title_deed_checked','existing_bond_confirmed',
              'buyer_fica_requested','buyer_fica_received','buyer_fica_approved','seller_fica_requested','seller_fica_received','seller_fica_approved','entity_authority_checked','buyer_fica_review','seller_fica_review',
              'transfer_duty_assessment_prepared','transfer_duty_submitted','transfer_duty_receipt_received','rates_figures_requested','rates_payment_confirmed','rates_clearance_received','levy_clearance_requested','levy_clearance_received','compliance_certificates_received','transfer_duty_vat_review','municipal_rates_clearance_review','levy_hoa_clearance_review','property_compliance_review',
              'transfer_documents_prepared','buyer_signing_scheduled','buyer_signed_transfer_documents','seller_signing_scheduled','seller_signed_transfer_documents','guarantees_requested','guarantees_received','transfer_guarantees_accepted','transfer_document_pack_review','buyer_signing_review','seller_signing_review','payment_security_review',
              'lodgement_pack_prepared','lodgement_pack_checked','ready_for_lodgement','lodgement_ready','lodged','lodgement_submitted','lodged_at_deeds_office','prep','in_prep','registration_confirmed','registered'
            )), '[]'::jsonb)
        )) end) from jsonb_array_elements(transaction_row.routing_profile_json->'workflowPlan'->'lanes') lane(value)
      ),true) || jsonb_build_object('version','attorney_matter_workflow_plan_v6'),true) routing_profile_json
  from public.transactions transaction_row
  where transaction_row.routing_profile_json->'workflowPlan'->>'status'='active'
    and jsonb_typeof(transaction_row.routing_profile_json->'workflowPlan'->'lanes')='array'
)
update public.transactions transaction_row
set routing_profile_json=rebuilt.routing_profile_json,updated_at=now()
from rebuilt where transaction_row.id=rebuilt.id;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('journey_private.audit_matter(uuid)'::regprocedure) into v_definition;
  if position('''attorney_matter_workflow_plan_v6''' in v_definition)=0 then
    v_definition:=replace(v_definition,
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4'',''attorney_matter_workflow_plan_v5''',
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4'',''attorney_matter_workflow_plan_v5'',''attorney_matter_workflow_plan_v6''');
    execute v_definition;
  end if;
end;
$$;

commit;
