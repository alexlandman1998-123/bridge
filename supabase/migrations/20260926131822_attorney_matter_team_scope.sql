begin;

-- Firm allocation is distinct from the responsible attorney appointment.
-- Removing a team member is soft so the actor and history remain auditable.
create table public.attorney_matter_team_members (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  firm_id uuid not null references public.attorney_firms(id),
  user_id uuid not null references auth.users(id),
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now(),
  removed_by uuid references auth.users(id),
  removed_at timestamptz,
  unique (transaction_id, firm_id, user_id)
);
create index attorney_matter_team_members_user_active_idx
  on public.attorney_matter_team_members (user_id, firm_id, transaction_id)
  where removed_at is null;
create index attorney_matter_team_members_matter_active_idx
  on public.attorney_matter_team_members (transaction_id, firm_id)
  where removed_at is null;
alter table public.attorney_matter_team_members enable row level security;
revoke all on public.attorney_matter_team_members from public, anon, authenticated;

-- Keep existing individually allocated matters private when the new team
-- feature is enabled. Unallocated matters remain visible to the active firm.
insert into public.attorney_matter_team_members (transaction_id, firm_id, user_id, added_by)
select distinct a.transaction_id, coalesce(a.attorney_firm_id, a.firm_id), person.user_id, a.assigned_by
from public.transaction_attorney_assignments a
cross join lateral (values
  (a.assigned_user_id), (a.attorney_user_id), (a.primary_attorney_id),
  (a.secretary_id), (a.admin_handler_id)
) person(user_id)
join public.attorney_firm_members member
  on member.firm_id = coalesce(a.attorney_firm_id, a.firm_id)
 and member.user_id = person.user_id and member.status = 'active'
where coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
  and person.user_id is not null
on conflict (transaction_id, firm_id, user_id) do nothing;

create or replace function public.bridge_attorney_matter_team_access(
  p_transaction_id uuid,
  p_firm_id uuid,
  p_capability text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_principal boolean;
  v_worker boolean;
  v_assignment_active boolean;
begin
  if v_actor is null or p_transaction_id is null or p_firm_id is null
    or p_capability not in ('view', 'workflow', 'manage') then return false; end if;
  select
    coalesce(member.professional_role in ('firm_admin', 'director_partner')
      or member.role in ('firm_admin', 'director_partner'), false),
    coalesce(member.professional_role in (
      'firm_admin', 'director_partner', 'attorney_conveyancer',
      'conveyancing_secretary', 'candidate_attorney', 'admin_staff'
    ) or member.role in (
      'firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney',
      'cancellation_attorney', 'conveyancing_secretary', 'candidate_attorney', 'admin_staff'
    ), false)
  into v_principal, v_worker
  from public.attorney_firm_members member
  where member.firm_id = p_firm_id and member.user_id = v_actor
    and member.status = 'active'
  limit 1;
  if not found then return false; end if;
  if not exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id = p_transaction_id
      and coalesce(a.attorney_firm_id, a.firm_id) = p_firm_id
      and coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
      and coalesce(a.status, 'active') <> 'removed'
  ) then return false; end if;
  if p_capability = 'manage' then return v_principal; end if;
  if p_capability = 'workflow' then
    if not v_worker then return false; end if;
    select exists (
      select 1 from public.transaction_attorney_assignments a
      where a.transaction_id = p_transaction_id
        and coalesce(a.attorney_firm_id, a.firm_id) = p_firm_id
        and coalesce(a.assignment_status, a.status) = 'active'
        and coalesce(a.can_update_workflow_lane, true)
    ) into v_assignment_active;
    if not v_assignment_active then return false; end if;
  end if;
  if v_principal then return true; end if;
  if not exists (
    select 1 from public.attorney_matter_team_members team
    where team.transaction_id = p_transaction_id and team.firm_id = p_firm_id
      and team.removed_at is null
  ) then return true; end if;
  return exists (
    select 1 from public.attorney_matter_team_members team
    where team.transaction_id = p_transaction_id and team.firm_id = p_firm_id
      and team.user_id = v_actor and team.removed_at is null
  );
end;
$$;
revoke all on function public.bridge_attorney_matter_team_access(uuid,uuid,text) from public, anon;
grant execute on function public.bridge_attorney_matter_team_access(uuid,uuid,text) to authenticated;

