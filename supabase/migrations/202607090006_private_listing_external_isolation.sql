begin;

alter table if exists public.private_listings enable row level security;

do $$
declare
  target_policy text;
begin
  for target_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'private_listings'
  loop
    execute format('drop policy if exists %I on public.private_listings', target_policy);
  end loop;
end $$;

create policy private_listings_select_scoped
on public.private_listings
for select
to authenticated
using (public.bridge_can_access_private_listing(id));

create policy private_listings_insert_member
on public.private_listings
for insert
to authenticated
with check (public.bridge_is_active_member(organisation_id));

create policy private_listings_update_scoped
on public.private_listings
for update
to authenticated
using (public.bridge_can_access_private_listing(id))
with check (public.bridge_can_access_private_listing(id));

create policy private_listings_delete_owner_or_admin
on public.private_listings
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
    or created_by = auth.uid()
  )
);

grant select, insert, update, delete on public.private_listings to authenticated;

commit;
