begin;
create or replace function public.seed_default_attorney_departments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values
    (new.id, 'Transfer Department', 'transfer', true),
    (new.id, 'Bond Department', 'bond', true),
    (new.id, 'Admin Department', 'admin', true),
    (new.id, 'Management', 'management', true)
  on conflict (firm_id, department_type) do nothing;

  return new;
end;
$$;
create or replace function public.seed_attorney_firm_branding_from_firm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_firm_branding (
    firm_id,
    logo_url,
    primary_colour,
    secondary_colour,
    created_by
  )
  values (
    new.id,
    new.logo_url,
    new.primary_colour,
    new.secondary_colour,
    new.created_by
  )
  on conflict (firm_id) do nothing;

  return new;
end;
$$;
create or replace function public.attorney_user_can_bootstrap_firm_admin(
  target_firm_id uuid,
  target_user_id uuid,
  target_role text,
  target_status text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_user_id = auth.uid()
    and target_role = 'firm_admin'
    and target_status = 'active'
    and exists (
      select 1
      from public.attorney_firms f
      where f.id = target_firm_id
        and f.created_by = auth.uid()
    )
    and not exists (
      select 1
      from public.attorney_firm_members m
      where m.firm_id = target_firm_id
        and m.status = 'active'
    );
$$;
grant execute on function public.attorney_user_can_bootstrap_firm_admin(uuid, uuid, text, text) to authenticated;
drop policy if exists attorney_firms_select_member on public.attorney_firms;
create policy attorney_firms_select_member on public.attorney_firms
for select to authenticated
using (
  public.attorney_user_is_active_member(id)
  or created_by = auth.uid()
);
drop policy if exists attorney_firm_members_bootstrap_creator_admin on public.attorney_firm_members;
create policy attorney_firm_members_bootstrap_creator_admin on public.attorney_firm_members
for insert to authenticated
with check (
  public.attorney_user_can_bootstrap_firm_admin(firm_id, user_id, role, status)
);
commit;