create or replace function public.bridge_get_attorney_matter_team(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_firm_id uuid;
  v_members jsonb;
  v_available jsonb;
  v_status text;
begin
  select coalesce(a.attorney_firm_id, a.firm_id), coalesce(a.assignment_status, a.status)
  into v_firm_id, v_status
  from public.transaction_attorney_assignments a
  join public.attorney_firm_members viewer
    on viewer.firm_id = coalesce(a.attorney_firm_id, a.firm_id)
   and viewer.user_id = auth.uid() and viewer.status = 'active'
  where a.transaction_id = p_transaction_id
    and coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
  order by case when a.attorney_role = 'transfer_attorney' then 0 else 1 end,
    a.is_primary desc nulls last, a.created_at desc
  limit 1;
  if v_firm_id is null or not public.bridge_attorney_matter_team_access(p_transaction_id, v_firm_id, 'view') then
    raise exception 'Matter team is not available to this account.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', member.user_id,
    'name', coalesce(nullif(trim(profile.full_name), ''), nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), profile.email, 'Team member'),
    'email', coalesce(profile.email, ''),
    'avatarUrl', profile.avatar_url,
    'role', coalesce(member.professional_role, member.role),
    'assigned', team.user_id is not null
  ) order by coalesce(profile.full_name, profile.email)), '[]'::jsonb)
  into v_available
  from public.attorney_firm_members member
  left join public.profiles profile on profile.id = member.user_id
  left join public.attorney_matter_team_members team
    on team.transaction_id = p_transaction_id and team.firm_id = v_firm_id
   and team.user_id = member.user_id and team.removed_at is null
  where member.firm_id = v_firm_id and member.status = 'active';
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_members
  from jsonb_array_elements(v_available) item where (item ->> 'assigned')::boolean;
  return jsonb_build_object(
    'firmId', v_firm_id, 'assignmentStatus', v_status,
    'canManage', public.bridge_attorney_matter_team_access(p_transaction_id, v_firm_id, 'manage'),
    'canUpdateWorkflow', public.bridge_attorney_matter_team_access(p_transaction_id, v_firm_id, 'workflow'),
    'members', v_members, 'availableMembers', v_available
  );
end;
$$;
revoke all on function public.bridge_get_attorney_matter_team(uuid) from public, anon;
grant execute on function public.bridge_get_attorney_matter_team(uuid) to authenticated;

create or replace function public.bridge_set_attorney_matter_team(p_transaction_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_firm_id uuid;
  v_ids uuid[] := coalesce(p_user_ids, array[]::uuid[]);
begin
  select coalesce(a.attorney_firm_id, a.firm_id) into v_firm_id
  from public.transaction_attorney_assignments a
  join public.attorney_firm_members manager
    on manager.firm_id = coalesce(a.attorney_firm_id, a.firm_id)
   and manager.user_id = auth.uid() and manager.status = 'active'
   and (manager.professional_role in ('firm_admin', 'director_partner')
     or manager.role in ('firm_admin', 'director_partner'))
  where a.transaction_id = p_transaction_id
    and coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
  order by case when a.attorney_role = 'transfer_attorney' then 0 else 1 end,
    a.is_primary desc nulls last, a.created_at desc
  limit 1 for update of a;
  if v_firm_id is null then
    raise exception 'Only a principal of the assigned firm may allocate this matter.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(v_ids) requested(user_id)
    where not exists (
      select 1 from public.attorney_firm_members member
      where member.firm_id = v_firm_id and member.user_id = requested.user_id
        and member.status = 'active'
    )
  ) then raise exception 'Every team member must be active in the assigned firm.' using errcode = '22023'; end if;
  update public.attorney_matter_team_members team
  set removed_at = now(), removed_by = auth.uid()
  where team.transaction_id = p_transaction_id and team.firm_id = v_firm_id
    and team.removed_at is null and not (team.user_id = any(v_ids));
  insert into public.attorney_matter_team_members
    (transaction_id, firm_id, user_id, added_by)
  select distinct p_transaction_id, v_firm_id, requested.user_id, auth.uid()
  from unnest(v_ids) requested(user_id)
  on conflict (transaction_id, firm_id, user_id) do update
    set removed_at = null, removed_by = null, added_by = excluded.added_by, added_at = now();
  return public.bridge_get_attorney_matter_team(p_transaction_id);
end;
$$;
revoke all on function public.bridge_set_attorney_matter_team(uuid,uuid[]) from public, anon;
grant execute on function public.bridge_set_attorney_matter_team(uuid,uuid[]) to authenticated;

-- The lane command remains gated by accepted instruction and the lane's own
-- capability flags. Team membership replaces the single-person workflow gate.
create or replace function public.bridge_can_mutate_attorney_lane(
  p_transaction_id uuid,
  p_attorney_role text,
  p_capability text default 'workflow'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_attorney_role, '')));
  v_capability text := lower(trim(coalesce(p_capability, 'workflow')));
