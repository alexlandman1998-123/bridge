begin;

create or replace function public.bridge_require_seller_preferred_transfer_attorney_acceptance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_choice text := lower(coalesce(
    nullif(trim(new.form_data ->> 'transferAttorneyChoice'), ''),
    nullif(trim(new.form_data ->> 'transfer_attorney_choice'), ''),
    'preferred'
  ));
  v_preferred_partner_id text := coalesce(
    nullif(trim(new.form_data #>> '{preferredTransferAttorney,preferredPartnerId}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorney,preferred_partner_id}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorney,partnerId}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorney,partner_id}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorney,id}'), '')
  );
  v_accepted_partner_id text := coalesce(
    nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,preferredPartnerId}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,preferred_partner_id}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,partnerId}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,partner_id}'), ''),
    nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,id}'), '')
  );
  v_preferred_accepted boolean := lower(coalesce(
    nullif(trim(new.form_data ->> 'preferredTransferAttorneyAccepted'), ''),
    nullif(trim(new.form_data ->> 'preferred_transfer_attorney_accepted'), ''),
    'false'
  )) in ('true', 't', '1', 'yes', 'y');
  v_nominated_name text := coalesce(
    nullif(trim(new.form_data ->> 'nominatedTransferAttorneyName'), ''),
    nullif(trim(new.form_data ->> 'nominated_transfer_attorney_name'), ''),
    nullif(trim(new.form_data #>> '{nominatedTransferAttorney,name}'), '')
  );
  v_nominated_contact text := coalesce(
    nullif(trim(new.form_data ->> 'nominatedTransferAttorneyEmail'), ''),
    nullif(trim(new.form_data ->> 'nominated_transfer_attorney_email'), ''),
    nullif(trim(new.form_data #>> '{nominatedTransferAttorney,email}'), ''),
    nullif(trim(new.form_data ->> 'nominatedTransferAttorneyPhone'), ''),
    nullif(trim(new.form_data ->> 'nominated_transfer_attorney_phone'), ''),
    nullif(trim(new.form_data #>> '{nominatedTransferAttorney,phone}'), '')
  );
begin
  if lower(coalesce(new.status, '')) = 'completed'
     and lower(coalesce(old.status, '')) is distinct from 'completed' then
    if v_choice in ('nominate_other', 'nominate-other', 'other') then
      if v_nominated_name is null or v_nominated_contact is null then
        raise exception 'The seller must accept the preferred transferring attorney or nominate another firm before completing onboarding.'
          using errcode = '23514';
      end if;

      return new;
    end if;

    if v_preferred_partner_id is null then
      raise exception 'The preferred transferring attorney must be configured before seller onboarding can be completed.'
        using errcode = '23514';
    end if;

    if v_accepted_partner_id is null and v_preferred_accepted then
      v_accepted_partner_id := v_preferred_partner_id;
    end if;

    if v_preferred_accepted is not true
       or v_accepted_partner_id is distinct from v_preferred_partner_id then
      raise exception 'The seller must accept the preferred transferring attorney or nominate another firm before completing onboarding.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.bridge_require_seller_preferred_transfer_attorney_acceptance()
  is 'Prevents new seller-onboarding completions until the seller accepts the preferred transfer-attorney snapshot or nominates another attorney.';

commit;
