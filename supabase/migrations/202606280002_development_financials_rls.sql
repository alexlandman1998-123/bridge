begin;

alter table if exists public.development_financials enable row level security;

drop policy if exists development_financials_select_scoped on public.development_financials;
create policy development_financials_select_scoped on public.development_financials
for select to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_is_internal_user()
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_financials_modify_scoped on public.development_financials;
drop policy if exists development_financials_insert_scoped on public.development_financials;
create policy development_financials_insert_scoped on public.development_financials
for insert to authenticated
with check (
  public.bridge_is_admin()
  or public.bridge_is_internal_user()
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_financials_update_scoped on public.development_financials;
create policy development_financials_update_scoped on public.development_financials
for update to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_is_internal_user()
  or public.bridge_has_development_access(development_id)
)
with check (
  public.bridge_is_admin()
  or public.bridge_is_internal_user()
  or public.bridge_has_development_access(development_id)
);

drop policy if exists development_financials_delete_scoped on public.development_financials;
create policy development_financials_delete_scoped on public.development_financials
for delete to authenticated
using (
  public.bridge_is_admin()
  or public.bridge_is_internal_user()
  or public.bridge_has_development_access(development_id)
);

commit;
