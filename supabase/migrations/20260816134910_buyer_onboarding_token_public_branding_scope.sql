begin;

drop policy if exists organisations_select_onboarding_token_brand_scope on public.organisations;
create policy organisations_select_onboarding_token_brand_scope
on public.organisations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.transactions tx
    left join public.developments dev on dev.id = tx.development_id
    where public.bridge_has_onboarding_token_transaction_access(tx.id)
      and (
        tx.organisation_id = public.organisations.id
        or (
          tx.organisation_id is null
          and dev.organisation_id = public.organisations.id
        )
      )
  )
);

drop policy if exists organisation_branding_select_onboarding_token_brand_scope on public.organisation_branding;
create policy organisation_branding_select_onboarding_token_brand_scope
on public.organisation_branding
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.transactions tx
    left join public.developments dev on dev.id = tx.development_id
    where public.bridge_has_onboarding_token_transaction_access(tx.id)
      and (
        tx.organisation_id = public.organisation_branding.organisation_id
        or (
          tx.organisation_id is null
          and dev.organisation_id = public.organisation_branding.organisation_id
        )
      )
  )
);

grant select on table public.organisations to anon, authenticated;
grant select on table public.organisation_branding to anon, authenticated;

notify pgrst, 'reload schema';

commit;
