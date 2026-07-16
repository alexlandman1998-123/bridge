begin;

-- Transaction events are an extensible audit stream. A hard-coded whitelist caused
-- newly introduced workflow actions to fail after their primary data had saved.
alter table if exists public.transaction_events
  drop constraint if exists transaction_events_event_type_check;

alter table if exists public.transaction_events
  add constraint transaction_events_event_type_check
  check (event_type is not null and length(trim(event_type)) between 1 and 120);

comment on constraint transaction_events_event_type_check on public.transaction_events is
  'Event types are extensible application identifiers. Require a non-empty bounded value rather than a release-coupled whitelist.';

-- Bring every existing legal lane onto the canonical step catalogue. This is
-- intentionally idempotent and preserves legacy/aliased rows and their history.
with canonical_steps(process_type, step_key, step_label, sort_order) as (
  values
    ('transfer', 'instruction_received', 'Instruction Received', 1),
    ('transfer', 'matter_opened', 'File Opened and Matter Number Assigned', 2),
    ('transfer', 'otp_source_docs_checked', 'OTP and Source Documents Checked', 3),
    ('transfer', 'buyer_fica_requested', 'Buyer FICA Requested', 4),
    ('transfer', 'buyer_fica_received', 'Buyer FICA Received', 5),
    ('transfer', 'buyer_fica_approved', 'Buyer FICA Approved', 6),
    ('transfer', 'seller_fica_requested', 'Seller FICA Requested', 7),
    ('transfer', 'seller_fica_received', 'Seller FICA Received', 8),
    ('transfer', 'seller_fica_approved', 'Seller FICA Approved', 9),
    ('transfer', 'entity_authority_checked', 'Entity Authority Checked', 10),
    ('transfer', 'title_deed_checked', 'Title Deed or Ownership Checked', 11),
    ('transfer', 'existing_bond_confirmed', 'Existing Bond or Cancellation Requirement Confirmed', 12),
    ('transfer', 'transfer_duty_assessment_prepared', 'Transfer Duty Assessment Prepared', 13),
    ('transfer', 'transfer_duty_submitted', 'Transfer Duty Submitted', 14),
    ('transfer', 'transfer_duty_receipt_received', 'Transfer Duty Receipt Received', 15),
    ('transfer', 'rates_figures_requested', 'Rates Figures Requested', 16),
    ('transfer', 'rates_payment_confirmed', 'Rates Payment Confirmed', 17),
    ('transfer', 'rates_clearance_received', 'Rates Clearance Certificate Received', 18),
    ('transfer', 'levy_clearance_requested', 'Levy Clearance Requested', 19),
    ('transfer', 'levy_clearance_received', 'Levy Clearance Received', 20),
    ('transfer', 'compliance_certificates_received', 'Compliance Certificates Received', 21),
    ('transfer', 'transfer_documents_prepared', 'Transfer Documents Prepared', 22),
    ('transfer', 'buyer_signing_scheduled', 'Buyer Signing Scheduled', 23),
    ('transfer', 'buyer_signed_transfer_documents', 'Buyer Signed Transfer Documents', 24),
    ('transfer', 'seller_signing_scheduled', 'Seller Signing Scheduled', 25),
    ('transfer', 'seller_signed_transfer_documents', 'Seller Signed Transfer Documents', 26),
    ('transfer', 'guarantees_requested', 'Guarantees Requested', 27),
    ('transfer', 'guarantees_received', 'Guarantees Received', 28),
    ('transfer', 'transfer_guarantees_accepted', 'Guarantees Accepted', 29),
    ('transfer', 'lodgement_pack_prepared', 'Lodgement Pack Prepared', 30),
    ('transfer', 'lodgement_ready', 'Lodgement Ready', 31),
    ('transfer', 'lodged_at_deeds_office', 'Lodged at Deeds Office', 32),
    ('transfer', 'in_prep', 'On Prep', 33),
    ('transfer', 'registered', 'Registered', 34),
    ('transfer', 'final_accounts_prepared', 'Final Accounts and Statement Prepared', 35),
    ('transfer', 'registration_letter_issued', 'Registration Letter Issued', 36),
    ('transfer', 'matter_closed', 'Matter Closed', 37),
    ('bond', 'bond_instruction_received', 'Bond Instruction Received', 1),
    ('bond', 'bank_reference_captured', 'Bank and Reference Captured', 2),
    ('bond', 'bond_approval_letter_received', 'Grant / Approval Letter Received', 3),
    ('bond', 'bank_requirements_confirmed', 'Bank Conditions Reviewed', 4),
    ('bond', 'bank_conditions_outstanding', 'Bank Conditions Outstanding', 5),
    ('bond', 'bank_conditions_resolved', 'Bank Conditions Resolved', 6),
    ('bond', 'bond_documents_prepared', 'Bond Documents Prepared', 7),
    ('bond', 'buyer_bond_signing_scheduled', 'Buyer Bond Signing Scheduled', 8),
    ('bond', 'buyer_signed_bond_documents', 'Buyer Signed Bond Documents', 9),
    ('bond', 'bond_documents_sent_to_bank', 'Documents Sent to Bank for Approval', 10),
    ('bond', 'bank_approval_to_lodge_received', 'Bank Approval to Lodge Received', 11),
    ('bond', 'guarantees_issued', 'Guarantees Issued', 12),
    ('bond', 'guarantee_wording_accepted', 'Guarantee Wording Accepted', 13),
    ('bond', 'bond_lodgement_ready', 'Bond Lodgement Pack Ready', 14),
    ('bond', 'bond_lodged', 'Bond Lodged Simultaneously', 15),
    ('bond', 'bond_registered', 'Bond Registered', 16),
    ('bond', 'bond_close_out_complete', 'Bank Confirmation and Close-Out Complete', 17),
    ('cancellation', 'cancellation_existing_bond_confirmed', 'Existing Bond Confirmed', 1),
    ('cancellation', 'cancellation_bank_captured', 'Cancellation Bank Captured', 2),
    ('cancellation', 'cancellation_bond_account_captured', 'Bond Account Number Captured', 3),
    ('cancellation', 'cancellation_instruction_received', 'Cancellation Instruction Received', 4),
    ('cancellation', 'notice_period_captured', '90-Day Notice Status Captured', 5),
    ('cancellation', 'cancellation_figures_requested', 'Cancellation Figures Requested', 6),
    ('cancellation', 'cancellation_figures_received', 'Cancellation Figures Received', 7),
    ('cancellation', 'figures_expiry_captured', 'Figures Expiry Date Captured', 8),
    ('cancellation', 'notice_penalty_risk_captured', 'Penalty and Notice Risk Captured', 9),
    ('cancellation', 'cancellation_guarantees_requested', 'Guarantees Requested', 10),
    ('cancellation', 'cancellation_guarantees_received', 'Guarantees Received', 11),
    ('cancellation', 'cancellation_guarantees_accepted', 'Guarantees Accepted', 12),
    ('cancellation', 'cancellation_documents_prepared', 'Cancellation Documents Prepared', 13),
    ('cancellation', 'seller_cancellation_documents_signed', 'Seller Cancellation Documents Signed', 14),
    ('cancellation', 'cancellation_lodgement_ready', 'Cancellation Lodgement Ready', 15),
    ('cancellation', 'cancellation_lodged', 'Cancellation Lodged Simultaneously', 16),
    ('cancellation', 'cancellation_registered', 'Cancellation Registered', 17),
    ('cancellation', 'settlement_proof_captured', 'Settlement / Proof of Payment Captured', 18),
    ('cancellation', 'cancellation_close_out_complete', 'Cancellation Close-Out Complete', 19)
)
insert into public.transaction_subprocess_steps (
  subprocess_id,
  step_key,
  step_label,
  status,
  owner_type,
  sort_order,
  visibility_scope
)
select
  lane.id,
  canonical.step_key,
  canonical.step_label,
  'not_started',
  'attorney',
  canonical.sort_order,
  'internal'
