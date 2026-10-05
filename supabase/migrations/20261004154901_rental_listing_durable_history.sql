begin;

-- The activity insert participates in the save transaction. No exception is swallowed,
-- and invoker security preserves the existing listing/activity/media RLS policies.
create or replace function public.rental_listing_history_snapshot(p_listing_id uuid)
returns jsonb language sql security invoker set search_path = '' as $snapshot$
 select jsonb_build_object('listingId',p.id,'updatedAt',p.updated_at,
   'details',jsonb_build_object('title',p.title,'address',p.formatted_address,'rent',p.asking_price,
     'description',p.description,'status',p.listing_status,'visibility',p.listing_visibility),
   'facts',p.seller_canonical_facts_json,
   'publication',(select to_jsonb(d) from public.listing_publication_data d where d.listing_id=p.id),
   'media',coalesce((select jsonb_agg(to_jsonb(m) order by m.media_type,m.sort_order,m.id) from public.listing_media m where m.listing_id=p.id),'[]'::jsonb),
   'externalLinks',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.listing_external_links l where l.listing_id=p.id),'[]'::jsonb))
 from public.private_listings p where p.id=p_listing_id and p.listing_category='rental';
$snapshot$;
revoke all on function public.rental_listing_history_snapshot(uuid) from public,anon;
grant execute on function public.rental_listing_history_snapshot(uuid) to authenticated;

create or replace function public.record_rental_listing_change(p_listing_id uuid,p_before jsonb,p_operation text)
returns uuid language plpgsql security invoker set search_path = '' as $history$
declare v_after jsonb; v_id uuid;
begin
 if auth.uid() is null or p_before->>'listingId' is distinct from p_listing_id::text then
   raise exception 'Rental history requires an authenticated listing save.' using errcode='42501';
 end if;
 v_after := public.rental_listing_history_snapshot(p_listing_id);
 if v_after is null then raise exception 'Rental history is unavailable.' using errcode='42501'; end if;
 insert into public.private_listing_activity(private_listing_id,activity_type,activity_title,activity_description,performed_by,visibility,metadata)
 values(p_listing_id,case when p_operation='gallery' then 'rental_listing_gallery_updated' else 'rental_listing_updated' end,
   case when p_operation='gallery' then 'Rental photos saved' else 'Rental listing saved' end,
   'Before and after values were recorded with this save.',auth.uid(),'internal',
   jsonb_build_object('schemaVersion',1,'source','rental_atomic_save','operation',p_operation,'before',p_before,'after',v_after))
 returning id into v_id;
 return v_id;
end;
$history$;
revoke all on function public.record_rental_listing_change(uuid,jsonb,text) from public,anon;
grant execute on function public.record_rental_listing_change(uuid,jsonb,text) to authenticated;

