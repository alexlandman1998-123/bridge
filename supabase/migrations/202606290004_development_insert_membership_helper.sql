begin;

create or replace function public.bridge_has_organisation_membership(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  )
$$;

drop policy if exists developments_insert_scoped on public.developments;
create policy developments_insert_scoped on public.developments
for insert to authenticated
with check (
  organisation_id is not null
  and (
    public.bridge_is_admin()
    or public.bridge_has_organisation_membership(organisation_id)
  )
);

notify pgrst, 'reload schema';

commit;
