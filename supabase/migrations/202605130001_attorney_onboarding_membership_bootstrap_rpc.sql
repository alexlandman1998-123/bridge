begin;

create or replace function public.bootstrap_attorney_firm_admin_membership(
  target_firm_id uuid
)
returns public.attorney_firm_members
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.attorney_firm_members;
begin
  if target_firm_id is null then
    raise exception 'Firm id is required.';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.attorney_firms f
    where f.id = target_firm_id
      and f.created_by = auth.uid()
  ) then
    raise exception 'Permission denied for attorney firm membership bootstrap.'
      using errcode = '42501';
  end if;

  insert into public.attorney_firm_members (
    firm_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    target_firm_id,
    auth.uid(),
    'firm_admin',
    'active',
    auth.uid(),
    now()
  )
  on conflict (firm_id, user_id)
  do update set
    role = 'firm_admin',
    status = 'active',
    invited_by = coalesce(public.attorney_firm_members.invited_by, auth.uid()),
    joined_at = coalesce(public.attorney_firm_members.joined_at, now()),
    updated_at = now()
  returning *
  into member_row;

  update public.profiles
  set
    primary_attorney_firm_id = target_firm_id,
    attorney_role = 'firm_admin',
    onboarding_completed = true,
    updated_at = now()
  where id = auth.uid();

  return member_row;
end;
$$;

grant execute on function public.bootstrap_attorney_firm_admin_membership(uuid) to authenticated;

create or replace function public.set_attorney_firm_department_activation(
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
      from public.attorney_firms f
      where f.id = target_firm_id
        and f.created_by = auth.uid()
    )
  ) then
    raise exception 'Permission denied for attorney firm departments.'
      using errcode = '42501';
  end if;

  select array_agg(distinct value)
  into normalized_active_types
  from unnest(coalesce(active_department_types, array[]::text[])) as value
  where value in ('transfer', 'bond', 'admin', 'management');

  normalized_active_types := array_append(coalesce(normalized_active_types, array[]::text[]), 'management');

  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values
    (target_firm_id, 'Transfer Department', 'transfer', 'transfer' = any(normalized_active_types)),
    (target_firm_id, 'Bond Department', 'bond', 'bond' = any(normalized_active_types)),
    (target_firm_id, 'Admin Department', 'admin', 'admin' = any(normalized_active_types)),
    (target_firm_id, 'Management', 'management', true)
  on conflict (firm_id, department_type)
  do update set
    is_active = excluded.is_active,
    updated_at = now();

  return query
  select
    d.id,
    d.firm_id,
    d.name,
    d.department_type,
    d.is_active,
    d.created_at,
    d.updated_at
  from public.attorney_firm_departments d
  where d.firm_id = target_firm_id
  order by d.name;
end;
$$;

grant execute on function public.set_attorney_firm_department_activation(uuid, text[]) to authenticated;

commit;
