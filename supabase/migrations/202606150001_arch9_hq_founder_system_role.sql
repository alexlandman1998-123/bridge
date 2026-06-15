begin;

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_system_role_check;

  alter table public.profiles
    add constraint profiles_system_role_check
    check (system_role is null or system_role in ('professional', 'client', 'admin', 'super_admin', 'founder'));
exception
  when undefined_table then null;
end $$;

create or replace function public.bridge_normalize_system_role(role_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(role_value, '')) in ('client', 'buyer', 'seller') then 'client'
    when lower(coalesce(role_value, '')) in ('founder') then 'founder'
    when lower(coalesce(role_value, '')) in ('super_admin', 'superadmin') then 'super_admin'
    when lower(coalesce(role_value, '')) in ('admin', 'platform_admin') then 'admin'
    when lower(coalesce(role_value, '')) in ('agent', 'developer', 'attorney', 'bond_originator', 'professional') then 'professional'
    else null
  end;
$$;

-- TODO: Assign founder access to Alex and Sam after confirming their real auth.users/profile ids:
-- update public.profiles set system_role = 'founder' where id in ('<alex-user-id>', '<sam-user-id>');
-- Until the founder system role is deployed everywhere, system_role = 'super_admin' is also accepted by the HQ guard.

commit;