create or replace function public.save_rental_listing_snapshot_v2(
  p_listing_id uuid,
  p_expected_updated_at timestamptz,
  p_listing_patch jsonb,
  p_publication jsonb,
  p_gallery jsonb,
  p_cover_index integer,
  p_media_edits jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_listing public.private_listings%rowtype;
  v_patch public.private_listings%rowtype;
  v_publication public.listing_publication_data%rowtype;
  v_images jsonb := '[]'::jsonb;
  v_item jsonb;
  v_id uuid;
  v_existing public.listing_media%rowtype;
  v_index integer := 0;
  v_bucket text;
  v_path text;
  v_status text;
  v_before jsonb;
  v_activity_id uuid;
  v_edit jsonb;
  v_type text;
  v_field text;
  v_url text;
  v_seen text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in before saving a rental listing.' using errcode = '42501';
  end if;
  select * into v_listing from public.private_listings where id = p_listing_id for update;
  if not found or not public.bridge_is_active_member(v_listing.organisation_id) then
    raise exception 'Rental listing is unavailable or outside your organisation.' using errcode = '42501';
  end if;
  if v_listing.listing_category <> 'rental' or v_listing.listing_visibility = 'archived' or v_listing.listing_status = 'withdrawn' then
    raise exception 'Only an available rental listing can be saved.' using errcode = '22023';
  end if;
  if p_expected_updated_at is null or v_listing.updated_at is distinct from p_expected_updated_at then
    raise exception 'This rental changed after it was opened. Reload before saving.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_listing_patch) is distinct from 'object' or jsonb_typeof(p_publication) is distinct from 'object'
     or jsonb_typeof(p_gallery) is distinct from 'array' then
    raise exception 'Rental save data is invalid.' using errcode = '22023';
  end if;
  if (jsonb_array_length(p_gallery) = 0 and p_cover_index is not null)
     or (jsonb_array_length(p_gallery) > 0 and (p_cover_index is null or p_cover_index < 0 or p_cover_index >= jsonb_array_length(p_gallery))) then
    raise exception 'Select a cover from the saved photo gallery.' using errcode = '22023';
  end if;
  v_before := public.rental_listing_history_snapshot(p_listing_id);
  -- Validate the complete replacement before changing any rows. Preserve durable
  -- IDs for retained images (including retrying uploads by their saved URL).
  for v_item in select value from jsonb_array_elements(p_gallery) loop
    if nullif(btrim(v_item->>'url'), '') is null or (v_item->>'url') !~* '^https://[^[:space:]]+$' then
      raise exception 'Every photo needs a saved HTTPS URL.' using errcode = '22023';
    end if;
    v_existing := null;
    v_id := null;
    if coalesce(v_item->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id := (v_item->>'id')::uuid;
      select * into v_existing from public.listing_media where id = v_id;
      if v_existing.id is not null and (v_existing.listing_id <> p_listing_id or v_existing.media_type <> 'image') then
        raise exception 'A photo belongs to another listing or media type.' using errcode = '42501';
      end if;
    end if;
    if v_existing.id is null then
      select * into v_existing from public.listing_media
      where listing_id = p_listing_id and media_type = 'image' and (file_url = v_item->>'url' or (storage_bucket = nullif(v_item->>'bucket','') and storage_path = nullif(v_item->>'path','')))
      order by sort_order, id limit 1;
    end if;
    v_id := coalesce(v_existing.id, v_id, gen_random_uuid());
    if exists(select 1 from jsonb_array_elements(v_images) x where (x->>'id')::uuid = v_id) then
      raise exception 'The gallery contains a duplicate photo.' using errcode = '22023';
    end if;
    v_bucket := coalesce(nullif(btrim(v_item->>'bucket'),''), v_existing.storage_bucket);
    v_path := coalesce(nullif(btrim(v_item->>'path'),''), v_existing.storage_path);
    if (v_bucket is null) <> (v_path is null) then
      raise exception 'A photo needs both its storage bucket and path.' using errcode='22023';
    end if;
    -- Retain existing imported/public identities; validate newly attached objects.
    if v_path is not null and (v_existing.storage_bucket is distinct from v_bucket
      or v_existing.storage_path is distinct from v_path) and (v_path not like 'private-listings/' || p_listing_id::text || '/%'
      or v_path ~ '(^|/)(\.\.?)(/|$)' or not exists(
        select 1 from storage.objects where bucket_id=v_bucket and name=v_path)) then
      raise exception 'The photo storage object is unavailable for this listing.' using errcode='42501';
    end if;
    v_images := v_images || jsonb_build_array(jsonb_build_object(
      'id',v_id,'url',v_item->>'url','storage_bucket',v_bucket,'storage_path',v_path,'caption',coalesce(v_item->>'label',v_item->>'name'),
      'sort_order',v_index,'is_cover',v_index = p_cover_index));
    v_index := v_index + 1;
  end loop;

  select * into v_patch from jsonb_populate_record(null::public.private_listings,
    jsonb_build_object(
      'title', p_listing_patch->'title',
      'property_category', p_listing_patch->'propertyCategory',
      'property_type', p_listing_patch->'propertyType',
      'listing_category', p_listing_patch->'listingCategory',
      'asking_price', p_listing_patch->'askingPrice',
      'estimated_value', p_listing_patch->'estimatedValue',
      'address_line_1', p_listing_patch->'addressLine1',
      'formatted_address', p_listing_patch->'formattedAddress',
      'street_address', p_listing_patch->'streetAddress',
      'street_number', p_listing_patch->'streetNumber',
      'street_name', p_listing_patch->'streetName',
      'suburb', p_listing_patch->'suburb',
      'city', p_listing_patch->'city',
      'province', p_listing_patch->'province',
      'postal_code', p_listing_patch->'postalCode',
      'country', p_listing_patch->'country',
      'latitude', p_listing_patch->'latitude',
      'longitude', p_listing_patch->'longitude',
      'google_place_id', p_listing_patch->'googlePlaceId',
      'description', p_listing_patch->'description',
      'internal_listing_notes', p_listing_patch->'internalListingNotes',
      'listing_preview_description', p_listing_patch->'listingPreviewDescription',
      'seller_type', p_listing_patch->'sellerType',
      'mandate_type', p_listing_patch->'mandateType',
      'mandate_status', p_listing_patch->'mandateStatus',
      'seller_canonical_facts_json', p_listing_patch->'sellerCanonicalFacts',
      'seller_canonical_fact_readiness_json', p_listing_patch->'sellerCanonicalFactReadiness'));
  if v_patch.listing_category is distinct from 'rental' or jsonb_typeof(v_patch.seller_canonical_facts_json) is distinct from 'object' then
    raise exception 'Rental facts are required.' using errcode = '22023';
  end if;
  if nullif(v_patch.seller_canonical_facts_json #>> '{rentalInfo,property24ExpiryDate}', '') is not null then
    perform (v_patch.seller_canonical_facts_json #>> '{rentalInfo,property24ExpiryDate}')::date;
  end if;
  update public.private_listings set
    title = v_patch.title,
    property_category = v_patch.property_category,
    property_type = v_patch.property_type,
    listing_category = v_patch.listing_category,
    asking_price = v_patch.asking_price,
    estimated_value = v_patch.estimated_value,
    address_line_1 = v_patch.address_line_1,
    formatted_address = v_patch.formatted_address,
    street_address = v_patch.street_address,
    street_number = v_patch.street_number,
    street_name = v_patch.street_name,
    suburb = v_patch.suburb,
    city = v_patch.city,
    province = v_patch.province,
    postal_code = v_patch.postal_code,
    country = v_patch.country,
    latitude = v_patch.latitude,
    longitude = v_patch.longitude,
    google_place_id = v_patch.google_place_id,
    description = v_patch.description,
    internal_listing_notes = v_patch.internal_listing_notes,
    listing_preview_description = v_patch.listing_preview_description,
    seller_type = v_patch.seller_type,
    mandate_type = v_patch.mandate_type,
    mandate_status = v_patch.mandate_status,
    seller_canonical_facts_json = v_patch.seller_canonical_facts_json,
    seller_canonical_fact_readiness_json = v_patch.seller_canonical_fact_readiness_json,
    seller_canonical_facts_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = p_listing_id returning * into v_listing;
  if not found then
    raise exception 'Rental listing update was denied.' using errcode = '42501';
  end if;

  select * into v_publication from public.listing_publication_data where listing_id = p_listing_id;
  v_status := coalesce(nullif(p_publication->>'status',''),'Draft');
  -- Editing saved facts must not silently take an already published projection offline.
  if v_publication.status = 'Published' and v_status in ('Draft','Ready') then v_status := 'Published'; end if;
  insert into public.listing_publication_data(listing_id,title,address,suburb,province,property_type,listing_type,
    asking_price,bedrooms,bathrooms,garages,parking_bays,floor_size,erf_size,description,features,amenities,status)
  values(p_listing_id,p_publication->>'title',p_publication->>'address',p_publication->>'suburb',p_publication->>'province',
    p_publication->>'propertyType','Rental',nullif(p_publication->>'askingPrice','')::numeric,
    nullif(p_publication->>'bedrooms','')::integer,nullif(p_publication->>'bathrooms','')::numeric,
    nullif(p_publication->>'garages','')::integer,nullif(p_publication->>'parkingBays','')::integer,
    nullif(p_publication->>'floorSize','')::numeric,nullif(p_publication->>'erfSize','')::numeric,
    p_publication->>'description',coalesce(p_publication->'features','[]'::jsonb),coalesce(p_publication->'amenities','[]'::jsonb),v_status)
  on conflict(listing_id) do update set title=excluded.title,address=excluded.address,suburb=excluded.suburb,
    province=excluded.province,property_type=excluded.property_type,listing_type=excluded.listing_type,
    asking_price=excluded.asking_price,bedrooms=excluded.bedrooms,bathrooms=excluded.bathrooms,garages=excluded.garages,
    parking_bays=excluded.parking_bays,floor_size=excluded.floor_size,erf_size=excluded.erf_size,description=excluded.description,
    features=excluded.features,amenities=excluded.amenities,status=excluded.status,updated_at=clock_timestamp()
  returning * into v_publication;

  -- Only gallery images are editable here. Videos, tours, plans and external links remain intact.
  delete from public.listing_media where listing_id=p_listing_id and media_type='image'
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(v_images));
  for v_item in select value from jsonb_array_elements(v_images) loop
    insert into public.listing_media(id,listing_id,media_type,file_url,caption,sort_order,is_cover,storage_bucket,storage_path)
    values((v_item->>'id')::uuid,p_listing_id,'image',v_item->>'url',v_item->>'caption',
      (v_item->>'sort_order')::integer,(v_item->>'is_cover')::boolean,v_item->>'storage_bucket',v_item->>'storage_path')
    on conflict(id) do update set storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,file_url=excluded.file_url,caption=excluded.caption,sort_order=excluded.sort_order,
      is_cover=excluded.is_cover,updated_at=clock_timestamp()
    where listing_media.listing_id=p_listing_id and listing_media.media_type='image';
    if not found then raise exception 'Photo update was denied.' using errcode='42501'; end if;
  end loop;
  if (select count(*) from public.listing_media where listing_id=p_listing_id and media_type='image') <> jsonb_array_length(v_images) then
    raise exception 'The selected photos could not all be saved or removed.' using errcode='42501';
  end if;
  if jsonb_typeof(p_media_edits) is distinct from 'array' or jsonb_array_length(p_media_edits) > 2 then
    raise exception 'Rental video and tour edits are invalid.' using errcode='22023';
  end if;
  for v_edit in select value from jsonb_array_elements(p_media_edits) loop
    v_type := v_edit->>'type';
    if v_type is null or v_type not in ('video','virtual_tour') or v_type = any(v_seen) then
      raise exception 'Choose one video and one virtual tour to edit.' using errcode='22023';
    end if;
    v_seen := array_append(v_seen, v_type);
    v_field := case v_type when 'video' then 'videoLink' else 'virtualTourLink' end;
    v_url := btrim(coalesce(v_edit->>'url',''));
    if v_url <> '' and (v_url !~* '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$') then
      raise exception 'Video and tour links must be valid HTTP or HTTPS URLs.' using errcode='22023';
    end if;
    if v_url is distinct from p_listing_patch #>> array['sellerCanonicalFacts','marketingMedia',v_field] then
      raise exception 'The media links do not match the saved rental facts.' using errcode='22023';
    end if;
    v_id := nullif(v_edit->>'id','')::uuid;
    if v_id is not null then
      perform 1 from public.listing_media where id=v_id and listing_id=p_listing_id and media_type=v_type for update;
      if not found then
        raise exception 'This video or tour is unavailable for this listing. Reload before editing.' using errcode='42501';
      end if;
      if v_url = '' then
        delete from public.listing_media where id=v_id and listing_id=p_listing_id and media_type=v_type;
      else
        update public.listing_media set file_url=v_url, updated_at=clock_timestamp()
          where id=v_id and listing_id=p_listing_id and media_type=v_type;
      end if;
      if not found then raise exception 'Video or tour update was denied.' using errcode='42501'; end if;
    elsif v_url <> '' then
      -- A retry must reuse an already stored URL rather than add a duplicate.
      select id into v_id from public.listing_media
        where listing_id=p_listing_id and media_type=v_type and file_url=v_url order by sort_order,id limit 1;
      if v_id is null then
        insert into public.listing_media(listing_id,media_type,file_url,caption,sort_order,is_cover)
          values(p_listing_id,v_type,v_url,case v_type when 'video' then 'Video' else 'Virtual tour' end,0,false);
      end if;
    end if;
  end loop;
  v_activity_id := public.record_rental_listing_change(p_listing_id,v_before,'details_media');
  return jsonb_build_object('activityId',v_activity_id,'listingId',v_listing.id,'updatedAt',v_listing.updated_at,
    'facts',v_listing.seller_canonical_facts_json,'publication',to_jsonb(v_publication),
    'media',coalesce((select jsonb_agg(to_jsonb(m) order by m.media_type,m.sort_order,m.id) from public.listing_media m where m.listing_id=p_listing_id),'[]'::jsonb),
    'externalLinks',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.listing_external_links x where x.listing_id=p_listing_id),'[]'::jsonb));
end;
$function$;

revoke all on function public.save_rental_listing_snapshot_v2(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb) from public, anon;
grant execute on function public.save_rental_listing_snapshot_v2(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb) to authenticated;

create or replace function public.save_rental_listing_gallery_v2(
  p_listing_id uuid, p_expected_updated_at timestamptz, p_gallery jsonb, p_cover_index integer
) returns jsonb
language plpgsql security invoker set search_path = ''
as $gallery$
declare
  v_listing public.private_listings%rowtype;
  v_images jsonb := '[]'::jsonb;
  v_item jsonb;
  v_id uuid;
  v_existing public.listing_media%rowtype;
  v_index integer := 0;
  v_bucket text;
  v_path text;
  v_before jsonb;
  v_activity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before saving a rental listing.' using errcode = '42501';
  end if;
  select * into v_listing from public.private_listings where id = p_listing_id for update;
  if not found or not public.bridge_is_active_member(v_listing.organisation_id) then
    raise exception 'Rental listing is unavailable or outside your organisation.' using errcode = '42501';
  end if;
  if v_listing.listing_category <> 'rental' or v_listing.listing_visibility = 'archived' or v_listing.listing_status = 'withdrawn' then
    raise exception 'Only an available rental listing can be saved.' using errcode = '22023';
  end if;
  if p_expected_updated_at is null or v_listing.updated_at is distinct from p_expected_updated_at then
    raise exception 'This rental changed after it was opened. Reload before saving.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_gallery) is distinct from 'array' then
    raise exception 'Rental save data is invalid.' using errcode = '22023';
  end if;
  if (jsonb_array_length(p_gallery) = 0 and p_cover_index is not null)
     or (jsonb_array_length(p_gallery) > 0 and (p_cover_index is null or p_cover_index < 0 or p_cover_index >= jsonb_array_length(p_gallery))) then
    raise exception 'Select a cover from the saved photo gallery.' using errcode = '22023';
  end if;
  v_before := public.rental_listing_history_snapshot(p_listing_id);
  -- Validate the complete replacement before changing any rows. Preserve durable
  -- IDs for retained images (including retrying uploads by their saved URL).
  for v_item in select value from jsonb_array_elements(p_gallery) loop
    if nullif(btrim(v_item->>'url'), '') is null or (v_item->>'url') !~* '^https://[^[:space:]]+$' then
      raise exception 'Every photo needs a saved HTTPS URL.' using errcode = '22023';
    end if;
    v_existing := null;
    v_id := null;
    if coalesce(v_item->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id := (v_item->>'id')::uuid;
      select * into v_existing from public.listing_media where id = v_id;
      if v_existing.id is not null and (v_existing.listing_id <> p_listing_id or v_existing.media_type <> 'image') then
        raise exception 'A photo belongs to another listing or media type.' using errcode = '42501';
      end if;
    end if;
    if v_existing.id is null then
      select * into v_existing from public.listing_media
      where listing_id = p_listing_id and media_type = 'image' and (file_url = v_item->>'url' or (storage_bucket = nullif(v_item->>'bucket','') and storage_path = nullif(v_item->>'path','')))
      order by sort_order, id limit 1;
    end if;
    v_id := coalesce(v_existing.id, v_id, gen_random_uuid());
    if exists(select 1 from jsonb_array_elements(v_images) x where (x->>'id')::uuid = v_id) then
      raise exception 'The gallery contains a duplicate photo.' using errcode = '22023';
    end if;
    v_bucket := coalesce(nullif(btrim(v_item->>'bucket'),''), v_existing.storage_bucket);
    v_path := coalesce(nullif(btrim(v_item->>'path'),''), v_existing.storage_path);
    if (v_bucket is null) <> (v_path is null) then
      raise exception 'A photo needs both its storage bucket and path.' using errcode='22023';
    end if;
    -- Retain existing imported/public identities; validate newly attached objects.
    if v_path is not null and (v_existing.storage_bucket is distinct from v_bucket
      or v_existing.storage_path is distinct from v_path) and (v_path not like 'private-listings/' || p_listing_id::text || '/%'
      or v_path ~ '(^|/)(\.\.?)(/|$)' or not exists(
        select 1 from storage.objects where bucket_id=v_bucket and name=v_path)) then
      raise exception 'The photo storage object is unavailable for this listing.' using errcode='42501';
    end if;
    v_images := v_images || jsonb_build_array(jsonb_build_object(
      'id',v_id,'url',v_item->>'url','storage_bucket',v_bucket,'storage_path',v_path,'caption',coalesce(v_item->>'label',v_item->>'name'),
      'sort_order',v_index,'is_cover',v_index = p_cover_index));
    v_index := v_index + 1;
  end loop;

  -- Only gallery images are editable here. Videos, tours, plans and external links remain intact.
  delete from public.listing_media where listing_id=p_listing_id and media_type='image'
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(v_images));
  for v_item in select value from jsonb_array_elements(v_images) loop
    insert into public.listing_media(id,listing_id,media_type,file_url,caption,sort_order,is_cover,storage_bucket,storage_path)
    values((v_item->>'id')::uuid,p_listing_id,'image',v_item->>'url',v_item->>'caption',
      (v_item->>'sort_order')::integer,(v_item->>'is_cover')::boolean,v_item->>'storage_bucket',v_item->>'storage_path')
    on conflict(id) do update set storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,file_url=excluded.file_url,caption=excluded.caption,sort_order=excluded.sort_order,
      is_cover=excluded.is_cover,updated_at=clock_timestamp()
    where listing_media.listing_id=p_listing_id and listing_media.media_type='image';
    if not found then raise exception 'Photo update was denied.' using errcode='42501'; end if;
  end loop;
  if (select count(*) from public.listing_media where listing_id=p_listing_id and media_type='image') <> jsonb_array_length(v_images) then
    raise exception 'The selected photos could not all be saved or removed.' using errcode='42501';
  end if;
  update public.private_listings set updated_at=clock_timestamp() where id=p_listing_id returning * into v_listing;
  if not found then raise exception 'Photo update was denied.' using errcode='42501'; end if;
  v_activity_id := public.record_rental_listing_change(p_listing_id,v_before,'gallery');
  return jsonb_build_object('activityId',v_activity_id,'listingId',v_listing.id,'updatedAt',v_listing.updated_at,
    'facts',coalesce(v_listing.seller_canonical_facts_json,'{}'::jsonb),
    'publication',(select to_jsonb(p) from public.listing_publication_data p where p.listing_id=p_listing_id),
    'media',coalesce((select jsonb_agg(to_jsonb(m) order by m.media_type,m.sort_order,m.id) from public.listing_media m where m.listing_id=p_listing_id),'[]'::jsonb),
    'externalLinks',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.listing_external_links x where x.listing_id=p_listing_id),'[]'::jsonb));
