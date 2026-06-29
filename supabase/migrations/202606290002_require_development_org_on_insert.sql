begin;

drop policy if exists developments_insert_scoped on public.developments;
create policy developments_insert_scoped on public.developments
for insert to authenticated
with check (
  organisation_id is not null
  and (
    public.bridge_is_admin()
    or exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = developments.organisation_id
        and ou.user_id = auth.uid()
        and ou.status = 'active'
    )
  )
);

notify pgrst, 'reload schema';

commit;
