-- Use the existing generic channel while preserving the supplier source label.
begin;
create or replace function public.private_property_ingest_lead(
  p_organisation_id uuid, p_external_reference text, p_name text, p_email text,
  p_phone text, p_message text, p_listing_id uuid, p_raw_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_existing_lead_id uuid;
  v_contact_id uuid;
  v_lead_id uuid := gen_random_uuid();
  v_listing public.private_listings%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_reference text := nullif(trim(p_external_reference), '');
  v_payload jsonb := coalesce(p_raw_payload, '{}'::jsonb);
  v_received_at timestamptz;
begin
  if v_reference is null or (nullif(v_name, '') is null and nullif(trim(p_email), '') is null and nullif(trim(p_phone), '') is null) then
    raise exception 'Private Property lead identity is required.' using errcode = '22023';
  end if;
  -- Serialise one provider lead across concurrent webhook deliveries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organisation_id::text || ':' || v_reference, 0));
  select lead_id into v_existing_lead_id from public.lead_ingestion_logs
    where organisation_id = p_organisation_id and source = 'Private Property' and external_reference = v_reference and status = 'processed' limit 1;
  if v_existing_lead_id is not null then return v_existing_lead_id; end if;
  if p_listing_id is not null then
    select * into v_listing from public.private_listings where id = p_listing_id and organisation_id = p_organisation_id;
    if not found then raise exception 'Listing does not belong to this agency.' using errcode = '42501'; end if;
  end if;
  begin v_received_at := nullif(v_payload ->> 'leadDateTime', '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then v_received_at := null; end;
  select contact_id into v_contact_id from public.contacts
    where organisation_id = p_organisation_id and ((nullif(trim(p_email), '') is not null and lower(email) = lower(trim(p_email)))
      or (nullif(trim(p_phone), '') is not null and phone = trim(p_phone))) order by updated_at desc nulls last limit 1;
  if v_contact_id is null then
    v_contact_id := gen_random_uuid();
    insert into public.contacts (contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, updated_at)
      values (v_contact_id, p_organisation_id, v_listing.assigned_agent_id, coalesce(nullif(split_part(v_name, ' ', 1), ''), 'Lead'),
        nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''), nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''), 'Lead', now());
  end if;
  if lower(coalesce(v_payload ->> 'listingType', '')) = 'rental' and p_listing_id is null then
    v_payload := v_payload || jsonb_build_object('arch9RentalLead', true, 'classification', 'rental', 'leadType', 'rental',
      'version', 'arch9_rental_crm_lead_model_v1', 'role', 'tenant', 'stage', 'new', 'source', 'Private Property',
      'leadId', v_lead_id, 'organisationId', p_organisation_id);
  end if;
  insert into public.leads (lead_id, organisation_id, contact_id, lead_domain, assigned_agent_id, assigned_user_id,
      assigned_agent_email, branch_id, lead_category, lead_direction, lead_source, source_channel, stage, status, priority,
      listing_id, enquired_listing_id, enquired_property_title, source_reference_id, source_received_at, raw_enquiry_payload, notes, updated_at)
    values (v_lead_id, p_organisation_id, v_contact_id, 'agency', v_listing.assigned_agent_id, v_listing.assigned_agent_id,
      v_listing.assigned_agent_email, v_listing.branch_id, 'buyer', 'Inbound', 'Private Property', 'other', 'New Lead', 'New Lead', 'High',
      p_listing_id, p_listing_id, coalesce(v_listing.title, v_payload ->> 'listingAddress'), v_reference, v_received_at, v_payload, nullif(trim(p_message), ''), now());
  if p_listing_id is not null then
    insert into public.lead_listing_interests (organisation_id, lead_id, contact_id, listing_id, source, status, is_original_enquiry)
      values (p_organisation_id, v_lead_id, v_contact_id, p_listing_id, 'Private Property', 'interested', true);
  end if;
  insert into public.lead_ingestion_logs (log_id, organisation_id, source, external_reference, payload, status, lead_id, contact_id, listing_id, assigned_agent_id, processed_at)
    values (gen_random_uuid(), p_organisation_id, 'Private Property', v_reference, coalesce(p_raw_payload, '{}'::jsonb), 'processed', v_lead_id, v_contact_id, p_listing_id, v_listing.assigned_agent_id, now());
  return v_lead_id;
end;
$$;
revoke all on function public.private_property_ingest_lead(uuid, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.private_property_ingest_lead(uuid, text, text, text, text, text, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
