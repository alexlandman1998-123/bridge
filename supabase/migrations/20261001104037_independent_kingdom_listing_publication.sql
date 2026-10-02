begin;

-- Kingdom publishes its own saved snapshot. Arch9 catalogue publication is independent.
-- Retain channel grants, active membership, media validation and enquiry routing.

create or replace function public.website_get_partner_listing_status(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.private_listings%rowtype;
  v_grant public.website_partner_listing_grants%rowtype;
  v_site public.website_sites%rowtype;
  v_channel public.website_partner_listing_publications%rowtype;
  v_projection public.listing_publication_data%rowtype;
  v_hostname text;
  v_image_count integer := 0;
  v_media_updated_at timestamptz;
  v_blockers jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to inspect website publication.' using errcode = '42501';
  end if;
  select * into v_listing from public.private_listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception 'Listing not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_active_member(v_listing.organisation_id) then
    raise exception 'This listing is outside your active organisation.' using errcode = '42501';
  end if;

  select * into v_grant from public.website_partner_listing_grants
  where source_organisation_id = v_listing.organisation_id and enabled = true
  order by created_at limit 1;
  if v_grant.id is null then return jsonb_build_object('available', false); end if;

  select * into v_site from public.website_sites where id = v_grant.website_site_id;
  select hostname into v_hostname from public.website_domains
  where website_site_id = v_site.id and status = 'active'
  order by is_primary desc, case domain_kind when 'custom' then 0 else 1 end, created_at limit 1;
  select * into v_projection from public.listing_publication_data where listing_id = p_listing_id;
  select * into v_channel from public.website_partner_listing_publications
  where website_site_id = v_site.id and listing_id = p_listing_id;
  select count(*)::integer, max(updated_at) into v_image_count, v_media_updated_at
  from public.listing_media where listing_id = p_listing_id and media_type = 'image'
    and file_url ~* '^https://[^[:space:]]+$';

  if v_site.status <> 'published' then
    v_blockers := v_blockers || to_jsonb('Publish the Kingdom website before publishing listing stock.'::text);
  end if;
  if v_hostname is null then
    v_blockers := v_blockers || to_jsonb('Activate the Kingdom website domain before publishing listing stock.'::text);
  end if;
  if v_projection.id is null then
    v_blockers := v_blockers || to_jsonb('Save the listing details in Arch9 first.'::text);
  else
    if nullif(trim(v_projection.title), '') is null then
      v_blockers := v_blockers || to_jsonb('Add a public listing title.'::text);
    end if;
    if v_projection.listing_type not in ('Sale', 'Rental') then
      v_blockers := v_blockers || to_jsonb('Select whether the listing is for sale or rental.'::text);
    end if;
    if coalesce(v_projection.asking_price, 0) <= 0 then
      v_blockers := v_blockers || to_jsonb('Add a positive asking price.'::text);
    end if;
  end if;
  if v_image_count = 0 then
    v_blockers := v_blockers || to_jsonb('Add at least one listing image.'::text);
  end if;

  return jsonb_build_object(
    'available', true, 'listingId', p_listing_id, 'websiteSiteId', v_site.id,
    'websiteStatus', v_site.status, 'hostname', v_hostname,
    'status', coalesce(v_channel.status, 'not_published'),
    'projectionStatus', v_projection.status, 'imageCount', v_image_count,
    'eligible', jsonb_array_length(v_blockers) = 0, 'blockers', v_blockers,
    'stale', coalesce(v_channel.status = 'published' and
      (v_projection.updated_at > v_channel.last_synced_at or v_media_updated_at > v_channel.last_synced_at), false),
    'publishedAt', v_channel.published_at, 'lastSyncedAt', v_channel.last_synced_at
  );
end;
$$;

revoke all on function public.website_get_partner_listing_status(uuid) from public, anon;
grant execute on function public.website_get_partner_listing_status(uuid) to authenticated;

create or replace function public.website_commit_partner_listing_publication(
  p_listing_id uuid, p_website_site_id uuid, p_action text,
  p_actor_id uuid, p_actor_email text, p_assets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_listing public.private_listings%rowtype;
  v_site public.website_sites%rowtype;
  v_grant public.website_partner_listing_grants%rowtype;
  v_projection public.listing_publication_data%rowtype;
  v_existing public.website_partner_listing_publications%rowtype;
  v_media_json jsonb;
  v_expected_count integer;
  v_image_count integer;
  v_requested_count integer;
  v_agent_name text;
  v_agent_email text;
  v_agent_phone text;
begin
  if v_action not in ('publish', 'update', 'unpublish') then
    raise exception 'Choose publish, update or unpublish.' using errcode = '22023';
  end if;
  select * into v_listing from public.private_listings where id = p_listing_id for update;
  if v_listing.id is null then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  select * into v_site from public.website_sites where id = p_website_site_id;
  select * into v_grant from public.website_partner_listing_grants
  where source_organisation_id = v_listing.organisation_id and website_site_id = p_website_site_id;
  if v_grant.id is null or v_site.organisation_id = v_listing.organisation_id then
    raise exception 'This listing is not approved for that website.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organisation_users member
    where member.organisation_id = v_listing.organisation_id
      and (member.user_id = p_actor_id or
        (member.user_id is null and lower(trim(member.email)) = lower(trim(coalesce(p_actor_email, '')))))
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
  ) then
    raise exception 'This listing is outside the actor''s active organisation.' using errcode = '42501';
  end if;
  select * into v_existing from public.website_partner_listing_publications
  where website_site_id = p_website_site_id and listing_id = p_listing_id for update;
  if v_action = 'unpublish' then
    if v_existing.id is not null then
      update public.website_partner_listing_publications
      set status = 'unpublished', unpublished_at = now(), updated_by = p_actor_id
      where id = v_existing.id;
    end if;
    return jsonb_build_object('status', 'unpublished');
  end if;
  if not v_grant.enabled or v_site.status <> 'published' or not exists (
    select 1 from public.website_domains
    where website_site_id = v_site.id and status = 'active'
  ) then
    raise exception 'The Kingdom website channel is not ready.' using errcode = '23514';
  end if;
  if v_action = 'update' and coalesce(v_existing.status, '') <> 'published' then
    raise exception 'Publish the listing to Kingdom before updating it.' using errcode = '23514';
  end if;
  select * into v_projection from public.listing_publication_data where listing_id = p_listing_id for update;
  if v_projection.id is null
    or nullif(trim(v_projection.title), '') is null
    or v_projection.listing_type not in ('Sale', 'Rental')
    or coalesce(v_projection.asking_price, 0) <= 0 then
    raise exception 'Save the completed listing details before publishing to Kingdom.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_assets) <> 'array' then
    raise exception 'Website media assets must be an array.' using errcode = '22023';
  end if;
  select count(*)::integer, count(*) filter (where media_type = 'image')::integer
  into v_expected_count, v_image_count
  from public.listing_media where listing_id = p_listing_id
    and media_type in ('image', 'floor_plan') and file_url ~* '^https://[^[:space:]]+$';
  select count(distinct asset.source_media_id)::integer into v_requested_count
  from jsonb_to_recordset(p_assets) as asset(source_media_id uuid, storage_path text, public_url text, content_type text);
  if v_image_count = 0 or v_requested_count <> v_expected_count or jsonb_array_length(p_assets) <> v_expected_count then
    raise exception 'Every listing image and floor plan needs a durable website copy.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assets) as asset(source_media_id uuid, storage_path text, public_url text, content_type text)
    left join public.listing_media media on media.id = asset.source_media_id
      and media.listing_id = p_listing_id and media.media_type in ('image', 'floor_plan')
    where media.id is null
      or asset.storage_path not like ('organisations/' || v_listing.organisation_id::text ||
        '/websites/' || v_site.id::text || '/listings/' || p_listing_id::text || '/%')
      or asset.public_url not like ('%/storage/v1/object/public/listing-media/' || asset.storage_path)
      or (asset.content_type !~ '^image/' and not (media.media_type = 'floor_plan' and asset.content_type = 'application/pdf'))
  ) then
    raise exception 'One or more website media assets are invalid.' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_media_id', media.id, 'media_type', media.media_type,
    'file_url', asset.public_url, 'storage_path', asset.storage_path,
    'caption', media.caption, 'sort_order', media.sort_order
  ) order by media.sort_order, media.id), '[]'::jsonb)
  into v_media_json
  from jsonb_to_recordset(p_assets) as asset(source_media_id uuid, storage_path text, public_url text)
  join public.listing_media media on media.id = asset.source_media_id and media.listing_id = p_listing_id;

  select nullif(trim(concat_ws(' ', coalesce(profile.first_name, member.first_name), coalesce(profile.last_name, member.last_name))), ''),
    nullif(trim(member.email), ''), nullif(trim(profile.phone_number), '')
  into v_agent_name, v_agent_email, v_agent_phone
  from public.organisation_users member
  left join public.profiles profile on profile.id = member.user_id
  where member.organisation_id = v_listing.organisation_id and member.user_id = v_listing.assigned_agent_id
    and lower(trim(coalesce(member.membership_status, member.status, ''))) = 'active'
  order by member.updated_at desc limit 1;
  if v_agent_name is null then
    select name into v_agent_name from public.organisations where id = v_listing.organisation_id;
  end if;

  insert into public.website_partner_listing_publications (
    grant_id, website_site_id, listing_id, status, publication_json, media_json,
    published_at, unpublished_at, last_synced_at, created_by, updated_by
  ) values (
    v_grant.id, v_site.id, p_listing_id, 'published',
    jsonb_strip_nulls(jsonb_build_object(
      'listing_id', p_listing_id, 'title', v_projection.title,
      'suburb', v_projection.suburb, 'province', v_projection.province,
      'property_type', v_projection.property_type, 'listing_type', v_projection.listing_type,
      'asking_price', v_projection.asking_price, 'bedrooms', v_projection.bedrooms,
      'bathrooms', v_projection.bathrooms, 'parking_bays', v_projection.parking_bays,
      'floor_size', v_projection.floor_size, 'description', v_projection.description,
      'features', v_projection.features, 'amenities', v_projection.amenities,
      'consultant_name', v_agent_name, 'consultant_email', v_agent_email,
      'consultant_phone', v_agent_phone
    )),
    v_media_json, now(), null, now(), p_actor_id, p_actor_id
  ) on conflict (website_site_id, listing_id) do update
  set grant_id = excluded.grant_id, status = 'published',
    publication_json = excluded.publication_json, media_json = excluded.media_json,
    published_at = coalesce(public.website_partner_listing_publications.published_at, excluded.published_at),
    unpublished_at = null, last_synced_at = excluded.last_synced_at, updated_by = excluded.updated_by;

  return jsonb_build_object('status', 'published', 'websiteSiteId', v_site.id);