from public.transaction_subprocesses lane
join canonical_steps canonical
  on canonical.process_type = lane.process_type
where lane.process_type in ('transfer', 'bond', 'cancellation')
  and not exists (
    select 1
    from public.transaction_subprocess_steps existing
    where existing.subprocess_id = lane.id
      and existing.step_key = canonical.step_key
  );

create or replace function public.bridge_update_attorney_workflow_step(
  p_transaction_id uuid,
  p_lane_key text,
  p_step_id uuid,
  p_status text,
  p_note text default '',
  p_visibility text default 'internal',
  p_work_packet jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_lane public.transaction_subprocesses%rowtype;
  v_step public.transaction_subprocess_steps%rowtype;
  v_lane_status text;
  v_event_type text;
  v_now timestamptz := now();
  v_attorney_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney workflow lane.' using errcode = '22023';
  end if;

  if p_status not in ('not_started', 'in_progress', 'waiting', 'blocked', 'completed') then
    raise exception 'Invalid attorney workflow step status.' using errcode = '22023';
  end if;

  if p_visibility not in ('internal', 'professional_shared', 'client_visible') then
    raise exception 'Invalid attorney workflow visibility.' using errcode = '22023';
  end if;

  v_attorney_role := p_lane_key || '_attorney';

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and lower(coalesce(profile.role, '')) in ('attorney', 'conveyancer')
  ) then
    raise exception 'Only attorney workspace users may update legal workflow steps.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and lower(coalesce(assignment.assignment_status, assignment.status, 'active')) <> 'removed'
      and (
        assignment.assigned_user_id = v_actor_id
        or assignment.attorney_user_id = v_actor_id
        or assignment.primary_attorney_id = v_actor_id
        or assignment.secretary_id = v_actor_id
        or assignment.admin_handler_id = v_actor_id
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.user_id = v_actor_id
            and member.status = 'active'
            and member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
        )
      )
  ) then
    raise exception 'You do not have permission to update this attorney workflow.' using errcode = '42501';
  end if;

  select lane.*
  into v_lane
  from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = p_lane_key
  for update;

  if not found then
    raise exception 'This workflow lane is not required for this transaction.' using errcode = 'P0002';
  end if;

  select step.*
  into v_step
  from public.transaction_subprocess_steps step
  where step.id = p_step_id
    and step.subprocess_id = v_lane.id
  for update;

  if not found then
    raise exception 'Workflow step not found.' using errcode = 'P0002';
  end if;

  update public.transaction_subprocess_steps
  set
    status = p_status,
    comment = nullif(trim(coalesce(p_note, '')), ''),
    completed_at = case when p_status = 'completed' then v_now else null end,
    completed_by = case when p_status = 'completed' then v_actor_id else null end,
    visibility_scope = p_visibility,
    updated_at = v_now
  where id = v_step.id;

  select case
    when count(*) > 0 and bool_and(step.status = 'completed') then 'completed'
    when bool_or(step.status = 'blocked') then 'blocked'
    when bool_or(step.status in ('in_progress', 'waiting', 'completed')) then 'in_progress'
    else 'not_started'
  end
  into v_lane_status
  from public.transaction_subprocess_steps step
  where step.subprocess_id = v_lane.id;

  update public.transaction_subprocesses
  set
    current_stage = v_step.step_key,
    lane_status = v_lane_status,
    status = v_lane_status,
    completed_at = case when v_lane_status = 'completed' then v_now else null end,
    updated_by = v_actor_id,
    updated_at = v_now
  where id = v_lane.id;

  insert into public.transaction_attorney_lane_history (
    transaction_id,
    subprocess_id,
    lane_key,
    attorney_role,
    previous_stage,
    new_stage,
    previous_status,
    new_status,
    changed_by,
    note,
    visibility,
    source,
    metadata
  ) values (
    p_transaction_id,
    v_lane.id,
    p_lane_key,
    v_attorney_role,
    v_lane.current_stage,
    v_step.step_key,
    v_step.status,
    p_status,
    v_actor_id,
    nullif(trim(coalesce(p_note, '')), ''),
    p_visibility,
    'attorney_workspace_step_atomic',
    jsonb_strip_nulls(jsonb_build_object(
      'stepId', v_step.id,
      'stepLabel', v_step.step_label,
      'workPacket', p_work_packet
    ))
  );

  v_event_type := case p_status
    when 'blocked' then 'AttorneyWorkflowStepBlocked'
    when 'waiting' then 'AttorneyWorkflowStepWaiting'
    when 'completed' then 'AttorneyWorkflowStepCompleted'
    else 'AttorneyWorkflowStepUpdated'
  end;

  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by,
    created_by_role,
    visibility_scope
  ) values (
    p_transaction_id,
    v_event_type,
    jsonb_strip_nulls(jsonb_build_object(
      'laneKey', p_lane_key,
      'attorneyRole', v_attorney_role,
      'stepId', v_step.id,
      'stepKey', v_step.step_key,
      'stepLabel', v_step.step_label,
      'status', p_status,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'workPacket', p_work_packet
    )),
    v_actor_id,
    'attorney',
    p_visibility
  );

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'laneId', v_lane.id,
    'laneStatus', v_lane_status,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'stepStatus', p_status,
    'eventType', v_event_type,
    'updatedAt', v_now
  );
end;
$$;

revoke all on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) from public;
grant execute on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) to authenticated;

comment on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) is
  'Atomically updates an attorney workflow step, lane rollup, lane history, and transaction audit event.';

commit;
