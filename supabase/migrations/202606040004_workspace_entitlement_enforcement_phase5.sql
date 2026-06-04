begin;

create or replace function public.bridge_workspace_entitlement_value(
  p_organisation_id uuid,
  p_entitlement_key text
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(ws.entitlements -> p_entitlement_key, 'null'::jsonb),
    nullif(wpc.default_entitlements -> p_entitlement_key, 'null'::jsonb)
  )
  from public.workspace_subscriptions ws
  join public.workspace_plan_catalog wpc on wpc.plan_key = ws.plan_key
  where ws.organisation_id = p_organisation_id
  limit 1
$$;

create or replace function public.bridge_workspace_entitlement_numeric_limit(
  p_organisation_id uuid,
  p_entitlement_key text
)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_value jsonb;
begin
  v_value := public.bridge_workspace_entitlement_value(p_organisation_id, p_entitlement_key);

  if v_value is null or jsonb_typeof(v_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(v_value) = 'number' then
    return (v_value #>> '{}')::numeric;
  end if;

  if jsonb_typeof(v_value) = 'string' and (v_value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then
    return (v_value #>> '{}')::numeric;
  end if;

  return null;
end;
$$;

create or replace function public.bridge_workspace_billable_user_count(p_organisation_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.organisation_users ou
  where ou.organisation_id = p_organisation_id
    and lower(coalesce(ou.status, 'active')) in ('active', 'invited', 'pending')
$$;

create or replace function public.bridge_workspace_active_branch_count(p_organisation_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((
    select count(*)::integer
    from public.organisation_branches ob
    where ob.organisation_id = p_organisation_id
      and coalesce(ob.is_active, true) = true
  ), 0)
$$;

create or replace function public.bridge_workspace_active_unit_branch_count(p_workspace_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.workspace_units wu
  where wu.workspace_id = p_workspace_id
    and lower(coalesce(wu.unit_type, '')) = 'branch'
    and coalesce(wu.active, true) = true
$$;

create or replace function public.bridge_workspace_monthly_bond_application_count(p_organisation_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.transaction_bond_applications tba
  where tba.assigned_organisation_id = p_organisation_id
    and tba.created_at >= date_trunc('month', now())
$$;

create or replace function public.bridge_assert_workspace_entitlement_capacity(
  p_organisation_id uuid,
  p_entitlement_key text,
  p_next_count integer
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_limit numeric;
  v_plan_name text;
begin
  if p_organisation_id is null or p_entitlement_key is null then
    return;
  end if;

  v_limit := public.bridge_workspace_entitlement_numeric_limit(p_organisation_id, p_entitlement_key);

  if v_limit is null then
    return;
  end if;

  if coalesce(p_next_count, 0) <= v_limit then
    return;
  end if;

  select coalesce(ws.plan_name, wpc.plan_name)
    into v_plan_name
  from public.workspace_subscriptions ws
  left join public.workspace_plan_catalog wpc on wpc.plan_key = ws.plan_key
  where ws.organisation_id = p_organisation_id
  limit 1;

  raise exception 'Workspace entitlement limit exceeded: % allows %, attempted % on %.',
    p_entitlement_key,
    v_limit,
    p_next_count,
    coalesce(v_plan_name, 'current plan')
    using errcode = 'P0001',
      hint = 'Upgrade the workspace plan or reduce current usage before retrying.',
      detail = jsonb_build_object(
        'code', 'WORKSPACE_ENTITLEMENT_LIMIT_EXCEEDED',
        'organisationId', p_organisation_id,
        'entitlementKey', p_entitlement_key,
        'limit', v_limit,
        'attempted', p_next_count,
        'planName', v_plan_name
      )::text;
end;
$$;

create or replace function public.bridge_enforce_organisation_user_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_consumes boolean;
  v_old_consumes boolean;
  v_next_count integer;
begin
  v_new_consumes := new.organisation_id is not null
    and lower(coalesce(new.status, 'active')) in ('active', 'invited', 'pending');
  v_old_consumes := tg_op = 'UPDATE'
    and old.organisation_id is not null
    and lower(coalesce(old.status, 'active')) in ('active', 'invited', 'pending');

  if v_new_consumes and (tg_op = 'INSERT' or not v_old_consumes or old.organisation_id is distinct from new.organisation_id) then
    v_next_count := public.bridge_workspace_billable_user_count(new.organisation_id) + 1;
    perform public.bridge_assert_workspace_entitlement_capacity(new.organisation_id, 'maxUsers', v_next_count);
  end if;

  return new;
end;
$$;

create or replace function public.bridge_enforce_organisation_branch_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_consumes boolean;
  v_old_consumes boolean;
  v_next_count integer;
begin
  v_new_consumes := new.organisation_id is not null and coalesce(new.is_active, true) = true;
  v_old_consumes := tg_op = 'UPDATE'
    and old.organisation_id is not null
    and coalesce(old.is_active, true) = true;

  if v_new_consumes and (tg_op = 'INSERT' or not v_old_consumes or old.organisation_id is distinct from new.organisation_id) then
    v_next_count := public.bridge_workspace_active_branch_count(new.organisation_id) + 1;
    perform public.bridge_assert_workspace_entitlement_capacity(new.organisation_id, 'maxBranches', v_next_count);
  end if;

  return new;
end;
$$;

create or replace function public.bridge_enforce_workspace_unit_branch_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_consumes boolean;
  v_old_consumes boolean;
  v_next_count integer;
begin
  v_new_consumes := new.workspace_id is not null
    and lower(coalesce(new.unit_type, '')) = 'branch'
    and coalesce(new.active, true) = true;
  v_old_consumes := tg_op = 'UPDATE'
    and old.workspace_id is not null
    and lower(coalesce(old.unit_type, '')) = 'branch'
    and coalesce(old.active, true) = true;

  if v_new_consumes and (tg_op = 'INSERT' or not v_old_consumes or old.workspace_id is distinct from new.workspace_id) then
    v_next_count := public.bridge_workspace_active_unit_branch_count(new.workspace_id) + 1;
    perform public.bridge_assert_workspace_entitlement_capacity(new.workspace_id, 'maxBranches', v_next_count);
  end if;

  return new;
end;
$$;

create or replace function public.bridge_enforce_bond_application_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_count integer;
begin
  if new.assigned_organisation_id is not null
    and (
      tg_op = 'INSERT'
      or old.assigned_organisation_id is distinct from new.assigned_organisation_id
    ) then
    v_next_count := public.bridge_workspace_monthly_bond_application_count(new.assigned_organisation_id) + 1;
    perform public.bridge_assert_workspace_entitlement_capacity(new.assigned_organisation_id, 'monthlyBondApplications', v_next_count);
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.organisation_users') is not null then
    drop trigger if exists organisation_users_enforce_workspace_entitlements on public.organisation_users;
    create trigger organisation_users_enforce_workspace_entitlements
      before insert or update of organisation_id, status on public.organisation_users
      for each row
      execute function public.bridge_enforce_organisation_user_entitlements();
  end if;

  if to_regclass('public.organisation_branches') is not null then
    drop trigger if exists organisation_branches_enforce_workspace_entitlements on public.organisation_branches;
    create trigger organisation_branches_enforce_workspace_entitlements
      before insert or update of organisation_id, is_active on public.organisation_branches
      for each row
      execute function public.bridge_enforce_organisation_branch_entitlements();
  end if;

  if to_regclass('public.workspace_units') is not null then
    drop trigger if exists workspace_units_enforce_workspace_entitlements on public.workspace_units;
    create trigger workspace_units_enforce_workspace_entitlements
      before insert or update of workspace_id, unit_type, active on public.workspace_units
      for each row
      execute function public.bridge_enforce_workspace_unit_branch_entitlements();
  end if;

  if to_regclass('public.transaction_bond_applications') is not null then
    drop trigger if exists transaction_bond_applications_enforce_workspace_entitlements on public.transaction_bond_applications;
    create trigger transaction_bond_applications_enforce_workspace_entitlements
      before insert or update of assigned_organisation_id on public.transaction_bond_applications
      for each row
      execute function public.bridge_enforce_bond_application_entitlements();
  end if;
end;
$$;

grant execute on function public.bridge_workspace_entitlement_value(uuid, text) to authenticated;
grant execute on function public.bridge_workspace_entitlement_numeric_limit(uuid, text) to authenticated;
grant execute on function public.bridge_workspace_billable_user_count(uuid) to authenticated;
grant execute on function public.bridge_workspace_active_branch_count(uuid) to authenticated;
grant execute on function public.bridge_workspace_active_unit_branch_count(uuid) to authenticated;
grant execute on function public.bridge_workspace_monthly_bond_application_count(uuid) to authenticated;
grant execute on function public.bridge_assert_workspace_entitlement_capacity(uuid, text, integer) to authenticated;

commit;
