-- Originator intake is the canonical allocation. Keep the transaction spine used
-- by finance/document access in the same transaction as that allocation.
create or replace function journey_private.project_originator_intake_assignment()
returns trigger language plpgsql security definer set search_path='' as $function$
declare t public.transactions%rowtype; active_assignment boolean;
begin
  if new.application_type is distinct from 'originator_intake' then return new; end if;
  select * into t from public.transactions where id=new.transaction_id for update;
  if not found or coalesce(t.finance_type,'') not in ('bond','hybrid','combination') then return new;end if;
  active_assignment:=coalesce(new.assignment_status,'') not in ('inactive','unassigned','cancelled','removed','revoked');
  if active_assignment and exists(select 1 from public.transaction_bond_applications a
    where a.transaction_id=new.transaction_id and a.id<>new.id and a.application_type='originator_intake'
      and coalesce(a.assignment_status,'') not in ('inactive','unassigned','cancelled','removed','revoked')) then
    raise exception 'A transaction may only have one active originator intake assignment.' using errcode='23505';
  end if;
  if active_assignment and new.assigned_user_id is not null and not exists(
    select 1 from public.organisation_users u where u.user_id=new.assigned_user_id
      and u.organisation_id=new.assigned_organisation_id and coalesce(u.status,'active') in ('active','accepted')
  ) then raise exception 'The assigned consultant must be an active member of the assigned organisation.' using errcode='23514';end if;
  update public.transactions set
    bond_workspace_id=case when active_assignment then new.assigned_organisation_id else null end,
    bond_region_id=case when active_assignment then new.assigned_region_id else null end,
    bond_workspace_unit_id=case when active_assignment then coalesce(new.assigned_team_id,new.assigned_branch_id,new.assigned_workspace_unit_id) else null end,
    primary_bond_consultant_user_id=case when active_assignment then new.assigned_user_id else null end,
    assigned_bond_processor_user_id=case when active_assignment and t.bond_workspace_id is not distinct from new.assigned_organisation_id then t.assigned_bond_processor_user_id else null end,
    assigned_bond_manager_user_id=case when active_assignment and t.bond_workspace_id is not distinct from new.assigned_organisation_id then t.assigned_bond_manager_user_id else null end,
    assigned_bond_compliance_user_id=case when active_assignment and t.bond_workspace_id is not distinct from new.assigned_organisation_id then t.assigned_bond_compliance_user_id else null end,
    bond_assignment_status=case when not active_assignment then 'unassigned' when new.assigned_user_id is null then 'workspace_assigned' else 'consultant_assigned' end,
    bond_assignment_source='participant_sync'
  where id=new.transaction_id;
  return new;
end $function$;
revoke all on function journey_private.project_originator_intake_assignment() from public,anon,authenticated;
create trigger transaction_originator_intake_assignment_projection
  after insert or update of assigned_organisation_id,assigned_region_id,assigned_workspace_unit_id,assigned_branch_id,assigned_team_id,assigned_user_id,assignment_status
  on public.transaction_bond_applications for each row execute function journey_private.project_originator_intake_assignment();
