begin;

-- Bridge Backfill Pack 1
-- Run only after bridge_migration_pack_1.sql has been applied.
-- Conservative, idempotent backfill only.

-- ---------------------------------------------------------------------------
-- Development participants
-- ---------------------------------------------------------------------------

-- Primary attorney from development attorney config
insert into development_participants (
  development_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  organisation_name,
  is_primary,
  can_view,
  can_create_transactions,
  assignment_source,
  is_active
)
select
  dac.development_id,
  dac.attorney_firm_id,
  'attorney',
  coalesce(dac.primary_contact_name, dac.attorney_firm_name),
  lower(nullif(trim(dac.primary_contact_email), '')),
  dac.attorney_firm_name,
  true,
  true,
  true,
  'development_default',
  coalesce(dac.is_active, true)
from development_attorney_configs dac
where dac.development_id is not null
  and not exists (
    select 1
    from development_participants dp
    where dp.development_id = dac.development_id
      and dp.role_type = 'attorney'
      and coalesce(dp.is_primary, false) = true
  );

-- Fallback attorney from developments.assigned_attorney_id if config absent
insert into development_participants (
  development_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  organisation_name,
  is_primary,
  can_view,
  can_create_transactions,
  assignment_source,
  is_active
)
select
  d.id,
  p.id,
  'attorney',
  coalesce(p.full_name, p.company_name, p.email),
  lower(nullif(trim(p.email), '')),
  p.company_name,
  true,
  true,
  true,
  'development_default',
  true
from developments d
join profiles p
  on p.id = d.assigned_attorney_id
where d.assigned_attorney_id is not null
  and not exists (
    select 1
    from development_participants dp
    where dp.development_id = d.id
      and dp.role_type = 'attorney'
      and coalesce(dp.is_primary, false) = true
  );

-- Primary bond originator from development bond config
insert into development_participants (
  development_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  organisation_name,
  is_primary,
  can_view,
  can_create_transactions,
  assignment_source,
  is_active
)
select
  dbc.development_id,
  dbc.bond_originator_id,
  'bond_originator',
  coalesce(dbc.primary_contact_name, dbc.bond_originator_name),
  lower(nullif(trim(dbc.primary_contact_email), '')),
  dbc.bond_originator_name,
  true,
  true,
  false,
  'development_default',
  coalesce(dbc.is_active, true)
from development_bond_configs dbc
where dbc.development_id is not null
  and not exists (
    select 1
    from development_participants dp
    where dp.development_id = dbc.development_id
      and dp.role_type = 'bond_originator'
      and coalesce(dp.is_primary, false) = true
  );

-- Developers and agents from organisation users where developments are linked to organisations
insert into development_participants (
  development_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  organisation_name,
  is_primary,
  can_view,
  can_create_transactions,
  assignment_source,
  is_active
)
select
  d.id,
  ou.user_id,
  ou.role,
  nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), ''),
  lower(nullif(trim(ou.email), '')),
  o.name,
  false,
  true,
  case when ou.role in ('developer', 'agent') then true else false end,
  'development_default',
  (ou.status = 'active')
from developments d
join organisations o
  on o.id = d.organisation_id
join organisation_users ou
  on ou.organisation_id = d.organisation_id
where ou.role in ('developer', 'agent')
  and not exists (
    select 1
    from development_participants dp
    where dp.development_id = d.id
      and dp.role_type = ou.role
      and coalesce(lower(dp.participant_email), '') = coalesce(lower(ou.email), '')
  );

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

update transactions
set transaction_origin_source = case
  when transaction_origin_source is not null then transaction_origin_source
  when lower(coalesce(matter_owner, '')) like '%attorney%' then 'attorney'
  when lower(coalesce(matter_owner, '')) like '%agent%' then 'agent'
  else 'developer'
end
where transaction_origin_source is null;

update transactions
set transaction_origin_role = case
  when transaction_origin_role is not null then transaction_origin_role
  when transaction_origin_source = 'attorney' then 'attorney'
  when transaction_origin_source = 'agent' then 'agent'
  else 'developer'
end
where transaction_origin_role is null;

