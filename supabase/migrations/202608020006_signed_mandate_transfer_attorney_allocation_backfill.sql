begin;

with signed_mandate_attorneys as (
  select
    listing.id as private_listing_id,
    listing.organisation_id,
    listing.mandate_packet_id,
    coalesce(onboarding.submitted_at, listing.updated_at, now()) as mandate_signed_at,
    onboarding.id as onboarding_id,
    onboarding.form_data,
    coalesce(
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,preferredPartnerId}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,preferred_partner_id}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,partnerId}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,partner_id}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,id}'), '')
    ) as preferred_partner_text,
    coalesce(
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,preferredPartnerId}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,preferred_partner_id}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,partnerId}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,partner_id}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,id}'), '')
    ) as accepted_partner_text,
    coalesce(
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,partnerOrganisationId}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,partner_organisation_id}'), '')
    ) as partner_organisation_text,
    coalesce(
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,companyName}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,company_name}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,name}'), '')
    ) as company_name,
    coalesce(
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,contactPerson}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,contact_person}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,companyName}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorney,company_name}'), '')
    ) as contact_person,
    nullif(lower(trim(coalesce(
      onboarding.form_data #>> '{preferredTransferAttorney,email}',
      onboarding.form_data #>> '{preferredTransferAttorney,emailAddress}',
      onboarding.form_data #>> '{preferredTransferAttorney,email_address}'
    ))), '') as email_address,
    nullif(trim(coalesce(
      onboarding.form_data #>> '{preferredTransferAttorney,phone}',
      onboarding.form_data #>> '{preferredTransferAttorney,phoneNumber}',
      onboarding.form_data #>> '{preferredTransferAttorney,phone_number}'
    )), '') as phone_number,
    coalesce(
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,acceptedAt}'), ''),
      nullif(trim(onboarding.form_data #>> '{preferredTransferAttorneyAcceptance,accepted_at}'), '')
    ) as accepted_at_text
  from public.private_listings listing
  join public.private_listing_seller_onboarding onboarding
    on onboarding.private_listing_id = listing.id
  where (
      lower(coalesce(listing.mandate_status, '')) in ('signed', 'fully_signed', 'completed')
      or lower(coalesce(listing.listing_status, '')) in ('mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold')
    )
    and lower(coalesce(onboarding.form_data ->> 'transferAttorneyChoice', onboarding.form_data ->> 'transfer_attorney_choice', 'preferred'))
      not in ('nominate_other', 'nominate-other', 'other')
    and lower(coalesce(onboarding.form_data ->> 'preferredTransferAttorneyAccepted', onboarding.form_data ->> 'preferred_transfer_attorney_accepted', 'false'))
      in ('true', 't', '1', 'yes', 'y')
),
normalized as (
  select
    source.*,
    case when source.preferred_partner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then source.preferred_partner_text::uuid
      else null
    end as preferred_partner_uuid,
    case when coalesce(source.accepted_partner_text, source.preferred_partner_text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then coalesce(source.accepted_partner_text, source.preferred_partner_text)::uuid
      else null
    end as accepted_partner_uuid,
    case when source.partner_organisation_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then source.partner_organisation_text::uuid
      else null
    end as partner_organisation_uuid,
    case when source.accepted_at_text ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then source.accepted_at_text::timestamptz
      else source.mandate_signed_at
    end as accepted_at
  from signed_mandate_attorneys source
  where source.preferred_partner_text is not null
    and coalesce(source.accepted_partner_text, source.preferred_partner_text) = source.preferred_partner_text
    and source.company_name is not null
),
resolved as (
  select
    normalized.*,
    role_config.id as partner_role_configuration_id,
    coalesce(role_config.partner_organisation_id, normalized.partner_organisation_uuid) as resolved_partner_organisation_id,
    role_config.external_partner_id,
    role_config.relationship_id
  from normalized
  left join lateral (
    select role_config.*
    from public.organisation_partner_roles role_config
    where role_config.organisation_id = normalized.organisation_id
      and role_config.role_type = 'transfer_attorney'
      and (
        (normalized.preferred_partner_uuid is not null and role_config.external_partner_id = normalized.preferred_partner_uuid)
        or (normalized.accepted_partner_uuid is not null and role_config.relationship_id = normalized.accepted_partner_uuid)
        or (
          normalized.preferred_partner_uuid is null
          and normalized.accepted_partner_uuid is null
          and normalized.partner_organisation_uuid is not null
          and role_config.partner_organisation_id = normalized.partner_organisation_uuid
        )
      )
    order by
      role_config.is_active desc,
      (role_config.external_partner_id = normalized.preferred_partner_uuid) desc nulls last,
      (role_config.relationship_id = normalized.accepted_partner_uuid) desc nulls last,
      role_config.is_preferred_default desc,
      role_config.updated_at desc
    limit 1
  ) role_config on true
  where not exists (
    select 1
    from public.private_listing_role_players existing
    where existing.private_listing_id = normalized.private_listing_id
      and existing.role_type = 'transfer_attorney'
      and existing.allocation_status in ('awaiting_buyer', 'under_offer', 'instructed')
  )
)
insert into public.private_listing_role_players (
  organisation_id,
  private_listing_id,
  role_type,
  partner_role_configuration_id,
  preferred_partner_id,
  partner_relationship_id,
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
)
select
  resolved.organisation_id,
  resolved.private_listing_id,
  'transfer_attorney',
  resolved.partner_role_configuration_id,
  resolved.external_partner_id,
  resolved.relationship_id,
  resolved.resolved_partner_organisation_id,
  resolved.company_name,
  resolved.contact_person,
  resolved.email_address,
  resolved.phone_number,
  'seller_mandate',
  'awaiting_buyer',
  resolved.mandate_packet_id,
  resolved.accepted_at,
  null,
  jsonb_build_object(
    'source', 'signed_mandate_transfer_attorney_allocation_backfill',
    'onboardingId', resolved.onboarding_id,
    'preferredPartnerId', resolved.preferred_partner_text,
    'partnerRoleConfigurationId', resolved.partner_role_configuration_id,
    'partnerOrganisationId', resolved.resolved_partner_organisation_id
  )
from resolved
where resolved.resolved_partner_organisation_id is not null
on conflict do nothing;

commit;
