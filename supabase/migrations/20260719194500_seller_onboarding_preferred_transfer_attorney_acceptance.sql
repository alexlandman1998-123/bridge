begin;

create or replace function public.bridge_require_seller_preferred_transfer_attorney_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preferred_partner_id text := nullif(trim(new.form_data #>> '{preferredTransferAttorney,preferredPartnerId}'), '');
  v_accepted_partner_id text := nullif(trim(new.form_data #>> '{preferredTransferAttorneyAcceptance,preferredPartnerId}'), '');
  v_decision text := lower(nullif(trim(new.form_data ->> 'preferredTransferAttorneyDecision'), ''));
  v_nominated_company text := nullif(trim(new.form_data #>> '{sellerNominatedTransferAttorney,companyName}'), '');
  v_nominated_email text := nullif(lower(trim(new.form_data #>> '{sellerNominatedTransferAttorney,email}')), '');
  v_listing public.private_listings%rowtype;
  v_partner public.organisation_preferred_partners%rowtype;
  v_existing_allocation public.private_listing_role_players%rowtype;
begin
  if lower(coalesce(new.status, '')) = 'completed'
     and lower(coalesce(old.status, '')) is distinct from 'completed' then
    if v_preferred_partner_id is null then
      raise exception 'The preferred transferring attorney must be configured before seller onboarding can be completed.'
        using errcode = '23514';
    end if;

    if v_decision = 'accept_preferred' then
      if lower(coalesce(new.form_data ->> 'preferredTransferAttorneyAccepted', 'false')) <> 'true'
         or v_accepted_partner_id is distinct from v_preferred_partner_id then
        raise exception 'The seller must accept the selected preferred transferring attorney before completing onboarding.'
          using errcode = '23514';
      end if;

      select * into v_listing
      from public.private_listings
      where id = new.private_listing_id;

      select * into v_partner
      from public.organisation_preferred_partners
      where id::text = v_preferred_partner_id
        and organisation_id = v_listing.organisation_id
        and partner_type = 'transfer_attorney'
        and is_active = true;

      if v_partner.id is null or v_partner.partner_organisation_id is null then
        raise exception 'The accepted transferring attorney must be an active connected attorney organisation.'
          using errcode = '23514';
      end if;

      select * into v_existing_allocation
      from public.private_listing_role_players
      where private_listing_id = new.private_listing_id
        and role_type = 'transfer_attorney'
        and allocation_status in ('awaiting_buyer', 'under_offer', 'instructed')
      order by selected_at desc
      limit 1
      for update;

      if v_existing_allocation.id is not null
         and v_existing_allocation.preferred_partner_id = v_partner.id then
        update public.private_listing_role_players
        set partner_organisation_id = v_partner.partner_organisation_id,
            company_name = v_partner.company_name,
            contact_person = v_partner.contact_person,
            email_address = lower(v_partner.email_address),
            phone_number = v_partner.phone_number,
            selection_source = 'agency_recommended',
            selected_at = now(),
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'source', 'seller_onboarding_acceptance',
              'sellerAcceptedAt', new.form_data #>> '{preferredTransferAttorneyAcceptance,acceptedAt}',
              'sellerAcceptedByName', new.form_data #>> '{preferredTransferAttorneyAcceptance,acceptedByName}'
            ),
            updated_at = now()
        where id = v_existing_allocation.id;
      else
        if v_existing_allocation.id is not null then
          update public.private_listing_role_players
          set allocation_status = 'replaced', replaced_at = now(), updated_at = now()
          where id = v_existing_allocation.id;
        end if;

        insert into public.private_listing_role_players (
          organisation_id,
          private_listing_id,
          role_type,
          preferred_partner_id,
          partner_organisation_id,
          company_name,
          contact_person,
          email_address,
          phone_number,
          selection_source,
          allocation_status,
          mandate_packet_id,
          mandate_signed_at,
          selected_by,
          metadata
        ) values (
          v_listing.organisation_id,
          new.private_listing_id,
          'transfer_attorney',
          v_partner.id,
          v_partner.partner_organisation_id,
          v_partner.company_name,
          v_partner.contact_person,
          lower(v_partner.email_address),
          v_partner.phone_number,
          'agency_recommended',
          'awaiting_buyer',
          null,
          null,
          null,
          jsonb_build_object(
            'source', 'seller_onboarding_acceptance',
            'sellerAcceptedAt', new.form_data #>> '{preferredTransferAttorneyAcceptance,acceptedAt}',
            'sellerAcceptedByName', new.form_data #>> '{preferredTransferAttorneyAcceptance,acceptedByName}'
          )
        );
      end if;
    elsif v_decision = 'nominate_other' then
      if v_nominated_company is null or v_nominated_email is null then
        raise exception 'The nominated attorney firm name and email are required.'
          using errcode = '23514';
      end if;

      update public.private_listing_role_players
      set allocation_status = 'withdrawn',
          replaced_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'withdrawalReason', 'seller_nominated_other_attorney',
            'sellerNominatedCompany', v_nominated_company,
            'sellerNominatedEmail', v_nominated_email
          ),
          updated_at = now()
      where private_listing_id = new.private_listing_id
        and role_type = 'transfer_attorney'
        and allocation_status in ('awaiting_buyer', 'under_offer');
    else
      raise exception 'The seller must accept the preferred attorney or nominate another firm before completing onboarding.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.bridge_require_seller_preferred_transfer_attorney_acceptance() from public;

drop trigger if exists private_listing_seller_onboarding_require_preferred_attorney_acceptance
  on public.private_listing_seller_onboarding;

create trigger private_listing_seller_onboarding_require_preferred_attorney_acceptance
before update of status, form_data on public.private_listing_seller_onboarding
for each row
execute function public.bridge_require_seller_preferred_transfer_attorney_acceptance();

comment on function public.bridge_require_seller_preferred_transfer_attorney_acceptance()
  is 'Requires an accept-or-nominate attorney decision and creates the connected preferred attorney pre-instruction pipeline allocation when accepted.';

commit;
