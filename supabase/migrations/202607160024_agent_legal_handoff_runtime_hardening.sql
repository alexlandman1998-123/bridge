begin;

create or replace view public.bridge_attorney_workflow_step_templates_v1 as
select * from (values
  ('transfer','instruction_received','Instruction Received',1),
  ('transfer','matter_opened','File Opened and Matter Number Assigned',2),
  ('transfer','otp_source_docs_checked','OTP and Source Documents Checked',3),
  ('transfer','buyer_fica_requested','Buyer FICA Requested',4),
  ('transfer','buyer_fica_received','Buyer FICA Received',5),
  ('transfer','buyer_fica_approved','Buyer FICA Approved',6),
  ('transfer','seller_fica_requested','Seller FICA Requested',7),
  ('transfer','seller_fica_received','Seller FICA Received',8),
  ('transfer','seller_fica_approved','Seller FICA Approved',9),
  ('transfer','entity_authority_checked','Entity Authority Checked',10),
  ('transfer','title_deed_checked','Title Deed or Ownership Checked',11),
  ('transfer','existing_bond_confirmed','Existing Bond or Cancellation Requirement Confirmed',12),
  ('transfer','transfer_duty_assessment_prepared','Transfer Duty Assessment Prepared',13),
  ('transfer','transfer_duty_submitted','Transfer Duty Submitted',14),
  ('transfer','transfer_duty_receipt_received','Transfer Duty Receipt Received',15),
  ('transfer','rates_figures_requested','Rates Figures Requested',16),
  ('transfer','rates_payment_confirmed','Rates Payment Confirmed',17),
  ('transfer','rates_clearance_received','Rates Clearance Certificate Received',18),
  ('transfer','levy_clearance_requested','Levy Clearance Requested',19),
  ('transfer','levy_clearance_received','Levy Clearance Received',20),
  ('transfer','compliance_certificates_received','Compliance Certificates Received',21),
  ('transfer','transfer_documents_prepared','Transfer Documents Prepared',22),
  ('transfer','buyer_signing_scheduled','Buyer Signing Scheduled',23),
  ('transfer','buyer_signed_transfer_documents','Buyer Signed Transfer Documents',24),
  ('transfer','seller_signing_scheduled','Seller Signing Scheduled',25),
  ('transfer','seller_signed_transfer_documents','Seller Signed Transfer Documents',26),
  ('transfer','guarantees_requested','Guarantees Requested',27),
  ('transfer','guarantees_received','Guarantees Received',28),
  ('transfer','transfer_guarantees_accepted','Guarantees Accepted',29),
  ('transfer','lodgement_pack_prepared','Lodgement Pack Prepared',30),
  ('transfer','lodgement_ready','Lodgement Ready',31),
  ('transfer','lodged_at_deeds_office','Lodged at Deeds Office',32),
  ('transfer','in_prep','On Prep',33),
  ('transfer','registered','Registered',34),
  ('transfer','final_accounts_prepared','Final Accounts and Statement Prepared',35),
  ('transfer','registration_letter_issued','Registration Letter Issued',36),
  ('transfer','matter_closed','Matter Closed',37),
  ('bond','bond_instruction_received','Bond Instruction Received',1),
  ('bond','bank_reference_captured','Bank and Reference Captured',2),
  ('bond','bond_approval_letter_received','Grant / Approval Letter Received',3),
  ('bond','bank_requirements_confirmed','Bank Conditions Reviewed',4),
  ('bond','bank_conditions_outstanding','Bank Conditions Outstanding',5),
  ('bond','bank_conditions_resolved','Bank Conditions Resolved',6),
  ('bond','bond_documents_prepared','Bond Documents Prepared',7),
  ('bond','buyer_bond_signing_scheduled','Buyer Bond Signing Scheduled',8),
  ('bond','buyer_signed_bond_documents','Buyer Signed Bond Documents',9),
  ('bond','bond_documents_sent_to_bank','Documents Sent to Bank for Approval',10),
  ('bond','bank_approval_to_lodge_received','Bank Approval to Lodge Received',11),
  ('bond','guarantees_issued','Guarantees Issued',12),
  ('bond','guarantee_wording_accepted','Guarantee Wording Accepted',13),
  ('bond','bond_lodgement_ready','Bond Lodgement Pack Ready',14),
  ('bond','bond_lodged','Bond Lodged Simultaneously',15),
  ('bond','bond_registered','Bond Registered',16),
  ('bond','bond_close_out_complete','Bank Confirmation and Close-Out Complete',17),
  ('cancellation','cancellation_existing_bond_confirmed','Existing Bond Confirmed',1),
  ('cancellation','cancellation_bank_captured','Cancellation Bank Captured',2),
  ('cancellation','cancellation_bond_account_captured','Bond Account Number Captured',3),
  ('cancellation','cancellation_instruction_received','Cancellation Instruction Received',4),
  ('cancellation','notice_period_captured','90-Day Notice Status Captured',5),
  ('cancellation','cancellation_figures_requested','Cancellation Figures Requested',6),
  ('cancellation','cancellation_figures_received','Cancellation Figures Received',7),
  ('cancellation','figures_expiry_captured','Figures Expiry Date Captured',8),
  ('cancellation','notice_penalty_risk_captured','Penalty and Notice Risk Captured',9),
  ('cancellation','cancellation_guarantees_requested','Guarantees Requested',10),
  ('cancellation','cancellation_guarantees_received','Guarantees Received',11),
  ('cancellation','cancellation_guarantees_accepted','Guarantees Accepted',12),
  ('cancellation','cancellation_documents_prepared','Cancellation Documents Prepared',13),
  ('cancellation','seller_cancellation_documents_signed','Seller Cancellation Documents Signed',14),
  ('cancellation','cancellation_lodgement_ready','Cancellation Lodgement Ready',15),
  ('cancellation','cancellation_lodged','Cancellation Lodged Simultaneously',16),
  ('cancellation','cancellation_registered','Cancellation Registered',17),
  ('cancellation','settlement_proof_captured','Settlement / Proof of Payment Captured',18),
  ('cancellation','cancellation_close_out_complete','Cancellation Close-Out Complete',19)
) as template(process_type, step_key, step_label, sort_order);