begin
  if p_transaction_id is null or v_actor is null
    or v_role not in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    or v_capability not in ('workflow', 'documents', 'internal_notes', 'shared_updates')
  then return false; end if;

  if exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id = p_transaction_id
      and coalesce(a.assignment_status, a.status) = 'active'
      and case v_role
        when 'transfer_attorney' then a.attorney_role = 'transfer_attorney'
          or a.assignment_type in ('transfer', 'transfer_and_bond')
          or a.matter_type in ('transfer', 'transfer_and_bond')
        when 'bond_attorney' then a.attorney_role = 'bond_attorney'
          or a.assignment_type in ('bond', 'transfer_and_bond')
          or a.matter_type in ('bond', 'transfer_and_bond')
        else a.attorney_role = 'cancellation_attorney'
          or a.assignment_type in ('cancellation', 'bond_cancellation')
          or a.matter_type in ('cancellation', 'bond_cancellation') end
      and case v_capability
        when 'workflow' then coalesce(a.can_update_workflow_lane, true)
        when 'documents' then coalesce(a.can_manage_documents, true)
        when 'internal_notes' then coalesce(a.can_add_internal_notes, true)
        else coalesce(a.can_add_shared_updates, true) end
      and public.bridge_attorney_matter_team_access(p_transaction_id,
        coalesce(a.attorney_firm_id, a.firm_id), 'workflow')
  ) then return true; end if;

  -- Preserve explicit cross-lane delegation, subject to the owner firm's
  -- accepted appointment and team visibility.
  return exists (
    select 1 from public.attorney_lane_delegations d
    join public.transaction_attorney_assignments owner_assignment
      on owner_assignment.transaction_id = d.transaction_id
     and owner_assignment.attorney_role = d.attorney_role
     and coalesce(owner_assignment.attorney_firm_id, owner_assignment.firm_id) = d.responsible_firm_id
    where d.transaction_id = p_transaction_id and d.attorney_role = v_role
      and d.delegate_user_id = v_actor and d.status = 'active'
      and d.starts_at <= now() and d.expires_at > now()
      and v_capability = any(d.capabilities)
      and coalesce(owner_assignment.assignment_status, owner_assignment.status) = 'active'
      and case v_capability
        when 'workflow' then coalesce(owner_assignment.can_update_workflow_lane, true)
        when 'documents' then coalesce(owner_assignment.can_manage_documents, true)
        when 'internal_notes' then coalesce(owner_assignment.can_add_internal_notes, true)
        else coalesce(owner_assignment.can_add_shared_updates, true) end
  );
end;
$$;
revoke all on function public.bridge_can_mutate_attorney_lane(uuid,text,text) from public, anon;
grant execute on function public.bridge_can_mutate_attorney_lane(uuid,text,text) to authenticated;

-- Production and staging intentionally have different transaction-spine
-- readers. Preserve each environment's existing non-attorney rules verbatim,
-- then put the firm-team boundary in front of the original function OID so
-- existing RLS dependencies cannot bypass it.
do $preserve_access$
declare
  v_definition text;
  v_copy text;
begin
  v_definition := pg_get_functiondef('public.bridge_can_access_transaction_spine(uuid)'::regprocedure);
  v_copy := replace(v_definition,
    'FUNCTION public.bridge_can_access_transaction_spine(',
    'FUNCTION public.bridge_can_access_transaction_spine_pre_team(');
  if v_copy = v_definition then
    raise exception 'Could not preserve the existing transaction access function';
  end if;
  execute v_copy;
end;
$preserve_access$;
revoke all on function public.bridge_can_access_transaction_spine_pre_team(uuid)
  from public, anon, authenticated;

create or replace function public.bridge_can_access_transaction_spine(target_transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (
    select 1 from public.transaction_attorney_assignments a
    join public.attorney_firm_members member
      on member.firm_id = coalesce(a.attorney_firm_id, a.firm_id)
     and member.user_id = auth.uid() and member.status = 'active'
    where a.transaction_id = target_transaction_id
      and coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
  ) and not exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id = target_transaction_id
      and public.bridge_attorney_matter_team_access(target_transaction_id,
        coalesce(a.attorney_firm_id, a.firm_id), 'view')
  ) then return false; end if;
  return public.bridge_can_access_transaction_spine_pre_team(target_transaction_id);
end;
$$;
revoke all on function public.bridge_can_access_transaction_spine(uuid) from public, anon;
grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;

-- Restrictive policies close alternate permissive policy paths for attorney
-- firm members while leaving agent/buyer/other professional scopes unchanged.
create policy attorney_matter_team_transaction_visibility on public.transactions
  as restrictive for select to authenticated
  using (
    not exists (
      select 1 from public.transaction_attorney_assignments a
      join public.attorney_firm_members member
        on member.firm_id = coalesce(a.attorney_firm_id, a.firm_id)
       and member.user_id = auth.uid() and member.status = 'active'
      where a.transaction_id = transactions.id
        and coalesce(a.assignment_status, a.status) in ('pending', 'active', 'paused')
    )
    or exists (
      select 1 from public.transaction_attorney_assignments a
      where a.transaction_id = transactions.id
        and public.bridge_attorney_matter_team_access(transactions.id,
          coalesce(a.attorney_firm_id, a.firm_id), 'view')
    )
  );
create policy attorney_matter_team_assignment_visibility on public.transaction_attorney_assignments
  as restrictive for select to authenticated
  using (
    not exists (
      select 1 from public.attorney_firm_members member
      where member.firm_id = coalesce(transaction_attorney_assignments.attorney_firm_id,
        transaction_attorney_assignments.firm_id)
        and member.user_id = auth.uid() and member.status = 'active'
    )
    or public.bridge_attorney_matter_team_access(transaction_id,
      coalesce(attorney_firm_id, firm_id), 'view')
  );

notify pgrst, 'reload schema';
commit;
