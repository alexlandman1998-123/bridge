begin;

-- Reading saved answers follows matter visibility, not the ability to mutate
-- the lane. A principal or allocated team member must be able to reload them.
drop policy if exists attorney_task_confirmations_read on public.attorney_task_confirmations;
create policy attorney_task_confirmations_read on public.attorney_task_confirmations
for select to authenticated using (
  exists (
    select 1
    from public.transaction_subprocesses lane
    join public.transaction_attorney_assignments assignment
      on assignment.transaction_id = lane.transaction_id
     and (
       (lane.process_type in ('transfer', 'attorney') and (assignment.attorney_role = 'transfer_attorney'
         or assignment.assignment_type in ('transfer', 'transfer_and_bond')
         or assignment.matter_type in ('transfer', 'transfer_and_bond')))
       or (lane.process_type = 'bond' and (assignment.attorney_role = 'bond_attorney'
         or assignment.assignment_type in ('bond', 'transfer_and_bond')
         or assignment.matter_type in ('bond', 'transfer_and_bond')))
       or (lane.process_type = 'cancellation' and (assignment.attorney_role = 'cancellation_attorney'
         or assignment.assignment_type in ('cancellation', 'bond_cancellation')
         or assignment.matter_type in ('cancellation', 'bond_cancellation')))
     )
    join public.attorney_firm_members member
      on member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
     and member.user_id = (select auth.uid()) and member.status = 'active'
    where lane.id = attorney_task_confirmations.subprocess_id
      and coalesce(assignment.assignment_status, assignment.status) in ('pending', 'active', 'paused')
      and public.bridge_attorney_matter_team_access(
        lane.transaction_id, coalesce(assignment.attorney_firm_id, assignment.firm_id), 'view')
  )
);
grant select on public.attorney_task_confirmations to authenticated;

-- The existing canonical review RPC accepted an actor role supplied by the
-- browser and treated any member of the assigned firm as a reviewer. Retain
-- its lifecycle writes, but put an authenticated attorney-team check in front
-- of it. The preserved function is not directly callable over the Data API.
alter function public.bridge_review_canonical_requirement(uuid,uuid,text,text,text,uuid)
  rename to bridge_review_canonical_requirement_pre_attorney_scope;
revoke all on function public.bridge_review_canonical_requirement_pre_attorney_scope(uuid,uuid,text,text,text,uuid)
  from public, anon, authenticated, service_role;

create function public.bridge_review_canonical_requirement(
  p_requirement_instance_id uuid,
  p_document_id uuid default null,
  p_action text default 'approve',
  p_reason text default null,
  p_actor_role text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile_role text;
  v_claimed_role text := lower(trim(coalesce(p_actor_role, '')));
  v_effective_role text;
  v_transaction_id uuid;
  v_reviewer_role text;
  v_lane_role text;
  v_can_review boolean;
begin
  if v_actor is null then
    raise exception 'Authentication is required to review a document.' using errcode = '42501';
  end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then
    raise exception 'Actor user does not match the authenticated user.' using errcode = '42501';
  end if;

  select lower(trim(coalesce(profile.role, ''))) into v_profile_role
  from public.profiles profile where profile.id = v_actor;
  if coalesce(v_profile_role, '') = '' then
    raise exception 'An active account profile is required for document review.' using errcode = '42501';
  end if;
  -- p_actor_role is a browser parameter, not an authority claim. Attorneys may
  -- select a lane only after its database capability check below; every other
  -- account uses its database profile role.
  v_effective_role := case
    when v_profile_role in ('attorney', 'conveyancer') and v_claimed_role in ('bond_attorney', 'cancellation_attorney')
      then v_claimed_role
    when v_profile_role in ('attorney', 'conveyancer') then 'transferring_attorney'
    when v_profile_role = 'client' then 'buyer'
    else v_profile_role
  end;

  if v_profile_role in ('attorney', 'conveyancer')
    or v_claimed_role in ('attorney', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney') then
    if v_profile_role not in ('attorney', 'conveyancer') then
      raise exception 'Attorney document review requires an attorney account.' using errcode = '42501';
    end if;
    select requirement.transaction_id, lower(trim(coalesce(requirement.reviewer_role, '')))
      into v_transaction_id, v_reviewer_role
    from public.document_requirement_instances requirement
    where requirement.id = p_requirement_instance_id;
    if v_transaction_id is null then
      raise exception 'Attorney document review requires a linked matter.' using errcode = '42501';
    end if;

    v_lane_role := case
      when v_reviewer_role = 'bond_attorney' then 'bond_attorney'
      when v_reviewer_role = 'cancellation_attorney' then 'cancellation_attorney'
      when v_reviewer_role = 'transferring_attorney' then 'transfer_attorney'
      when v_claimed_role = 'bond_attorney' then 'bond_attorney'
      when v_claimed_role = 'cancellation_attorney' then 'cancellation_attorney'
      else 'transfer_attorney'
    end;
    v_can_review := public.bridge_can_mutate_attorney_lane(v_transaction_id, v_lane_role, 'documents');
    if not coalesce(v_can_review, false) or not exists (
      select 1 from public.transaction_attorney_assignments assignment
      join public.attorney_firm_members member
        on member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
       and member.user_id = v_actor and member.status = 'active'
      where assignment.transaction_id = v_transaction_id
        and coalesce(assignment.assignment_status, assignment.status) = 'active'
        and coalesce(assignment.can_manage_documents, true)
        and coalesce(member.professional_role, member.role) in (
          'firm_admin', 'director_partner', 'attorney_conveyancer',
          'transfer_attorney', 'bond_attorney', 'cancellation_attorney',
          'conveyancing_secretary', 'admin_staff'
        )
    ) then
      raise exception 'You do not have permission to review this matter document.' using errcode = '42501';
    end if;
    if lower(trim(coalesce(p_action, 'approve'))) = 'waive'
      and not exists (
        select 1 from public.transaction_attorney_assignments assignment
        join public.attorney_firm_members member
          on member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
         and member.user_id = v_actor and member.status = 'active'
        where assignment.transaction_id = v_transaction_id
          and coalesce(member.professional_role, member.role) in (
            'firm_admin', 'director_partner', 'attorney_conveyancer',
            'transfer_attorney', 'bond_attorney', 'cancellation_attorney'
          )
      ) then
      raise exception 'Only a principal or conveyancer may waive this document.' using errcode = '42501';
    end if;
  end if;

  return public.bridge_review_canonical_requirement_pre_attorney_scope(
    p_requirement_instance_id, p_document_id, p_action, p_reason, v_effective_role, v_actor);
end;
$$;
revoke all on function public.bridge_review_canonical_requirement(uuid,uuid,text,text,text,uuid)
  from public, anon;
grant execute on function public.bridge_review_canonical_requirement(uuid,uuid,text,text,text,uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
