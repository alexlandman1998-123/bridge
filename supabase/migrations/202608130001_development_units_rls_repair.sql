begin;

alter table if exists public.units enable row level security;

create or replace function public.bridge_can_manage_development_units(target_development_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_is_admin()
    or public.bridge_has_development_org_access(target_development_id)
    or public.bridge_has_development_access(target_development_id),
    false
  )
$$;

grant execute on function public.bridge_can_manage_development_units(uuid) to authenticated;

drop policy if exists units_select_scoped on public.units;
create policy units_select_scoped on public.units
for select to authenticated
using (
  public.bridge_can_manage_development_units(development_id)
);

drop policy if exists units_insert_scoped on public.units;
create policy units_insert_scoped on public.units
for insert to authenticated
with check (
  public.bridge_can_manage_development_units(development_id)
);

drop policy if exists units_update_scoped on public.units;
create policy units_update_scoped on public.units
for update to authenticated
using (
  public.bridge_can_manage_development_units(development_id)
)
with check (
  public.bridge_can_manage_development_units(development_id)
);

drop policy if exists units_delete_scoped on public.units;
create policy units_delete_scoped on public.units
for delete to authenticated
using (
  public.bridge_can_manage_development_units(development_id)
);

grant select, insert, update, delete on table public.units to authenticated;

notify pgrst, 'reload schema';

commit;
