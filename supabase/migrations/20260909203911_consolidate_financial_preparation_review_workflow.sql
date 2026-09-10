begin;

-- Financial preparation is reviewed as four attorney-owned outcomes, rather
-- than a sequence of background requests and receipts.  The request/payment
-- history remains intact in the existing rows and event stream.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
)
values
  ('transfer', 'transfer_duty_vat_review', jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','transfer_duty_vat_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Transfer tax reviewed','description','The applicable transfer duty, exemption or VAT evidence is under review.'),'client',jsonb_build_object('title','Transfer tax review in progress','description','The transfer attorneys are reviewing the applicable transfer tax route.')), 'financial_preparation', 'Financial Preparation', 2, 0),
  ('transfer', 'municipal_rates_clearance_review', jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','municipal_rates_clearance_review','ownerRole','transfer_attorney','defaultVisibility','client_visible','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Municipal rates clearance reviewed','description','Rates figures, payment evidence and the municipal clearance are under review.'),'client',jsonb_build_object('title','Municipal clearance review in progress','description','The transfer attorneys are reviewing municipal rates clearance.')), 'financial_preparation', 'Financial Preparation', 2, 1),
  ('transfer', 'levy_hoa_clearance_review', jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','levy_hoa_clearance_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Levy or HOA clearance reviewed','description','The applicable body-corporate or HOA clearance is under review.'),'client',jsonb_build_object('title','Levy clearance review in progress','description','The transfer attorneys are reviewing the applicable levy or HOA clearance.')), 'financial_preparation', 'Financial Preparation', 2, 2),
  ('transfer', 'property_compliance_review', jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','property_compliance_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Property compliance reviewed','description','Applicable property compliance certificates are under review.'),'client',jsonb_build_object('title','Property compliance review in progress','description','The transfer attorneys are reviewing applicable property compliance certificates.')), 'financial_preparation', 'Financial Preparation', 2, 3)
on conflict (lane_key, step_key) do update set
  definition = excluded.definition, phase_key = excluded.phase_key, phase_label = excluded.phase_label,
  phase_order = excluded.phase_order, task_order = excluded.task_order;

insert into public.transaction_subprocess_steps (
  subprocess_id, step_key, step_label, status, owner_type, sort_order, visibility_scope
)
select lane.id, review.step_key, review.step_label, coalesce(legacy.status, 'not_started'), 'attorney', review.sort_order, 'internal'
from public.transaction_subprocesses lane
cross join (
  values
    ('transfer_duty_vat_review', 'Review Transfer Duty / VAT', 8, array['transfer_duty_assessment_prepared','transfer_duty_submitted','transfer_duty_receipt_received']::text[]),
    ('municipal_rates_clearance_review', 'Review Municipal Rates Clearance', 9, array['rates_figures_requested','rates_payment_confirmed','rates_clearance_received']::text[]),
    ('levy_hoa_clearance_review', 'Review Levy / HOA Clearance', 10, array['levy_clearance_requested','levy_clearance_received']::text[]),
    ('property_compliance_review', 'Review Property Compliance Certificates', 11, array['compliance_certificates_received']::text[])
) as review(step_key, step_label, sort_order, legacy_keys)
left join lateral (
  select case
    when bool_or(step.status in ('completed', 'completed_externally')) then 'completed'
    when bool_or(step.status = 'blocked') then 'blocked'
    when bool_or(step.status = 'waiting') then 'waiting'
    when bool_or(step.status = 'in_progress') then 'in_progress'
    when bool_and(step.status = 'not_applicable') then 'not_applicable'
    else 'not_started'
  end as status
  from public.transaction_subprocess_steps step
  where step.subprocess_id = lane.id and step.step_key = any(review.legacy_keys)
) legacy on true
where lane.process_type = 'transfer'
  and not exists (
    select 1 from public.transaction_subprocess_steps existing
    where existing.subprocess_id = lane.id and existing.step_key = review.step_key
  );

with rebuilt as (
  select transaction_row.id,
    jsonb_set(
      transaction_row.routing_profile_json, '{workflowPlan}',
      jsonb_set(
        transaction_row.routing_profile_json -> 'workflowPlan', '{lanes}',
        (
          select jsonb_agg(
            case when lane.value ->> 'laneKey' <> 'transfer' then lane.value
            else jsonb_set(
              lane.value, '{stepKeys}',
              jsonb_build_array(
                'instruction_received','matter_opened','otp_source_docs_checked','title_deed_checked','existing_bond_confirmed',
                'buyer_fica_review','seller_fica_review',
                'transfer_duty_vat_review','municipal_rates_clearance_review'
              ) || case when lower(coalesce(transaction_row.routing_profile_json ->> 'propertyTenure', '')) = 'freehold'
                then '[]'::jsonb else jsonb_build_array('levy_hoa_clearance_review') end ||
              jsonb_build_array('property_compliance_review') || coalesce((
                select jsonb_agg(step.value)
                from jsonb_array_elements(coalesce(lane.value -> 'stepKeys', '[]'::jsonb)) step(value)
                where step.value #>> '{}' not in (
                  'instruction_received','matter_opened','otp_source_docs_checked','title_deed_checked','existing_bond_confirmed',
                  'buyer_fica_requested','buyer_fica_received','buyer_fica_approved','seller_fica_requested','seller_fica_received','seller_fica_approved','entity_authority_checked',
                  'buyer_fica_review','seller_fica_review',
                  'transfer_duty_assessment_prepared','transfer_duty_submitted','transfer_duty_receipt_received',
                  'rates_figures_requested','rates_payment_confirmed','rates_clearance_received',
                  'levy_clearance_requested','levy_clearance_received','compliance_certificates_received',
                  'transfer_duty_vat_review','municipal_rates_clearance_review','levy_hoa_clearance_review','property_compliance_review'
                )
              ), '[]'::jsonb)
            )
          ) from jsonb_array_elements(transaction_row.routing_profile_json -> 'workflowPlan' -> 'lanes') lane(value)
        ), true
      ) || jsonb_build_object('version', 'attorney_matter_workflow_plan_v4'), true
    ) as routing_profile_json
  from public.transactions transaction_row
  where transaction_row.routing_profile_json -> 'workflowPlan' ->> 'status' = 'active'
    and jsonb_typeof(transaction_row.routing_profile_json -> 'workflowPlan' -> 'lanes') = 'array'
)
update public.transactions transaction_row
set routing_profile_json = rebuilt.routing_profile_json, updated_at = now()
from rebuilt where transaction_row.id = rebuilt.id;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('journey_private.audit_matter(uuid)'::regprocedure) into v_definition;
  if position('''attorney_matter_workflow_plan_v4''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3''',
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4'''
    );
    execute v_definition;
  end if;
end;
$$;

commit;