end;
$$;

revoke all on function public.website_commit_partner_listing_publication(uuid,uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.website_commit_partner_listing_publication(uuid,uuid,text,uuid,text,jsonb) to service_role;

-- Enquiries from a partner property are kept in the source agency's CRM.
-- They use a separate receipt so Kingdom's own website lead tenant boundary
-- and notification workflow retain their existing behaviour.

create or replace function public.website_capture_partner_listing_enquiry(
  p_hostname text, p_listing_id uuid, p_name text, p_email text, p_phone text,
  p_message text, p_privacy_accepted boolean, p_marketing_consent boolean,
  p_idempotency_key text, p_request_fingerprint text, p_attribution jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hostname text := regexp_replace(regexp_replace(lower(trim(coalesce(p_hostname, ''))), ':\d+$', ''), '\.$', '');
  v_name text := left(trim(coalesce(p_name, '')), 160);
  v_email text := nullif(lower(left(trim(coalesce(p_email, '')), 254)), '');
  v_phone text := nullif(left(trim(coalesce(p_phone, '')), 64), '');
  v_phone_digits text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), '');
  v_message text := nullif(left(trim(coalesce(p_message, '')), 4000), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_fingerprint text := nullif(lower(trim(coalesce(p_request_fingerprint, ''))), '');
  v_site public.website_sites%rowtype;
  v_listing public.private_listings%rowtype;
  v_grant public.website_partner_listing_grants%rowtype;
  v_projection public.listing_publication_data%rowtype;
  v_existing public.website_partner_lead_submissions%rowtype;
  v_contact_id uuid;
  v_lead_id uuid;
  v_receipt_id uuid;
  v_agent_id uuid;
  v_agent_email text;
  v_branch_id uuid;
  v_first_name text;
  v_last_name text;
  v_payload jsonb;
begin
  if char_length(v_name) < 2 or (v_email is null and v_phone_digits is null)
    or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (v_phone_digits is not null and char_length(v_phone_digits) < 7)
    or p_privacy_accepted is not true or v_key !~ '^[A-Za-z0-9._:-]{16,128}$'
    or (v_fingerprint is not null and v_fingerprint !~ '^[a-f0-9]{64}$') then
    raise exception 'Please complete the required enquiry fields.' using errcode = '22023';
  end if;

  select site.* into v_site from public.website_domains domain
  join public.website_sites site on site.id = domain.website_site_id
  where lower(domain.hostname) = v_hostname and domain.status = 'active' and site.status = 'published'
  order by domain.is_primary desc, domain.created_at limit 1;
  if v_site.id is null then raise exception 'Published website not found.' using errcode = 'P0002'; end if;
  select listing.* into v_listing from public.private_listings listing where listing.id = p_listing_id;
  select grant_row.* into v_grant from public.website_partner_listing_grants grant_row
  where grant_row.website_site_id = v_site.id
    and grant_row.source_organisation_id = v_listing.organisation_id and grant_row.enabled = true;
  if v_listing.id is null or v_grant.id is null or not exists (
    select 1 from public.website_partner_listing_publications channel
    where channel.website_site_id = v_site.id and channel.listing_id = p_listing_id
      and channel.grant_id = v_grant.id and channel.status = 'published'
  ) then
    raise exception 'Published website listing not found.' using errcode = 'P0002';
  end if;
  select * into v_projection from public.listing_publication_data
  where listing_id = p_listing_id;
  if v_projection.id is null then raise exception 'Published website listing not found.' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_site.id::text || ':' || v_key, 0));
  select * into v_existing from public.website_partner_lead_submissions
  where website_site_id = v_site.id and idempotency_key = v_key;
  if v_existing.id is not null then
    return jsonb_build_object('accepted', v_existing.status = 'routed', 'duplicate', true,
      'rateLimited', false, 'receiptId', v_existing.id, 'leadId', v_existing.lead_id);
  end if;
  if v_fingerprint is not null and (
    (select count(*) from public.website_partner_lead_submissions
      where website_site_id = v_site.id and request_fingerprint = v_fingerprint
        and created_at >= v_now - interval '10 minutes')
    + (select count(*) from public.website_lead_submissions
      where website_site_id = v_site.id and request_fingerprint = v_fingerprint
        and created_at >= v_now - interval '10 minutes')
  ) >= 5 then
    return jsonb_build_object('accepted', false, 'duplicate', false, 'rateLimited', true);
  end if;

  select member.user_id, lower(trim(member.email)), member.branch_id
  into v_agent_id, v_agent_email, v_branch_id
  from public.organisation_users member
  where member.organisation_id = v_listing.organisation_id
    and member.user_id = v_listing.assigned_agent_id
    and lower(trim(coalesce(member.membership_status, member.status, ''))) = 'active'
  order by member.updated_at desc limit 1;
  if v_agent_id is null then
    select member.user_id, lower(trim(member.email)), member.branch_id
    into v_agent_id, v_agent_email, v_branch_id
    from public.organisation_users member
    where member.organisation_id = v_listing.organisation_id
      and lower(trim(coalesce(member.membership_status, member.status, ''))) = 'active'
      and member.role in ('principal', 'admin', 'branch_manager', 'super_admin')
    order by case member.role when 'principal' then 0 when 'admin' then 1 when 'branch_manager' then 2 else 3 end,
      member.updated_at desc limit 1;
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'name', v_name, 'email', v_email, 'phone', v_phone, 'message', v_message,
    'privacyAccepted', true, 'marketingConsent', p_marketing_consent is true,
    'listingId', p_listing_id, 'sourceWebsite', v_hostname
  ));
  insert into public.website_partner_lead_submissions (
    grant_id, website_site_id, source_organisation_id, listing_id,
    idempotency_key, request_fingerprint, payload_json, attribution_json, status
  ) values (
    v_grant.id, v_site.id, v_listing.organisation_id, p_listing_id,
    v_key, v_fingerprint, v_payload, coalesce(p_attribution, '{}'::jsonb), 'received'
  ) returning id into v_receipt_id;

  v_first_name := split_part(v_name, ' ', 1);
  v_last_name := nullif(trim(substr(v_name, char_length(v_first_name) + 1)), '');
  perform pg_advisory_xact_lock(hashtextextended(v_listing.organisation_id::text || ':' ||
    coalesce(v_email, '') || ':' || coalesce(v_phone_digits, ''), 0));
  select contact.contact_id into v_contact_id from public.contacts contact
  where contact.organisation_id = v_listing.organisation_id
    and ((v_email is not null and lower(trim(contact.email)) = v_email)
      or (v_phone_digits is not null and regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = v_phone_digits))
  order by case when v_email is not null and lower(trim(contact.email)) = v_email then 0 else 1 end,
    contact.updated_at desc nulls last, contact.created_at desc limit 1;
  if v_contact_id is null then
    insert into public.contacts (organisation_id, assigned_agent_id, first_name, last_name,
      email, phone, contact_type, notes)
    values (v_listing.organisation_id, v_agent_id, v_first_name, v_last_name,
      v_email, v_phone, 'buyer', v_message)
    returning contact_id into v_contact_id;
  else
    update public.contacts set email = coalesce(email, v_email), phone = coalesce(phone, v_phone),
      assigned_agent_id = coalesce(assigned_agent_id, v_agent_id), updated_at = v_now
    where contact_id = v_contact_id;
  end if;

  insert into public.leads (
    organisation_id, branch_id, assigned_agent_id, assigned_user_id, assigned_agent_email,
    contact_id, lead_domain, lead_category, lead_direction, lead_source, source_channel,
    stage, status, priority, ownership_status, assigned_at, sla_due_at,
    listing_id, enquired_listing_id, enquired_property_title, enquired_property_address,
    enquired_property_price, source_reference_id, raw_enquiry_payload, notes
  ) values (
    v_listing.organisation_id, v_branch_id, v_agent_id, v_agent_id, v_agent_email,
    v_contact_id, 'agency', 'buyer', 'Inbound', 'Website', 'website',
    'New Lead', 'New Lead', 'High',
    case when v_agent_id is null then 'awaiting_assignment' else 'assigned' end,
    case when v_agent_id is null then null else v_now end, v_now + interval '15 minutes',
    p_listing_id, p_listing_id, v_projection.title, v_projection.address,
    v_projection.asking_price, v_key,
    v_payload || jsonb_build_object('attribution', coalesce(p_attribution, '{}'::jsonb),
      'kingdomWebsiteSiteId', v_site.id, 'partnerWebsiteSubmissionId', v_receipt_id), v_message
  ) returning lead_id into v_lead_id;

  insert into public.lead_activities (organisation_id, lead_id, agent_id, activity_type,
    activity_note, activity_date, outcome)
  values (v_listing.organisation_id, v_lead_id, v_agent_id, 'Lead Created',
    'Kingdom website listing enquiry received', v_now, 'New');
  update public.website_partner_lead_submissions
  set contact_id = v_contact_id, lead_id = v_lead_id, status = 'routed', routed_at = v_now
  where id = v_receipt_id;

  return jsonb_build_object('accepted', true, 'duplicate', false, 'rateLimited', false,
    'receiptId', v_receipt_id, 'leadId', v_lead_id);
end;
$$;

revoke all on function public.website_capture_partner_listing_enquiry(text,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.website_capture_partner_listing_enquiry(text,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
