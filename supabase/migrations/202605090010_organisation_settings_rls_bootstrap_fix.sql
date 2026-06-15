begin;
create or replace function public.bridge_can_write_org_settings(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_is_org_admin(target_org)
    or public.bridge_is_active_member(target_org),
    false
  );
$$;
grant execute on function public.bridge_can_write_org_settings(uuid) to authenticated;
drop policy if exists organisation_settings_agency_write on public.organisation_settings;
drop policy if exists organisation_settings_agency_insert on public.organisation_settings;
drop policy if exists organisation_settings_agency_update on public.organisation_settings;
drop policy if exists organisation_settings_agency_delete on public.organisation_settings;
create policy organisation_settings_agency_insert on public.organisation_settings
for insert to authenticated
with check (public.bridge_can_write_org_settings(organisation_id));
create policy organisation_settings_agency_update on public.organisation_settings
for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));
create policy organisation_settings_agency_delete on public.organisation_settings
for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));
commit;
