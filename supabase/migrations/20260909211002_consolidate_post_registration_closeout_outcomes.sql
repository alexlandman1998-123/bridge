begin;

-- Final accounts and the registration notice are parts of one close-out
-- decision. Registration itself remains the preceding Stage 5 outcome.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
)
values
  ('transfer','post_registration_closeout_review',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','post_registration_closeout_review','ownerRole','transfer_attorney','defaultVisibility','client_visible','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Post-registration close-out reviewed','description','Final accounts and stakeholder registration communication are being completed.'),'client',jsonb_build_object('title','Finalising your transfer','description','The transfer attorneys are completing final accounts and registration close-out.')),'post_registration','Post-Registration & Closure',5,0),
  ('transfer','matter_closed',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','matter_closed','ownerRole','transfer_attorney','defaultVisibility','client_visible','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Matter closed','description','The transfer matter has been administratively closed.'),'client',jsonb_build_object('title','Transfer matter closed','description','The transfer matter has been closed.')),'post_registration','Post-Registration & Closure',5,1)
on conflict (lane_key,step_key) do update set definition=excluded.definition,phase_key=excluded.phase_key,phase_label=excluded.phase_label,phase_order=excluded.phase_order,task_order=excluded.task_order;

insert into public.transaction_subprocess_steps (subprocess_id,step_key,step_label,status,owner_type,sort_order,visibility_scope)
select lane.id, outcome.step_key, outcome.step_label, coalesce(legacy.status,'not_started'),'attorney',outcome.sort_order,'internal'
from public.transaction_subprocesses lane
cross join (values
  ('post_registration_closeout_review','Complete Post-Registration Close-Out',20,array['final_accounts_prepared','registration_letter_issued']::text[]),
  ('matter_closed','Matter Closed',21,array['transfer_complete','file_closed']::text[])
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
    ('post_registration_closeout_review',array['post_registration_closeout_review','final_accounts_prepared','registration_letter_issued']::text[]),
    ('matter_closed',array['matter_closed','transfer_complete','file_closed']::text[])
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
  ('post_registration_closeout_review','Complete Post-Registration Close-Out',20),
  ('matter_closed','Matter Closed',21)
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
          jsonb_build_array('lodgement_ready','lodged_at_deeds_office','in_prep','registered','post_registration_closeout_review','matter_closed') ||
          coalesce((select jsonb_agg(step.value) from jsonb_array_elements(coalesce(lane.value->'stepKeys','[]'::jsonb)) step(value)
            where step.value#>>'{}' not in (
              'instruction_received','matter_opened','otp_source_docs_checked','title_deed_checked','existing_bond_confirmed',
              'buyer_fica_requested','buyer_fica_received','buyer_fica_approved','seller_fica_requested','seller_fica_received','seller_fica_approved','entity_authority_checked','buyer_fica_review','seller_fica_review',
              'transfer_duty_assessment_prepared','transfer_duty_submitted','transfer_duty_receipt_received','rates_figures_requested','rates_payment_confirmed','rates_clearance_received','levy_clearance_requested','levy_clearance_received','compliance_certificates_received','transfer_duty_vat_review','municipal_rates_clearance_review','levy_hoa_clearance_review','property_compliance_review',
              'transfer_documents_prepared','buyer_signing_scheduled','buyer_signed_transfer_documents','seller_signing_scheduled','seller_signed_transfer_documents','guarantees_requested','guarantees_received','transfer_guarantees_accepted','transfer_document_pack_review','buyer_signing_review','seller_signing_review','payment_security_review',
              'lodgement_pack_prepared','lodgement_pack_checked','ready_for_lodgement','lodgement_ready','lodged','lodgement_submitted','lodged_at_deeds_office','prep','in_prep','registration_confirmed','registered',
              'final_accounts_prepared','registration_letter_issued','post_registration_closeout_review','matter_closed','transfer_complete','file_closed'
            )), '[]'::jsonb)
        )) end) from jsonb_array_elements(transaction_row.routing_profile_json->'workflowPlan'->'lanes') lane(value)
      ),true) || jsonb_build_object('version','attorney_matter_workflow_plan_v7'),true) routing_profile_json
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
  if position('''attorney_matter_workflow_plan_v7''' in v_definition)=0 then
    v_definition:=replace(v_definition,
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4'',''attorney_matter_workflow_plan_v5'',''attorney_matter_workflow_plan_v6''',
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4'',''attorney_matter_workflow_plan_v5'',''attorney_matter_workflow_plan_v6'',''attorney_matter_workflow_plan_v7''');
    execute v_definition;
  end if;
end;
$$;

commit;