update transactions
set main_stage_key = case
  when main_stage_key is not null then main_stage_key
  when current_main_stage = 'AVAIL' then 'AVAIL'
  when current_main_stage = 'DEP' then 'BUYER_SECURED'
  when current_main_stage = 'OTP' then 'AGREEMENT_SIGNED'
  when current_main_stage = 'FIN' then 'FINANCE_SECURED'
  when current_main_stage = 'ATTY' then 'TRANSFER_PREP'
  when current_main_stage = 'XFER' then 'LODGE_TRANSFER'
  when current_main_stage = 'REG' then 'REGISTERED'
  when lower(coalesce(stage, '')) = 'available' then 'AVAIL'
  when lower(coalesce(stage, '')) in ('reserved', 'under offer', 'buyer secured') then 'BUYER_SECURED'
  when lower(coalesce(stage, '')) in ('otp signed', 'agreement signed', 'sale agreement signed') then 'AGREEMENT_SIGNED'
  when lower(coalesce(stage, '')) in ('finance approved', 'finance secured', 'funds verified') then 'FINANCE_SECURED'
  when lower(coalesce(stage, '')) in ('in transfer', 'transfer preparation', 'conveyancing') then 'TRANSFER_PREP'
  when lower(coalesce(stage, '')) in ('lodgement', 'lodged', 'transfer in progress') then 'LODGE_TRANSFER'
  when lower(coalesce(stage, '')) in ('registered', 'registration complete') then 'REGISTERED'
  else null
end
where main_stage_key is null;

update transactions
set completed_at = coalesce(completed_at, updated_at)
where completed_at is null
  and main_stage_key = 'REGISTERED';

update transactions
set primary_transfer_conveyancer_name = coalesce(primary_transfer_conveyancer_name, attorney)
where primary_transfer_conveyancer_name is null
  and nullif(trim(attorney), '') is not null;

update transactions
set primary_transfer_conveyancer_email = coalesce(primary_transfer_conveyancer_email, lower(assigned_attorney_email))
where primary_transfer_conveyancer_email is null
  and nullif(trim(assigned_attorney_email), '') is not null;

-- ---------------------------------------------------------------------------
-- Transaction participants
-- ---------------------------------------------------------------------------

-- Agent
insert into transaction_participants (
  transaction_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  participant_scope,
  is_primary,
  assignment_source,
  organisation_name,
  can_manage_handover,
  can_manage_snags,
  can_approve_documents,
  can_view_financials,
  can_assign_roles
)
select
  t.id,
  p.id,
  'agent',
  nullif(trim(t.assigned_agent), ''),
  lower(nullif(trim(t.assigned_agent_email), '')),
  true,
  true,
  true,
  false,
  false,
  true,
  'transaction',
  true,
  'transaction_direct',
  null,
  false,
  false,
  false,
  true,
  false
from transactions t
left join profiles p
  on lower(coalesce(p.email, '')) = lower(coalesce(t.assigned_agent_email, ''))
where nullif(trim(t.assigned_agent_email), '') is not null
on conflict (transaction_id, role_type) do update
set
  user_id = coalesce(excluded.user_id, transaction_participants.user_id),
  participant_name = coalesce(excluded.participant_name, transaction_participants.participant_name),
  participant_email = coalesce(excluded.participant_email, transaction_participants.participant_email),
  is_primary = excluded.is_primary,
  assignment_source = excluded.assignment_source;

-- Attorney / primary conveyancer
insert into transaction_participants (
  transaction_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  participant_scope,
  is_primary,
  assignment_source,
  organisation_name,
  can_manage_handover,
  can_manage_snags,
  can_approve_documents,
  can_view_financials,
  can_assign_roles
)
select
  t.id,
  p.id,
  'attorney',
  coalesce(nullif(trim(t.primary_transfer_conveyancer_name), ''), nullif(trim(t.attorney), '')),
  lower(coalesce(nullif(trim(t.primary_transfer_conveyancer_email), ''), nullif(trim(t.assigned_attorney_email), ''))),
  true,
  true,
  true,
  false,
  true,
  false,
  'transaction',
  true,
  'development_default',
  null,
  false,
  false,
  true,
  true,
  false
from transactions t
left join profiles p
  on lower(coalesce(p.email, '')) = lower(coalesce(t.primary_transfer_conveyancer_email, t.assigned_attorney_email, ''))
