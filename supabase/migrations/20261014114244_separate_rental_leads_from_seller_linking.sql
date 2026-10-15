begin;

-- Link existing records together without importing or replacing seller facts,
-- onboarding, mandates, documents, lead stages or assignments.
create or replace function public.bridge_link_listing_seller_lead(
  p_listing_id uuid,
  p_lead_id uuid,
  p_organisation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_listing public.private_listings%rowtype;
  v_lead public.leads%rowtype;
  v_rental_metadata jsonb;
begin
  if auth.uid() is null or p_organisation_id is null
     or not coalesce(public.bridge_can_access_private_listing(p_listing_id), false) then
    raise exception 'You do not have access to link this listing.' using errcode = '42501';
  end if;

  select * into v_listing from public.private_listings
    where id = p_listing_id and organisation_id = p_organisation_id for update;
  if not found then
    raise exception 'The listing could not be found in this organisation.' using errcode = '42501';
  end if;
  if lower(coalesce(v_listing.listing_category, '')) like '%rental%'
     or lower(coalesce(v_listing.seller_type, '')) = 'developer' then
    raise exception 'Seller lead linking is available for sales listings.';
  end if;
  if (nullif(btrim(v_listing.seller_lead_id), '') is not null and btrim(v_listing.seller_lead_id) <> p_lead_id::text)
     or (nullif(btrim(v_listing.originating_crm_lead_id), '') is not null and btrim(v_listing.originating_crm_lead_id) <> p_lead_id::text) then
    raise exception 'This listing already has a different seller lead.';
  end if;

  select * into v_lead from public.leads
    where lead_id = p_lead_id and organisation_id = p_organisation_id for update;
  if not found or lower(coalesce(v_lead.lead_category, '')) <> 'seller'
     or coalesce(v_lead.lead_domain, 'agency') <> 'agency' then
    raise exception 'Choose an accessible seller lead from this organisation.' using errcode = '42501';
  end if;
  -- Rental landlords share the legacy seller category; their rental metadata
  -- must be checked while the same locked lead is used for the atomic link.
  v_rental_metadata := coalesce(
    nullif(v_lead.raw_enquiry_payload->'rentalCrm', 'null'::jsonb),
    nullif(v_lead.raw_enquiry_payload->'rental_crm', 'null'::jsonb),
    v_lead.raw_enquiry_payload, '{}'::jsonb
  );
  if v_rental_metadata->'arch9RentalLead' = 'true'::jsonb
     or lower(btrim(coalesce(v_rental_metadata->>'classification', ''))) = 'rental'
     or lower(btrim(coalesce(nullif(v_rental_metadata->>'leadType', ''), v_rental_metadata->>'lead_type', ''))) = 'rental' then
    raise exception 'Rental landlord and tenant leads cannot be linked as sales sellers.' using errcode = '22023';
  end if;
  if (v_lead.listing_id is not null and v_lead.listing_id <> p_listing_id::text)
     or (v_lead.enquired_listing_id is not null and v_lead.enquired_listing_id <> p_listing_id) then
    raise exception 'This seller lead is already linked to another listing.';
  end if;
  if not exists (select 1 from public.contacts
      where contact_id = v_lead.contact_id and organisation_id = p_organisation_id) then
    raise exception 'This seller lead has no accessible seller contact.' using errcode = '42501';
  end if;
  if exists (select 1 from public.private_listings
      where organisation_id = p_organisation_id and id <> p_listing_id
        and (nullif(btrim(seller_lead_id), '') = p_lead_id::text
          or nullif(btrim(originating_crm_lead_id), '') = p_lead_id::text)) then
    raise exception 'This seller lead is already linked to another listing.';
  end if;
  if exists (select 1 from public.leads
      where organisation_id = p_organisation_id and lead_id <> p_lead_id
        and lower(lead_category) = 'seller' and listing_id = p_listing_id::text) then
    raise exception 'Another seller lead is already linked to this listing.';
  end if;

  if v_listing.seller_lead_id is distinct from p_lead_id::text
     or v_listing.originating_crm_lead_id is distinct from p_lead_id::text then
    update public.private_listings set seller_lead_id = p_lead_id::text,
      originating_crm_lead_id = p_lead_id::text, updated_at = now()
      where id = p_listing_id and organisation_id = p_organisation_id;
    if not found then
      raise exception 'You do not have permission to update this listing.' using errcode = '42501';
    end if;
  end if;
  if v_lead.listing_id is distinct from p_listing_id::text
     or v_lead.enquired_listing_id is distinct from p_listing_id then
    update public.leads set listing_id = p_listing_id::text,
      enquired_listing_id = p_listing_id, updated_at = now()
      where lead_id = p_lead_id and organisation_id = p_organisation_id;
    if not found then
      raise exception 'You do not have permission to update this seller lead.' using errcode = '42501';
    end if;
  end if;

  return jsonb_build_object('listingId', p_listing_id, 'sellerLeadId', p_lead_id,
    'originatingCrmLeadId', p_lead_id, 'organisationId', p_organisation_id);
end;
$$;

revoke all on function public.bridge_link_listing_seller_lead(uuid, uuid, uuid) from public, anon;
grant execute on function public.bridge_link_listing_seller_lead(uuid, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
