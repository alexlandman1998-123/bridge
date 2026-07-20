begin;

do $$
declare
  candidate_count integer;
  distinct_transaction_count integer;
  replacement_eligible boolean;
begin
  select count(*)::integer, count(distinct transaction_id)::integer
  into candidate_count, distinct_transaction_count
  from public.transaction_attorney_assignments
  where attorney_firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
    and firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
    and attorney_user_id = '97800fc2-b2bb-4e02-a79a-e8ef53495d32'::uuid
    and primary_attorney_id = '97800fc2-b2bb-4e02-a79a-e8ef53495d32'::uuid
    and attorney_role = 'transfer_attorney'
    and assignment_status = 'active'
    and is_primary = true;

  if candidate_count <> 43 or distinct_transaction_count <> 43 then
    raise exception 'Phase 24 remediation expected 43 reviewed assignments across 43 transactions; found % across %.',
      candidate_count, distinct_transaction_count;
  end if;

  select exists (
    select 1
    from public.attorney_firm_members
    where firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
      and user_id = '85a49e81-92a9-43bc-906d-d9ad93f4c12c'::uuid
      and status = 'active'
      and professional_role = 'firm_admin'
  ) into replacement_eligible;

  if not replacement_eligible then
    raise exception 'The reviewed Phase 24 replacement is not an active canonical firm administrator.';
  end if;
end;
$$;

with reviewed_assignments as (
  select id, transaction_id, attorney_role, attorney_firm_id
  from public.transaction_attorney_assignments
  where attorney_firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
    and firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
    and attorney_user_id = '97800fc2-b2bb-4e02-a79a-e8ef53495d32'::uuid
    and primary_attorney_id = '97800fc2-b2bb-4e02-a79a-e8ef53495d32'::uuid
    and attorney_role = 'transfer_attorney'
    and assignment_status = 'active'
    and is_primary = true
  for update
), updated_assignments as (
  update public.transaction_attorney_assignments assignment
  set attorney_user_id = '85a49e81-92a9-43bc-906d-d9ad93f4c12c'::uuid,
      primary_attorney_id = '85a49e81-92a9-43bc-906d-d9ad93f4c12c'::uuid,
      updated_at = now()
  from reviewed_assignments reviewed
  where assignment.id = reviewed.id
  returning assignment.id, assignment.transaction_id, assignment.attorney_role, assignment.attorney_firm_id
)
insert into public.transaction_events (
  transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
)
select
  assignment.transaction_id,
  'attorney_primary_replaced',
  jsonb_build_object(
    'message', 'Transfer attorney reassigned during Phase 24 production identity/access promotion.',
    'visibility', 'internal',
    'attorneyRole', assignment.attorney_role,
    'attorneyRoleLabel', 'Transfer Attorney',
    'assignmentId', assignment.id,
    'firmId', assignment.attorney_firm_id,
    'attorneyUserId', '85a49e81-92a9-43bc-906d-d9ad93f4c12c'::uuid,
    'isPrimary', true,
    'assignmentKind', 'primary',
    'previousAssignmentId', assignment.id,
    'previousAttorneyUserId', '97800fc2-b2bb-4e02-a79a-e8ef53495d32'::uuid,
    'remediationPhase', 'phase24',
    'remediationReason', 'cross_firm_attorney_assignment_integrity',
    'remediationRunId', '4ae12168-79f3-4f83-b5a8-18a424ceb59c'::uuid
  ),
  '85a49e81-92a9-43bc-906d-d9ad93f4c12c'::uuid,
  'attorney',
  'internal'
from updated_assignments assignment;

do $$
declare
  remaining_count integer;
  replacement_count integer;
  audit_count integer;
  blocking_count integer;
begin
  select count(*)::integer into remaining_count
  from public.transaction_attorney_assignments
  where attorney_user_id = '97800fc2-b2bb-4e02-a79a-e8ef53495d32'::uuid
    and attorney_firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
    and assignment_status = 'active';

  select count(*)::integer into replacement_count
  from public.transaction_attorney_assignments
  where attorney_user_id = '85a49e81-92a9-43bc-906d-d9ad93f4c12c'::uuid
    and attorney_firm_id = '1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid
    and assignment_status = 'active';

  select count(*)::integer into audit_count
  from public.transaction_events
  where event_data ->> 'remediationRunId' = '4ae12168-79f3-4f83-b5a8-18a424ceb59c';

  select count(*)::integer into blocking_count
  from public.attorney_role_integrity_v1
  where integrity_status <> 'healthy';

  if remaining_count <> 0 or replacement_count <> 43 or audit_count <> 43 or blocking_count <> 0 then
    raise exception 'Phase 24 remediation postcondition failed: remaining %, replacement %, audit %, blockers %.',
      remaining_count, replacement_count, audit_count, blocking_count;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '85a49e81-92a9-43bc-906d-d9ad93f4c12c', true);
select (public.certify_attorney_role_release_phase9('1694cca1-2081-4c58-be8b-88a1e927c0ba'::uuid)).id;

commit;