where coalesce(nullif(trim(t.primary_transfer_conveyancer_email), ''), nullif(trim(t.assigned_attorney_email), '')) is not null
on conflict (transaction_id, role_type) do update
set
  user_id = coalesce(excluded.user_id, transaction_participants.user_id),
  participant_name = coalesce(excluded.participant_name, transaction_participants.participant_name),
  participant_email = coalesce(excluded.participant_email, transaction_participants.participant_email),
  is_primary = excluded.is_primary,
  assignment_source = excluded.assignment_source,
  can_edit_attorney_workflow = excluded.can_edit_attorney_workflow,
  can_approve_documents = excluded.can_approve_documents;

-- Bond originator
insert into transaction_participants (
  transaction_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  participant_scope,
  is_primary,
  assignment_source,
  organisation_name,
  can_manage_handover,
  can_manage_snags,
  can_approve_documents,
  can_view_financials,
  can_assign_roles
)
select
  t.id,
  p.id,
  'bond_originator',
  nullif(trim(t.bond_originator), ''),
  lower(nullif(trim(t.assigned_bond_originator_email), '')),
  true,
  true,
  true,
  true,
  false,
  false,
  'transaction',
  true,
  'development_default',
  null,
  false,
  false,
  true,
  true,
  false
from transactions t
left join profiles p
  on lower(coalesce(p.email, '')) = lower(coalesce(t.assigned_bond_originator_email, ''))
where nullif(trim(t.assigned_bond_originator_email), '') is not null
on conflict (transaction_id, role_type) do update
set
  user_id = coalesce(excluded.user_id, transaction_participants.user_id),
  participant_name = coalesce(excluded.participant_name, transaction_participants.participant_name),
  participant_email = coalesce(excluded.participant_email, transaction_participants.participant_email),
  is_primary = excluded.is_primary,
  assignment_source = excluded.assignment_source,
  can_edit_finance_workflow = excluded.can_edit_finance_workflow,
  can_approve_documents = excluded.can_approve_documents;

-- Client
insert into transaction_participants (
  transaction_id,
  user_id,
  role_type,
  participant_name,
  participant_email,
  can_view,
  can_comment,
  can_upload_documents,
  can_edit_finance_workflow,
  can_edit_attorney_workflow,
  can_edit_core_transaction,
  participant_scope,
  is_primary,
  assignment_source,
  organisation_name,
  can_manage_handover,
  can_manage_snags,
  can_approve_documents,
  can_view_financials,
  can_assign_roles
)
 select
  t.id,
  p.id,
  'client',
  coalesce(
    nullif(trim(b.name), ''),
    nullif(trim(b.email), '')
  ),
  lower(nullif(trim(b.email), '')),
  true,
  true,
  true,
  false,
  false,
  false,
  'transaction',
  true,
  'system_inherited',
  null,
  false,
  true,
  false,
  true,
  false
from transactions t
join buyers b
  on b.id = t.buyer_id
left join profiles p
  on lower(coalesce(p.email, '')) = lower(coalesce(b.email, ''))
where t.buyer_id is not null
  and nullif(trim(b.email), '') is not null
on conflict (transaction_id, role_type) do update
set
  user_id = coalesce(excluded.user_id, transaction_participants.user_id),
  participant_name = coalesce(excluded.participant_name, transaction_participants.participant_name),
  participant_email = coalesce(excluded.participant_email, transaction_participants.participant_email),
  is_primary = excluded.is_primary,
  assignment_source = excluded.assignment_source,
  can_manage_snags = excluded.can_manage_snags;

-- Existing rows defaults
update transaction_participants
set participant_scope = coalesce(participant_scope, 'transaction'),
    assignment_source = coalesce(assignment_source, 'transaction_direct'),
    is_primary = coalesce(is_primary, false),
    can_manage_handover = coalesce(can_manage_handover, false),
    can_manage_snags = coalesce(can_manage_snags, false),
    can_approve_documents = coalesce(can_approve_documents, false),
    can_view_financials = coalesce(can_view_financials, false),
    can_assign_roles = coalesce(can_assign_roles, false);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

update documents
set bucket_key = case
  when bucket_key is not null then bucket_key
  when lower(coalesce(category, '')) in ('sale', 'sales', 'reservation', 'otp', 'sales agreement', 'sale agreement', 'agreement') then 'sale'
  when lower(coalesce(category, '')) in ('buyer', 'buyer_fica', 'fica', 'compliance', 'buyer & fica') then 'buyer_fica'
  when lower(coalesce(category, '')) in ('finance', 'bond', 'bond finance') then 'finance'
  when lower(coalesce(category, '')) in ('transfer', 'legal', 'attorney', 'conveyancing') then 'transfer'
  when lower(coalesce(category, '')) in ('handover', 'snags', 'occupation', 'occupational rent', 'property') then 'handover'
  else null