revoke all on public.bridge_attorney_workflow_step_templates_v1 from public, anon;
grant select on public.bridge_attorney_workflow_step_templates_v1 to authenticated;

create or replace function public.bridge_prepare_agent_legal_handoff(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_profile jsonb := '{}'::jsonb;
  v_required_lanes text[] := array['transfer']::text[];
  v_required_roles text[] := array['transfer_attorney']::text[];
  v_assigned_roles text[] := array[]::text[];
  v_missing_roles text[] := array[]::text[];
  v_lane text;
  v_role text;
  v_created_count integer := 0;
  v_seeded_step_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_transaction_id is null then
    raise exception 'Transaction id is required.' using errcode = '22023';
  end if;
  if not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'Transaction not found or access denied.' using errcode = '42501';
  end if;

  select transaction.* into v_transaction
  from public.transactions transaction
  where transaction.id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found or access denied.' using errcode = 'P0002';
  end if;

  v_profile := coalesce(to_jsonb(v_transaction)->'routing_profile_json', '{}'::jsonb);
  if lower(coalesce(v_profile->>'financeType', to_jsonb(v_transaction)->>'finance_type', '')) in ('bond','hybrid','combination')
     or coalesce((v_profile->>'requiresBondAttorney')::boolean, false) then
    v_required_lanes := array_append(v_required_lanes, 'bond');
    v_required_roles := array_append(v_required_roles, 'bond_attorney');
  end if;
  if coalesce((to_jsonb(v_transaction)->>'cancellation_required')::boolean, false)
     or coalesce((to_jsonb(v_transaction)->>'seller_has_existing_bond')::boolean, false)
     or coalesce((to_jsonb(v_transaction)->>'existing_bond')::boolean, false)
     or coalesce((v_profile->>'requiresCancellationAttorney')::boolean, false)
     or coalesce((v_profile->>'sellerHasExistingBond')::boolean, false) then
    v_required_lanes := array_append(v_required_lanes, 'cancellation');
    v_required_roles := array_append(v_required_roles, 'cancellation_attorney');
  end if;

  foreach v_lane in array v_required_lanes loop
    v_role := case v_lane when 'bond' then 'bond_attorney' when 'cancellation' then 'cancellation_attorney' else 'transfer_attorney' end;
    insert into public.transaction_subprocesses (
      transaction_id, process_type, owner_type, status, attorney_role,
      current_stage, lane_status, lane_metadata
    ) values (
      p_transaction_id, v_lane, 'attorney', 'not_started', v_role,
      'instruction_received', 'not_started',
      jsonb_build_object('source','agent_legal_handoff_phase2','transactionId',p_transaction_id)
    ) on conflict (transaction_id, process_type) do nothing;
    get diagnostics v_created_count = row_count;
    if v_created_count > 0 then
      insert into public.transaction_events (
        transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
      ) values (
        p_transaction_id, 'AttorneyLaneCreated',
        jsonb_build_object('laneKey',v_lane,'attorneyRole',v_role,'source','agent_legal_handoff_phase2'),
        v_actor_id, 'attorney', 'internal'
      );
    end if;
  end loop;

  insert into public.transaction_subprocess_steps (
    subprocess_id, step_key, step_label, status, owner_type, sort_order, visibility_scope
  )
  select lane.id, template.step_key, template.step_label, 'not_started', 'attorney', template.sort_order, 'internal'
  from public.transaction_subprocesses lane
  join public.bridge_attorney_workflow_step_templates_v1 template on template.process_type = lane.process_type
  where lane.transaction_id = p_transaction_id
    and lane.process_type = any(v_required_lanes)
    and not exists (
      select 1 from public.transaction_subprocess_steps existing
      where existing.subprocess_id = lane.id and existing.step_key = template.step_key
    );
  get diagnostics v_seeded_step_count = row_count;

  select coalesce(array_agg(distinct assignment.attorney_role), array[]::text[])
  into v_assigned_roles
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and coalesce(assignment.assignment_status, assignment.status, 'active') not in ('removed','declined','cancelled');

  select coalesce(array_agg(role_name), array[]::text[])
  into v_missing_roles
  from unnest(v_required_roles) role_name
  where not (role_name = any(v_assigned_roles));

  return jsonb_build_object(
    'prepared', true,
    'transactionId', p_transaction_id,
    'requiredLaneKeys', to_jsonb(v_required_lanes),
    'assignedAttorneyRoles', to_jsonb(v_assigned_roles),
    'missingAttorneyRoles', to_jsonb(v_missing_roles),
    'laneCount', cardinality(v_required_lanes),
    'seededStepCount', v_seeded_step_count
  );
end;
$$;

revoke all on function public.bridge_prepare_agent_legal_handoff(uuid) from public, anon;
grant execute on function public.bridge_prepare_agent_legal_handoff(uuid) to authenticated;

comment on function public.bridge_prepare_agent_legal_handoff(uuid) is
  'Authorised idempotent legal handoff that materialises required lanes and their canonical Attorney workflow steps.';

commit;