end;
$gallery$;
revoke all on function public.save_rental_listing_gallery_v2(uuid,timestamptz,jsonb,integer) from public, anon;
grant execute on function public.save_rental_listing_gallery_v2(uuid,timestamptz,jsonb,integer) to authenticated;

-- Existing clients receive the same transaction guarantees. New clients use v2
-- entry points so a missing migration fails before any write.
create or replace function public.save_rental_listing_snapshot(p_listing_id uuid,p_expected_updated_at timestamptz,p_listing_patch jsonb,p_publication jsonb,p_gallery jsonb,p_cover_index integer) returns jsonb
language sql security invoker set search_path = '' as $wrapper$ select public.save_rental_listing_snapshot_v2(p_listing_id,p_expected_updated_at,p_listing_patch,p_publication,p_gallery,p_cover_index,'[]'::jsonb); $wrapper$;
revoke all on function public.save_rental_listing_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function public.save_rental_listing_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer) to authenticated;
create or replace function public.save_rental_listing_media_snapshot(p_listing_id uuid,p_expected_updated_at timestamptz,p_listing_patch jsonb,p_publication jsonb,p_gallery jsonb,p_cover_index integer,p_media_edits jsonb) returns jsonb
language sql security invoker set search_path = '' as $wrapper$ select public.save_rental_listing_snapshot_v2(p_listing_id,p_expected_updated_at,p_listing_patch,p_publication,p_gallery,p_cover_index,p_media_edits); $wrapper$;
revoke all on function public.save_rental_listing_media_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb) from public,anon;
grant execute on function public.save_rental_listing_media_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb) to authenticated;
create or replace function public.save_rental_listing_gallery(p_listing_id uuid,p_expected_updated_at timestamptz,p_gallery jsonb,p_cover_index integer) returns jsonb
language sql security invoker set search_path = '' as $wrapper$ select public.save_rental_listing_gallery_v2(p_listing_id,p_expected_updated_at,p_gallery,p_cover_index); $wrapper$;
revoke all on function public.save_rental_listing_gallery(uuid,timestamptz,jsonb,integer) from public,anon;
grant execute on function public.save_rental_listing_gallery(uuid,timestamptz,jsonb,integer) to authenticated;

commit;