end
where bucket_key is null;

update documents
set visibility_scope = case
  when is_client_visible is true then 'shared'
  else 'internal'
end
where visibility_scope is null
   or visibility_scope = 'internal';

update documents
set owner_role = case
  when owner_role is not null then owner_role
  when lower(coalesce(uploaded_by_role, '')) in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'internal_admin', 'system') then lower(uploaded_by_role)
  else null
end
where owner_role is null;

update documents
set uploaded_by_user_id = p.id
from profiles p
where documents.uploaded_by_user_id is null
  and nullif(trim(documents.uploaded_by_email), '') is not null
  and lower(documents.uploaded_by_email) = lower(p.email);

update documents
set status = case
  when approved_at is not null then 'approved'
  when rejected_at is not null then 'rejected'
  else 'uploaded'
end
where status is null
   or status = 'uploaded';

update documents
set version_group_id = coalesce(version_group_id, id)
where version_group_id is null;

update documents
set version_number = 1
where version_number is null
   or version_number < 1;

-- ---------------------------------------------------------------------------
-- Transaction required documents
-- ---------------------------------------------------------------------------

update transaction_required_documents
set linked_bucket_key = coalesce(linked_bucket_key, group_key)
where linked_bucket_key is null;

update transaction_required_documents
set submitted_at = coalesce(submitted_at, uploaded_at)
where submitted_at is null
  and uploaded_at is not null;

update transaction_required_documents
set reviewed_at = coalesce(reviewed_at, verified_at, rejected_at)
where reviewed_at is null
  and (verified_at is not null or rejected_at is not null);

update transaction_required_documents
set approved_at = coalesce(approved_at, verified_at)
where approved_at is null
  and verified_at is not null;

update transaction_required_documents
set status = case
  when coalesce(is_required, true) = false then 'not_required'
  when uploaded_document_id is null and coalesce(is_uploaded, false) = false then 'missing'
  when rejected_at is not null then 'reupload_required'
  when verified_at is not null then 'accepted'
  when uploaded_document_id is not null or uploaded_at is not null or coalesce(is_uploaded, false) = true then 'under_review'
  else 'missing'
end
where status in ('missing', 'uploaded')
   or status is null;

update transaction_required_documents
set requested_at = coalesce(requested_at, created_at)
where requested_at is null;

update transaction_required_documents
set request_source_role = coalesce(request_source_role, required_from_role)
where request_source_role is null;

-- ---------------------------------------------------------------------------
-- Transaction subprocesses
-- ---------------------------------------------------------------------------

update transaction_subprocesses tsp
set finance_type_context = coalesce(tsp.finance_type_context, t.finance_type),
    visibility_scope = case
      when tsp.process_type in ('finance', 'attorney') then 'internal'
      else coalesce(tsp.visibility_scope, 'internal')
    end,
    started_at = coalesce(
      tsp.started_at,
      case when tsp.status in ('in_progress', 'completed', 'blocked') then tsp.created_at else null end
    ),
    completed_at = coalesce(
      tsp.completed_at,
      case when tsp.status = 'completed' then tsp.updated_at else null end
    ),
    is_required = coalesce(tsp.is_required, true)
from transactions t
where t.id = tsp.transaction_id;

-- ---------------------------------------------------------------------------
-- Transaction subprocess steps
-- ---------------------------------------------------------------------------

update transaction_subprocess_steps tsps
set status_flag_key = coalesce(
      tsps.status_flag_key,
      lower(regexp_replace(coalesce(tsps.step_key, tsps.step_label, ''), '[^a-zA-Z0-9]+', '_', 'g'))
    ),
    visibility_scope = coalesce(tsps.visibility_scope, 'internal'),
    started_at = coalesce(
      tsps.started_at,
      case when tsps.status in ('in_progress', 'completed', 'blocked') then tsps.created_at else null end
    ),
    completed_at = coalesce(
      tsps.completed_at,
      case when tsps.status = 'completed' and tsps.completed_at is null then tsps.updated_at else tsps.completed_at end
    ),
    applies_to_finance_type = coalesce(
      tsps.applies_to_finance_type,
      case
        when lower(coalesce(tsps.step_key, '')) like '%otp%' then 'bond'
        else null
      end
    ),
    is_blocking = coalesce(
      tsps.is_blocking,
      case
        when tsps.status in ('blocked') then true
        else false
      end
    ),
    is_optional = coalesce(tsps.is_optional, false)
