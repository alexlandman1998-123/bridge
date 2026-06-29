begin;

grant usage on schema public to anon, authenticated;

do $$
begin
  if to_regclass('public.commercial_landlord_contacts') is not null then
    grant select, insert, update, delete on public.commercial_landlord_contacts to authenticated, anon;
  end if;

  if to_regclass('public.commercial_mandates') is not null then
    grant select, insert, update, delete on public.commercial_mandates to authenticated, anon;
  end if;

  if to_regclass('public.commercial_landlord_onboarding') is not null then
    grant select, insert, update, delete on public.commercial_landlord_onboarding to authenticated, anon;
  end if;

  if to_regclass('public.commercial_landlord_onboarding_responses') is not null then
    grant select, insert, update, delete on public.commercial_landlord_onboarding_responses to authenticated, anon;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
