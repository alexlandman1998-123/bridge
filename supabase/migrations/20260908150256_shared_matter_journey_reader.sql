begin;
-- Static phase grouping is the Work catalog, not a separate portal checklist.
alter table journey_private.task_catalog
  add column phase_key text, add column phase_label text,
  add column phase_order integer, add column task_order integer;
update journey_private.task_catalog c
set phase_key = p.phase_key, phase_label = p.phase_label,
    phase_order = p.phase_order, task_order = p.task_order
from jsonb_to_recordset($phases$[{"lane_key":"transfer","step_key":"instruction_received","phase_key":"instruction","phase_label":"Instruction & File Opening","phase_order":0,"task_order":0},{"lane_key":"transfer","step_key":"matter_opened","phase_key":"instruction","phase_label":"Instruction & File Opening","phase_order":0,"task_order":1},{"lane_key":"transfer","step_key":"otp_source_docs_checked","phase_key":"instruction","phase_label":"Instruction & File Opening","phase_order":0,"task_order":2},{"lane_key":"transfer","step_key":"title_deed_checked","phase_key":"instruction","phase_label":"Instruction & File Opening","phase_order":0,"task_order":3},{"lane_key":"transfer","step_key":"existing_bond_confirmed","phase_key":"instruction","phase_label":"Instruction & File Opening","phase_order":0,"task_order":4},{"lane_key":"transfer","step_key":"buyer_fica_requested","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":0},{"lane_key":"transfer","step_key":"buyer_fica_received","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":1},{"lane_key":"transfer","step_key":"buyer_fica_approved","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":2},{"lane_key":"transfer","step_key":"seller_fica_requested","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":3},{"lane_key":"transfer","step_key":"seller_fica_received","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":4},{"lane_key":"transfer","step_key":"seller_fica_approved","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":5},{"lane_key":"transfer","step_key":"entity_authority_checked","phase_key":"fica_authority","phase_label":"FICA & Authority","phase_order":1,"task_order":6},{"lane_key":"transfer","step_key":"transfer_duty_assessment_prepared","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":0},{"lane_key":"transfer","step_key":"transfer_duty_submitted","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":1},{"lane_key":"transfer","step_key":"transfer_duty_receipt_received","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":2},{"lane_key":"transfer","step_key":"rates_figures_requested","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":3},{"lane_key":"transfer","step_key":"rates_payment_confirmed","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":4},{"lane_key":"transfer","step_key":"rates_clearance_received","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":5},{"lane_key":"transfer","step_key":"levy_clearance_requested","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":6},{"lane_key":"transfer","step_key":"levy_clearance_received","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":7},{"lane_key":"transfer","step_key":"compliance_certificates_received","phase_key":"financial_preparation","phase_label":"Financial Preparation","phase_order":2,"task_order":8},{"lane_key":"transfer","step_key":"transfer_documents_prepared","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":0},{"lane_key":"transfer","step_key":"buyer_signing_scheduled","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":1},{"lane_key":"transfer","step_key":"buyer_signed_transfer_documents","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":2},{"lane_key":"transfer","step_key":"seller_signing_scheduled","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":3},{"lane_key":"transfer","step_key":"seller_signed_transfer_documents","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":4},{"lane_key":"transfer","step_key":"guarantees_requested","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":5},{"lane_key":"transfer","step_key":"guarantees_received","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":6},{"lane_key":"transfer","step_key":"transfer_guarantees_accepted","phase_key":"documents_guarantees","phase_label":"Documents & Guarantees","phase_order":3,"task_order":7},{"lane_key":"transfer","step_key":"lodgement_pack_prepared","phase_key":"lodgement_registration","phase_label":"Lodgement & Registration","phase_order":4,"task_order":0},{"lane_key":"transfer","step_key":"lodgement_ready","phase_key":"lodgement_registration","phase_label":"Lodgement & Registration","phase_order":4,"task_order":1},{"lane_key":"transfer","step_key":"lodged_at_deeds_office","phase_key":"lodgement_registration","phase_label":"Lodgement & Registration","phase_order":4,"task_order":2},{"lane_key":"transfer","step_key":"in_prep","phase_key":"lodgement_registration","phase_label":"Lodgement & Registration","phase_order":4,"task_order":3},{"lane_key":"transfer","step_key":"registered","phase_key":"lodgement_registration","phase_label":"Lodgement & Registration","phase_order":4,"task_order":4},{"lane_key":"transfer","step_key":"final_accounts_prepared","phase_key":"post_registration","phase_label":"Post-Registration & Closure","phase_order":5,"task_order":0},{"lane_key":"transfer","step_key":"registration_letter_issued","phase_key":"post_registration","phase_label":"Post-Registration & Closure","phase_order":5,"task_order":1},{"lane_key":"transfer","step_key":"matter_closed","phase_key":"post_registration","phase_label":"Post-Registration & Closure","phase_order":5,"task_order":2},{"lane_key":"bond","step_key":"bond_instruction_received","phase_key":"bond_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":0},{"lane_key":"bond","step_key":"bank_reference_captured","phase_key":"bond_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":1},{"lane_key":"bond","step_key":"bond_approval_letter_received","phase_key":"bond_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":2},{"lane_key":"bond","step_key":"bank_requirements_confirmed","phase_key":"bond_conditions","phase_label":"Bank Conditions","phase_order":1,"task_order":0},{"lane_key":"bond","step_key":"bank_conditions_outstanding","phase_key":"bond_conditions","phase_label":"Bank Conditions","phase_order":1,"task_order":1},{"lane_key":"bond","step_key":"bank_conditions_resolved","phase_key":"bond_conditions","phase_label":"Bank Conditions","phase_order":1,"task_order":2},{"lane_key":"bond","step_key":"bond_documents_prepared","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":0},{"lane_key":"bond","step_key":"buyer_bond_signing_scheduled","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":1},{"lane_key":"bond","step_key":"buyer_signed_bond_documents","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":2},{"lane_key":"bond","step_key":"bond_documents_sent_to_bank","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":3},{"lane_key":"bond","step_key":"bank_approval_to_lodge_received","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":4},{"lane_key":"bond","step_key":"guarantees_issued","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":5},{"lane_key":"bond","step_key":"guarantee_wording_accepted","phase_key":"bond_documents","phase_label":"Documents & Guarantees","phase_order":2,"task_order":6},{"lane_key":"bond","step_key":"bond_lodgement_ready","phase_key":"bond_registration","phase_label":"Lodgement & Registration","phase_order":3,"task_order":0},{"lane_key":"bond","step_key":"bond_lodged","phase_key":"bond_registration","phase_label":"Lodgement & Registration","phase_order":3,"task_order":1},{"lane_key":"bond","step_key":"bond_registered","phase_key":"bond_registration","phase_label":"Lodgement & Registration","phase_order":3,"task_order":2},{"lane_key":"bond","step_key":"bond_close_out_complete","phase_key":"bond_registration","phase_label":"Lodgement & Registration","phase_order":3,"task_order":3},{"lane_key":"cancellation","step_key":"cancellation_existing_bond_confirmed","phase_key":"cancellation_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":0},{"lane_key":"cancellation","step_key":"cancellation_bank_captured","phase_key":"cancellation_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":1},{"lane_key":"cancellation","step_key":"cancellation_bond_account_captured","phase_key":"cancellation_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":2},{"lane_key":"cancellation","step_key":"cancellation_instruction_received","phase_key":"cancellation_instruction","phase_label":"Instruction & Bank","phase_order":0,"task_order":3},{"lane_key":"cancellation","step_key":"notice_period_captured","phase_key":"cancellation_figures","phase_label":"Notice & Figures","phase_order":1,"task_order":0},{"lane_key":"cancellation","step_key":"cancellation_figures_requested","phase_key":"cancellation_figures","phase_label":"Notice & Figures","phase_order":1,"task_order":1},{"lane_key":"cancellation","step_key":"cancellation_figures_received","phase_key":"cancellation_figures","phase_label":"Notice & Figures","phase_order":1,"task_order":2},{"lane_key":"cancellation","step_key":"figures_expiry_captured","phase_key":"cancellation_figures","phase_label":"Notice & Figures","phase_order":1,"task_order":3},{"lane_key":"cancellation","step_key":"notice_penalty_risk_captured","phase_key":"cancellation_figures","phase_label":"Notice & Figures","phase_order":1,"task_order":4},{"lane_key":"cancellation","step_key":"cancellation_guarantees_requested","phase_key":"cancellation_documents","phase_label":"Guarantees & Documents","phase_order":2,"task_order":0},{"lane_key":"cancellation","step_key":"cancellation_guarantees_received","phase_key":"cancellation_documents","phase_label":"Guarantees & Documents","phase_order":2,"task_order":1},{"lane_key":"cancellation","step_key":"cancellation_guarantees_accepted","phase_key":"cancellation_documents","phase_label":"Guarantees & Documents","phase_order":2,"task_order":2},{"lane_key":"cancellation","step_key":"cancellation_documents_prepared","phase_key":"cancellation_documents","phase_label":"Guarantees & Documents","phase_order":2,"task_order":3},{"lane_key":"cancellation","step_key":"seller_cancellation_documents_signed","phase_key":"cancellation_documents","phase_label":"Guarantees & Documents","phase_order":2,"task_order":4},{"lane_key":"cancellation","step_key":"cancellation_lodgement_ready","phase_key":"cancellation_registration","phase_label":"Registration & Close-Out","phase_order":3,"task_order":0},{"lane_key":"cancellation","step_key":"cancellation_lodged","phase_key":"cancellation_registration","phase_label":"Registration & Close-Out","phase_order":3,"task_order":1},{"lane_key":"cancellation","step_key":"cancellation_registered","phase_key":"cancellation_registration","phase_label":"Registration & Close-Out","phase_order":3,"task_order":2},{"lane_key":"cancellation","step_key":"settlement_proof_captured","phase_key":"cancellation_registration","phase_label":"Registration & Close-Out","phase_order":3,"task_order":3},{"lane_key":"cancellation","step_key":"cancellation_close_out_complete","phase_key":"cancellation_registration","phase_label":"Registration & Close-Out","phase_order":3,"task_order":4}]$phases$::jsonb)
as p(lane_key text,step_key text,phase_key text,phase_label text,phase_order integer,task_order integer)
where c.lane_key = p.lane_key and c.step_key = p.step_key;
alter table journey_private.task_catalog
  alter column phase_key set not null, alter column phase_label set not null,
  alter column phase_order set not null, alter column task_order set not null;

