begin;

-- Signing invitations and guarantee requests are operational activity. The
-- attorney's active work is the completed document/signing/security outcome.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
)
values
  ('transfer','transfer_document_pack_review',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','transfer_document_pack_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Transfer document pack reviewed','description','The transfer document pack is being prepared and reviewed.'),'client',jsonb_build_object('title','Transfer documents in preparation','description','The transfer attorneys are preparing the transfer documents.')),'documents_guarantees','Documents & Guarantees',3,0),
  ('transfer','buyer_signing_review',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','buyer_signing_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Buyer signing reviewed','description','Buyer signing and the signed transfer documents are being managed.'),'client',jsonb_build_object('title','Buyer signing in progress','description','The transfer attorneys are managing buyer signing.')),'documents_guarantees','Documents & Guarantees',3,1),
  ('transfer','seller_signing_review',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','seller_signing_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Seller signing reviewed','description','Seller signing and the signed transfer documents are being managed.'),'client',jsonb_build_object('title','Seller signing in progress','description','The transfer attorneys are managing seller signing.')),'documents_guarantees','Documents & Guarantees',3,2),
  ('transfer','payment_security_review',jsonb_build_object('processKey','transfer','processLabel','Property transfer','stepKey','payment_security_review','ownerRole','transfer_attorney','defaultVisibility','professional_shared','clientVisibleAllowed',true,'professional',jsonb_build_object('title','Payment security reviewed','description','The applicable guarantee, undertaking, or cleared-funds route is being reviewed.'),'client',jsonb_build_object('title','Payment security review in progress','description','The transfer attorneys are reviewing the applicable payment security.')),'documents_guarantees','Documents & Guarantees',3,3)
on conflict (lane_key,step_key) do update set definition=excluded.definition,phase_key=excluded.phase_key,phase_label=excluded.phase_label,phase_order=excluded.phase_order,task_order=excluded.task_order;

insert into public.transaction_subprocess_steps (subprocess_id,step_key,step_label,status,owner_type,sort_order,visibility_scope)
select lane.id, review.step_key, review.step_label, coalesce(legacy.status,'not_started'),'attorney',review.sort_order,'internal'
from public.transaction_subprocesses lane
cross join (values
  ('transfer_document_pack_review','Prepare & Review Transfer Document Pack',12,array['transfer_documents_prepared']::text[]),
  ('buyer_signing_review','Complete Buyer Signing',13,array['buyer_signing_scheduled','buyer_signed_transfer_documents']::text[]),
  ('seller_signing_review','Complete Seller Signing',14,array['seller_signing_scheduled','seller_signed_transfer_documents']::text[]),
  ('payment_security_review','Review Payment Security',15,array['guarantees_requested','guarantees_received','transfer_guarantees_accepted']::text[])
) review(step_key,step_label,sort_order,legacy_keys)
left join lateral (
  select case when bool_or(step.status in ('completed','completed_externally')) then 'completed'
    when bool_or(step.status='blocked') then 'blocked' when bool_or(step.status='waiting') then 'waiting'
    when bool_or(step.status='in_progress') then 'in_progress' when bool_and(step.status='not_applicable') then 'not_applicable'
    else 'not_started' end status
  from public.transaction_subprocess_steps step where step.subprocess_id=lane.id and step.step_key=any(review.legacy_keys)
) legacy on true
where lane.process_type='transfer' and not exists (select 1 from public.transaction_subprocess_steps existing where existing.subprocess_id=lane.id and existing.step_key=review.step_key);

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
          coalesce((select jsonb_agg(step.value) from jsonb_array_elements(coalesce(lane.value->'stepKeys','[]'::jsonb)) step(value)
            where step.value#>>'{}' not in (
              'instruction_received','matter_opened','otp_source_docs_checked','title_deed_checked','existing_bond_confirmed',
              'buyer_fica_requested','buyer_fica_received','buyer_fica_approved','seller_fica_requested','seller_fica_received','seller_fica_approved','entity_authority_checked','buyer_fica_review','seller_fica_review',
              'transfer_duty_assessment_prepared','transfer_duty_submitted','transfer_duty_receipt_received','rates_figures_requested','rates_payment_confirmed','rates_clearance_received','levy_clearance_requested','levy_clearance_received','compliance_certificates_received','transfer_duty_vat_review','municipal_rates_clearance_review','levy_hoa_clearance_review','property_compliance_review',
              'transfer_documents_prepared','buyer_signing_scheduled','buyer_signed_transfer_documents','seller_signing_scheduled','seller_signed_transfer_documents','guarantees_requested','guarantees_received','transfer_guarantees_accepted','transfer_document_pack_review','buyer_signing_review','seller_signing_review','payment_security_review'
            )), '[]'::jsonb)
        )) end) from jsonb_array_elements(transaction_row.routing_profile_json->'workflowPlan'->'lanes') lane(value)
      ),true) || jsonb_build_object('version','attorney_matter_workflow_plan_v5'),true) routing_profile_json
  from public.transactions transaction_row where transaction_row.routing_profile_json->'workflowPlan'->>'status'='active'
    and jsonb_typeof(transaction_row.routing_profile_json->'workflowPlan'->'lanes')='array'
)
update public.transactions transaction_row set routing_profile_json=rebuilt.routing_profile_json,updated_at=now() from rebuilt where transaction_row.id=rebuilt.id;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('journey_private.audit_matter(uuid)'::regprocedure) into v_definition;
  if position('''attorney_matter_workflow_plan_v5''' in v_definition)=0 then
    v_definition:=replace(v_definition,
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4''',
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'',''attorney_matter_workflow_plan_v4'',''attorney_matter_workflow_plan_v5''');
    execute v_definition;
  end if;
end;
$$;

commit;
