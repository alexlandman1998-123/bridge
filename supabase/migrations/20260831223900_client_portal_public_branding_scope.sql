begin;

-- A valid buyer-portal bearer token may read only the public identity and
-- branding rows attached to its own transaction. Organisation membership is
-- deliberately not required for this client-facing presentation data.
drop policy if exists organisations_select_client_portal_brand_scope on public.organisations;
create policy organisations_select_client_portal_brand_scope
on public.organisations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.transactions tx
    left join public.developments dev on dev.id = tx.development_id
    where (select public.bridge_has_client_portal_token_transaction_access(tx.id))
      and (
        tx.organisation_id = public.organisations.id
        or dev.organisation_id = public.organisations.id
      )
  )
);

drop policy if exists organisation_branding_select_client_portal_brand_scope on public.organisation_branding;
create policy organisation_branding_select_client_portal_brand_scope
on public.organisation_branding
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.transactions tx
    left join public.developments dev on dev.id = tx.development_id
    where (select public.bridge_has_client_portal_token_transaction_access(tx.id))
      and (
        tx.organisation_id = public.organisation_branding.organisation_id
        or dev.organisation_id = public.organisation_branding.organisation_id
      )
  )
);

grant select on table public.organisations to anon, authenticated;
grant select on table public.organisation_branding to anon, authenticated;

do $$
declare
  missing_policies text[];
begin
  select array_agg(expected.policy_name order by expected.policy_name)
    into missing_policies
    from (
      values
        ('organisations', 'organisations_select_client_portal_brand_scope'),
        ('organisation_branding', 'organisation_branding_select_client_portal_brand_scope')
    ) as expected(table_name, policy_name)
   where not exists (
     select 1
       from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = expected.table_name
        and policy.policyname = expected.policy_name
   );

  if missing_policies is not null then
    raise exception 'Client portal branding policies missing after migration: %', missing_policies;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
