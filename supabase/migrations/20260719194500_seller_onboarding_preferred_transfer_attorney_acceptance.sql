begin;

create or replace function public.bridge_require_seller_preferred_transfer_attorney_acceptance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_preferred_partner_id text := nullif(trim(new.form_data #>> '{preferredTransferAttorney,preferredPartnerId}'), '');
  v_accepted_partner_id text := nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,preferredPartnerId}'), '');
begin
  if lower(coalesce(new.status, '')) = 'completed'
     and lower(coalesce(old.status, '')) is distinct from 'completed' then
    if v_preferred_partner_id is null then
      raise exception 'The preferred transferring attorney must be configured before seller onboarding can be completed.'
        using errcode = '23514';
    end if;

    if coalesce((new.form_data ->> 'preferredTransferAttorneyAccepted')::boolean, false) is not true
       or v_accepted_partner_id is distinct from v_preferred_partner_id then
      raise exception 'The seller must accept the preferred transferring attorney before completing onboarding.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists private_listing_seller_onboarding_require_preferred_attorney_acceptance
  on public.private_listing_seller_onboarding;

create trigger private_listing_seller_onboarding_require_preferred_attorney_acceptance
before update of status, form_data on public.private_listing_seller_onboarding
for each row
execute function public.bridge_require_seller_preferred_transfer_attorney_acceptance();

comment on function public.bridge_require_seller_preferred_transfer_attorney_acceptance()
  is 'Prevents new seller-onboarding completions until the seller accepts the exact preferred transfer-attorney snapshot attached to the onboarding.';

commit;