create or replace function public.bridge_read_shared_matter_journey(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  -- All recipients get the same allowlisted facts. Caller-supplied audience never
  -- grants access. Token helpers validate scoped headers, expiry and revocation.
  if not coalesce((
    (auth.uid() is not null and public.bridge_can_access_transaction_spine(p_transaction_id))
    or public.bridge_has_client_portal_token_transaction_access(p_transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(p_transaction_id)
  ),false) then raise exception 'You do not have access to this matter journey.' using errcode='42501'; end if;

  -- One stable statement snapshot for plan, task outcomes and refresh revision.
  with source as (
    select t.id, t.routing_profile_json -> 'workflowPlan' plan,
      coalesce(r.version,0) revision
    from public.transactions t left join public.transaction_refresh_signals r on r.transaction_id=t.id
    where t.id=p_transaction_id
  ), planned as (
    select lp ->> 'laneKey' lane_key,k.step_key
    from source
    cross join lateral jsonb_array_elements(coalesce(plan -> 'lanes','[]'::jsonb)) lp
    cross join lateral jsonb_array_elements_text(lp -> 'stepKeys') k(step_key)
    where plan ->> 'status'='active'
    union all
    select l.process_type,s.step_key from source
    join public.transaction_subprocesses l on l.transaction_id=source.id
    join public.transaction_subprocess_steps s on s.subprocess_id=l.id
    where coalesce(plan ->> 'status','')<>'active' and l.process_type in ('transfer','bond','cancellation')
  ), tasks as (
    select p.lane_key,p.step_key,c.phase_key,c.phase_label,c.phase_order,c.task_order,
      c.definition #>> '{professional,title}' label,
      coalesce(s.status,'not_started') status,source.revision
    from planned p cross join source
    left join journey_private.task_catalog c on c.lane_key=p.lane_key and c.step_key=p.step_key
    left join public.transaction_subprocesses l on l.transaction_id=source.id and l.process_type=p.lane_key
    left join public.transaction_subprocess_steps s on s.subprocess_id=l.id and s.step_key=p.step_key
  ), phases as (
    select lane_key,phase_key,phase_label,phase_order,
      jsonb_agg(jsonb_build_object('key',step_key,'label',label,'clientLabel',label,
        'status',status,'revision',revision) order by task_order,step_key) tasks
    from tasks group by lane_key,phase_key,phase_label,phase_order
  ), lanes as (
    select lane_key,jsonb_agg(jsonb_build_object('key',phase_key,'label',phase_label,
      'clientLabel',phase_label,'tasks',tasks) order by phase_order,phase_key) phases
    from phases group by lane_key
  )
  select jsonb_build_object('schemaVersion',1,'transactionId',source.id,'revision',source.revision,
    'planRevision',source.revision,
    'lanes',coalesce((select jsonb_agg(jsonb_build_object('key',lane_key,'phases',phases)
      order by case lane_key when 'transfer' then 1 when 'bond' then 2 else 3 end) from lanes),'[]'::jsonb),
    'invalidCatalog',exists(select 1 from tasks where phase_key is null))
  into v_result from source;
  if v_result is null then raise exception 'Matter not found.' using errcode='P0002'; end if;
  if (v_result ->> 'invalidCatalog')::boolean then
    raise exception 'Matter plan requires reconciliation.' using errcode='22023';
  end if;
  return v_result - 'invalidCatalog';
end;
$$;
revoke all on function public.bridge_read_shared_matter_journey(uuid) from public;
grant execute on function public.bridge_read_shared_matter_journey(uuid) to authenticated,anon;
notify pgrst,'reload schema';
commit;
