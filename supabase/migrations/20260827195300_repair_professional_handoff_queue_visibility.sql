begin;

drop policy if exists transaction_attorney_assignments_select_transaction_spine_scope on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_select_transaction_spine_scope
  on public.transaction_attorney_assignments
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or exists (
      select 1
      from public.attorney_firm_members m
      where m.firm_id = coalesce(
        transaction_attorney_assignments.attorney_firm_id,
        transaction_attorney_assignments.firm_id,
        transaction_attorney_assignments.assigned_organisation_id
      )
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') in ('active', 'accepted')
    )
  );

drop policy if exists transaction_attorney_assignments_insert_transaction_spine_scope on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_insert_transaction_spine_scope
  on public.transaction_attorney_assignments
  for insert
  to authenticated
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or exists (
      select 1
      from public.attorney_firm_members m
      where m.firm_id = coalesce(
        transaction_attorney_assignments.attorney_firm_id,
        transaction_attorney_assignments.firm_id,
        transaction_attorney_assignments.assigned_organisation_id
      )
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') in ('active', 'accepted')
        and coalesce(m.role, m.professional_role) in ('firm_admin', 'director_partner', 'owner', 'admin')
    )
  );

drop policy if exists transaction_attorney_assignments_update_transaction_spine_scope on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_update_transaction_spine_scope
  on public.transaction_attorney_assignments
  for update
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    or exists (
      select 1
      from public.attorney_firm_members m
      where m.firm_id = coalesce(
        transaction_attorney_assignments.attorney_firm_id,
        transaction_attorney_assignments.firm_id,
        transaction_attorney_assignments.assigned_organisation_id
      )
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') in ('active', 'accepted')
    )
  )
  with check (
    public.bridge_can_access_transaction_spine(transaction_id)
    or exists (
      select 1
      from public.attorney_firm_members m
      where m.firm_id = coalesce(
        transaction_attorney_assignments.attorney_firm_id,
        transaction_attorney_assignments.firm_id,
        transaction_attorney_assignments.assigned_organisation_id
      )
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') in ('active', 'accepted')
    )
  );

update public.transaction_participants
set
  partner_organisation_id = assigned_organisation_id,
  updated_at = now()
where assigned_organisation_id is not null
  and partner_organisation_id is null
  and exists (
    select 1
    from public.organisations o
    where o.id = transaction_participants.assigned_organisation_id
  );

update public.transaction_bond_applications
set
  originator_organisation_id = coalesce(originator_organisation_id, assigned_organisation_id),
  updated_at = now()
where application_type = 'originator_intake'
  and assigned_organisation_id is not null
  and originator_organisation_id is null;

update public.transactions t
set
  bond_workspace_id = coalesce(t.bond_workspace_id, tba.assigned_organisation_id),
  bond_assignment_status = coalesce(t.bond_assignment_status, 'workspace_assigned'),
  bond_assignment_source = coalesce(t.bond_assignment_source, 'participant_sync'),
  finance_managed_by = coalesce(t.finance_managed_by, 'bond_originator'),
  finance_status = coalesce(t.finance_status, 'Bond originator assigned'),
  updated_at = now()
from public.transaction_bond_applications tba
where tba.transaction_id = t.id
  and tba.application_type = 'originator_intake'
  and tba.assigned_organisation_id is not null
  and t.bond_workspace_id is null;

update public.transaction_finance_workflows tfw
set
  finance_owner = coalesce(tfw.finance_owner, 'bond_originator'),
  next_action = coalesce(tfw.next_action, 'Bond originator intake created from roleplayer handoff.'),
  updated_at = now(),
  last_updated_at = now()
from public.transaction_bond_applications tba
where tba.workflow_id = tfw.id
  and tba.application_type = 'originator_intake'
  and tba.assigned_organisation_id is not null
  and tfw.finance_owner is null;

insert into public.transaction_attorney_assignments (
  transaction_id,
  firm_id,
  attorney_firm_id,
  assignment_type,
  attorney_role,
  matter_type,
  instruction_status,
  assigned_organisation_id,
  scope_level,
  scope_metadata,
  appointment_source,
  firm_acceptance_status,
  staff_assignment_status,
  allocation_state,
  status,
  assignment_status,
  is_primary,
  visibility_scope,
  can_edit,
  can_manage_documents,
  can_manage_signing,
  can_add_internal_notes,
  can_add_shared_updates,
  can_update_workflow_lane,
  assigned_at,
  created_at,
  updated_at
)
select
  tp.transaction_id,
  coalesce(af.id, tp.assigned_organisation_id),
  coalesce(af.id, tp.assigned_organisation_id),
  coalesce(nullif(tp.legal_role, ''), 'transfer'),
  coalesce(nullif(tp.transaction_role, ''), 'transfer_attorney'),
  coalesce(nullif(tp.legal_role, ''), 'transfer'),
  'awaiting_documents',
  tp.assigned_organisation_id,
  'organisation',
  jsonb_build_object(
    'source', 'roleplayer_participant_backfill',
    'participantId', tp.id,
    'canonicalRoleType', coalesce(nullif(tp.transaction_role, ''), 'transfer_attorney')
  ),
  'transaction_roleplayer_backfill',
  'awaiting_firm_acceptance',
  'awaiting_staff_assignment',
  'awaiting_firm_acceptance',
  'pending',
  'pending',
  true,
  'firm_matter',
  true,
  true,
  true,
  true,
  true,
  true,
  now(),
  now(),
  now()
from public.transaction_participants tp
left join public.attorney_firms af
  on af.id = tp.assigned_organisation_id
  or af.organisation_id = tp.assigned_organisation_id
where tp.role_type = 'attorney'
  and tp.assigned_organisation_id is not null
  and coalesce(af.id, tp.assigned_organisation_id) is not null
  and coalesce(tp.status, 'active') in ('active', 'invited', 'pending')
  and not exists (
    select 1
    from public.transaction_attorney_assignments taa
    where taa.transaction_id = tp.transaction_id
      and coalesce(taa.attorney_role, taa.assignment_type, taa.matter_type) = coalesce(nullif(tp.transaction_role, ''), 'transfer_attorney')
      and coalesce(taa.assignment_status, taa.status, 'active') not in ('removed', 'declined')
  );

grant execute on function public.bridge_transaction_scope_is_internal_user() to authenticated;
grant execute on function public.bridge_can_access_bond_application_scope(uuid) to authenticated;
grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
