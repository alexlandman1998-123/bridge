begin;

alter table public.attorney_firm_departments
  drop constraint if exists attorney_firm_departments_department_type_check;
alter table public.attorney_firm_departments
  add constraint attorney_firm_departments_department_type_check
  check (department_type in ('transfer', 'bond', 'cancellation', 'admin', 'management'));

alter table public.attorney_firm_members
  drop constraint if exists attorney_firm_members_role_check;
alter table public.attorney_firm_members
  add constraint attorney_firm_members_role_check
  check (role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney'));

alter table public.attorney_firm_invitations
  drop constraint if exists attorney_firm_invitations_role_check;
alter table public.attorney_firm_invitations
  add constraint attorney_firm_invitations_role_check
  check (role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney'));

alter table public.profiles
  drop constraint if exists profiles_attorney_role_check;
alter table public.profiles
  add constraint profiles_attorney_role_check
  check (
    attorney_role is null
    or attorney_role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'candidate_attorney')
  );

insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
select firm.id, 'Bond Cancellation Department', 'cancellation', false
from public.attorney_firms firm
where firm.is_active = true
on conflict (firm_id, department_type) do nothing;

create or replace function public.set_attorney_firm_department_activation_v2(
  target_firm_id uuid,
  active_department_types text[]
)
returns table (
  id uuid,
  firm_id uuid,
  name text,
  department_type text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_active_types text[];
begin
  if target_firm_id is null then
    raise exception 'Firm id is required.';
  end if;

  if not (
    public.attorney_user_is_firm_admin(target_firm_id)
    or exists (
      select 1
      from public.attorney_firms firm
      where firm.id = target_firm_id
        and firm.created_by = auth.uid()
    )
  ) then
    raise exception 'Permission denied for attorney firm departments.' using errcode = '42501';
  end if;

  select array_agg(distinct active_type.value)
  into normalized_active_types
  from unnest(coalesce(active_department_types, array[]::text[])) as active_type(value)
  where active_type.value in ('transfer', 'bond', 'cancellation', 'admin', 'management');

  normalized_active_types := array_append(coalesce(normalized_active_types, array[]::text[]), 'management');

  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values
    (target_firm_id, 'Transfer Department', 'transfer', 'transfer' = any(normalized_active_types)),
    (target_firm_id, 'Bond Department', 'bond', 'bond' = any(normalized_active_types)),
    (target_firm_id, 'Bond Cancellation Department', 'cancellation', 'cancellation' = any(normalized_active_types)),
    (target_firm_id, 'Admin Department', 'admin', 'admin' = any(normalized_active_types)),
    (target_firm_id, 'Management', 'management', true)
  on conflict (firm_id, department_type)
  do update set
    is_active = excluded.is_active,
    updated_at = now();

  return query
  select
    department.id,
    department.firm_id,
    department.name,
    department.department_type,
    department.is_active,
    department.created_at,
    department.updated_at
  from public.attorney_firm_departments department
  where department.firm_id = target_firm_id
  order by department.name;
end;
$$;

create or replace function public.bridge_complete_attorney_firm_onboarding_v3(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_firm_id uuid;
  v_cancellation_active boolean := false;
  v_departments jsonb := '[]'::jsonb;
begin
  v_result := public.bridge_complete_attorney_firm_onboarding_v2(payload);
  v_firm_id := nullif(v_result #>> '{firm,id}', '')::uuid;

  if v_firm_id is null then
    raise exception 'Attorney firm onboarding did not return a firm.' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(coalesce(payload, '{}'::jsonb) -> 'activeDepartmentTypes') = 'array'
          then coalesce(payload, '{}'::jsonb) -> 'activeDepartmentTypes'
        else '[]'::jsonb
      end
    ) as requested_department(department_type)
    where requested_department.department_type = 'cancellation'
  ) into v_cancellation_active;

  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values (v_firm_id, 'Bond Cancellation Department', 'cancellation', v_cancellation_active)
  on conflict (firm_id, department_type)
  do update set
    is_active = excluded.is_active,
    updated_at = now();

  select coalesce(jsonb_agg(to_jsonb(department) order by department.name), '[]'::jsonb)
  into v_departments
  from public.attorney_firm_departments department
  where department.firm_id = v_firm_id;

  return jsonb_set(v_result, '{departments}', v_departments, true);
end;
$$;

create or replace function public.bridge_can_mutate_attorney_lane_phase2(
  target_transaction_id uuid,
  target_attorney_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_attorney_assignments assignment
    left join public.attorney_firms firm
      on firm.id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
    where assignment.transaction_id = target_transaction_id
      and assignment.attorney_role = target_attorney_role
      and target_attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
      and coalesce(assignment.assignment_status, assignment.status, 'active') = 'active'
      and coalesce(assignment.can_update_workflow_lane, true) = true
      and (
        assignment.attorney_user_id = auth.uid()
        or assignment.primary_attorney_id = auth.uid()
        or (
          coalesce(firm.allow_management_lane_override, false) = true
          and public.attorney_user_is_firm_lead(coalesce(assignment.attorney_firm_id, assignment.firm_id))
        )
      )
  );
$$;

drop policy if exists transaction_attorney_lane_history_write on public.transaction_attorney_lane_history;
create policy transaction_attorney_lane_history_write
  on public.transaction_attorney_lane_history
  for insert to authenticated
  with check (
    public.bridge_can_mutate_attorney_lane_phase2(transaction_id, attorney_role)
  );

drop policy if exists transaction_attorney_lane_updates_write on public.transaction_attorney_lane_updates;
create policy transaction_attorney_lane_updates_write
  on public.transaction_attorney_lane_updates
  for insert to authenticated
  with check (
    public.bridge_can_mutate_attorney_lane_phase2(transaction_id, attorney_role)
  );

drop policy if exists attorney_workflow_blockers_write on public.attorney_workflow_blockers;
create policy attorney_workflow_blockers_write
  on public.attorney_workflow_blockers
  for all to authenticated
  using (
    public.bridge_can_mutate_attorney_lane_phase2(transaction_id, attorney_role)
  )
  with check (
    public.bridge_can_mutate_attorney_lane_phase2(transaction_id, attorney_role)
  );

revoke all on function public.set_attorney_firm_department_activation_v2(uuid, text[]) from public;
grant execute on function public.set_attorney_firm_department_activation_v2(uuid, text[]) to authenticated;
revoke all on function public.bridge_complete_attorney_firm_onboarding_v3(jsonb) from public;
grant execute on function public.bridge_complete_attorney_firm_onboarding_v3(jsonb) to authenticated;
revoke all on function public.bridge_can_mutate_attorney_lane_phase2(uuid, text) from public;
grant execute on function public.bridge_can_mutate_attorney_lane_phase2(uuid, text) to authenticated;

comment on function public.set_attorney_firm_department_activation_v2(uuid, text[]) is
  'Phase 2 department activation with first-class bond cancellation support.';
comment on function public.bridge_complete_attorney_firm_onboarding_v3(jsonb) is
  'Phase 2 attorney onboarding wrapper that persists the cancellation department without changing v2 compatibility.';
comment on function public.bridge_can_mutate_attorney_lane_phase2(uuid, text) is
  'Allows mutation only for the assigned lane attorney, or a firm lead when the explicit management override is enabled.';

commit;