from transaction_subprocesses tsp
where tsp.id = tsps.subprocess_id;

-- ---------------------------------------------------------------------------
-- Transaction handover
-- ---------------------------------------------------------------------------

update transaction_handover
set attendance_confirmed_at = coalesce(
      attendance_confirmed_at,
      case when signature_signed_at is not null then signature_signed_at else null end
    ),
    attendance_confirmed_by_name = coalesce(attendance_confirmed_by_name, signature_name)
where attendance_confirmed_at is null
   or attendance_confirmed_by_name is null;

-- ---------------------------------------------------------------------------
-- Client issues / snags
-- ---------------------------------------------------------------------------

update client_issues
set category_key = coalesce(
      category_key,
      lower(regexp_replace(coalesce(category, 'general'), '[^a-zA-Z0-9]+', '_', 'g'))
    )
where category_key is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'client_issues'
      and column_name = 'signed_off_at'
  ) then
    execute $sql$
      update client_issues
      set completed_at = coalesce(completed_at, signed_off_at)
      where completed_at is null
        and signed_off_at is not null
        and lower(coalesce(status, '')) = 'completed'
    $sql$;

    execute $sql$
      update client_issues
      set client_confirmed_at = coalesce(client_confirmed_at, signed_off_at)
      where client_confirmed_at is null
        and signed_off_at is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'client_issues'
      and column_name = 'signed_off_by'
  ) then
    execute $sql$
      update client_issues
      set client_feedback = coalesce(client_feedback, signed_off_by)
      where client_feedback is null
        and nullif(trim(signed_off_by), '') is not null
    $sql$;
  end if;
end $$;

update client_issues
set addressed_at = coalesce(addressed_at, updated_at)
where addressed_at is null
  and lower(coalesce(status, '')) = 'addressed';

update client_issues
set completed_at = coalesce(completed_at, updated_at)
where completed_at is null
  and lower(coalesce(status, '')) = 'completed';

-- ---------------------------------------------------------------------------
-- Transaction occupational rent
-- ---------------------------------------------------------------------------

insert into transaction_occupational_rent (
  transaction_id,
  is_enabled,
  status,
  occupation_date,
  rent_start_date,
  monthly_amount,
  pro_rata_amount,
  next_due_date,
  waived,
  waiver_reason,
  notes,
  created_at,
  updated_at
)
select
  te.transaction_id,
  coalesce((te.event_data ->> 'enabled')::boolean, true),
  coalesce(
    nullif(te.event_data ->> 'status', ''),
    'active'
  ),
  nullif(te.event_data ->> 'occupationDate', '')::date,
  nullif(te.event_data ->> 'rentStartDate', '')::date,
  nullif(te.event_data ->> 'monthlyAmount', '')::numeric(12,2),
  nullif(te.event_data ->> 'proRataAmount', '')::numeric(12,2),
  nullif(te.event_data ->> 'nextDueDate', '')::date,
  coalesce((te.event_data ->> 'waived')::boolean, false),
  nullif(te.event_data ->> 'waiverReason', ''),
  nullif(te.event_data ->> 'notes', ''),
  te.created_at,
  te.updated_at
from (
  select distinct on (transaction_id)
    transaction_id,
    event_data,
    created_at,
    updated_at
  from transaction_events
  where transaction_id is not null
    and (
      lower(coalesce(event_type, '')) like '%occup%'
      or lower(coalesce(event_data::text, '')) like '%occupation%'
      or lower(coalesce(event_data::text, '')) like '%occupational%'
    )
  order by transaction_id, created_at desc
) te
where not exists (
  select 1
  from transaction_occupational_rent tor
  where tor.transaction_id = te.transaction_id
);

-- ---------------------------------------------------------------------------
-- Readiness states
-- ---------------------------------------------------------------------------

update transaction_readiness_states trs
set onboarding_complete = case
      when lower(coalesce(trs.onboarding_status, '')) in ('approved', 'reviewed', 'submitted') then true
      else coalesce(trs.onboarding_complete, false)
    end,
    stage_ready = case
      when trs.finance_lane_ready = true and trs.attorney_lane_ready = true then true
      else trs.stage_ready
    end
where true;

commit;
