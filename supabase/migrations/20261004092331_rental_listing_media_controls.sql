begin;

-- Extend the phase 1 transaction without changing its entry point for older clients.
-- Edit only the selected video/tour. Other media and external links remain intact.
create or replace function public.save_rental_listing_media_snapshot(
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
  v_receipt jsonb;
  v_edit jsonb;
  v_type text;
  v_field text;
  v_url text;
  v_id uuid;
  v_seen text[] := array[]::text[];
begin
  -- The underlying save authenticates, enforces organisation/RLS and locks the
  -- listing against stale edits. All later failures roll that save back too.
  v_receipt := public.save_rental_listing_snapshot(p_listing_id, p_expected_updated_at,
    p_listing_patch, p_publication, p_gallery, p_cover_index);
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
  return v_receipt || jsonb_build_object('media',coalesce((
    select jsonb_agg(to_jsonb(m) order by m.media_type,m.sort_order,m.id)
    from public.listing_media m where m.listing_id=p_listing_id),'[]'::jsonb));
end;
$function$;

revoke all on function public.save_rental_listing_media_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb) from public, anon;
grant execute on function public.save_rental_listing_media_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb) to authenticated;

-- Photo-only controls retain incomplete legacy facts and publication data verbatim.
create or replace function public.save_rental_listing_gallery(
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
      where listing_id = p_listing_id and media_type = 'image' and file_url = v_item->>'url'
      order by sort_order, id limit 1;
    end if;
    v_id := coalesce(v_existing.id, v_id, gen_random_uuid());
    if exists(select 1 from jsonb_array_elements(v_images) x where (x->>'id')::uuid = v_id) then
      raise exception 'The gallery contains a duplicate photo.' using errcode = '22023';
    end if;
    v_images := v_images || jsonb_build_array(jsonb_build_object(
      'id',v_id,'url',v_item->>'url','caption',coalesce(v_item->>'label',v_item->>'name'),
      'sort_order',v_index,'is_cover',v_index = p_cover_index));
    v_index := v_index + 1;
  end loop;

  -- Only gallery images are editable here. Videos, tours, plans and external links remain intact.
  delete from public.listing_media where listing_id=p_listing_id and media_type='image'
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(v_images));
  for v_item in select value from jsonb_array_elements(v_images) loop
    insert into public.listing_media(id,listing_id,media_type,file_url,caption,sort_order,is_cover)
    values((v_item->>'id')::uuid,p_listing_id,'image',v_item->>'url',v_item->>'caption',
      (v_item->>'sort_order')::integer,(v_item->>'is_cover')::boolean)
    on conflict(id) do update set file_url=excluded.file_url,caption=excluded.caption,sort_order=excluded.sort_order,
      is_cover=excluded.is_cover,updated_at=clock_timestamp()
    where listing_media.listing_id=p_listing_id and listing_media.media_type='image';
    if not found then raise exception 'Photo update was denied.' using errcode='42501'; end if;
  end loop;
  if (select count(*) from public.listing_media where listing_id=p_listing_id and media_type='image') <> jsonb_array_length(v_images) then
    raise exception 'The selected photos could not all be saved or removed.' using errcode='42501';
  end if;
  update public.private_listings set updated_at=clock_timestamp() where id=p_listing_id returning * into v_listing;
  if not found then raise exception 'Photo update was denied.' using errcode='42501'; end if;
  return jsonb_build_object('listingId',v_listing.id,'updatedAt',v_listing.updated_at,
    'facts',coalesce(v_listing.seller_canonical_facts_json,'{}'::jsonb),
    'publication',(select to_jsonb(p) from public.listing_publication_data p where p.listing_id=p_listing_id),
    'media',coalesce((select jsonb_agg(to_jsonb(m) order by m.media_type,m.sort_order,m.id) from public.listing_media m where m.listing_id=p_listing_id),'[]'::jsonb),
    'externalLinks',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.listing_external_links x where x.listing_id=p_listing_id),'[]'::jsonb));
end;
$gallery$;
revoke all on function public.save_rental_listing_gallery(uuid,timestamptz,jsonb,integer) from public, anon;
grant execute on function public.save_rental_listing_gallery(uuid,timestamptz,jsonb,integer) to authenticated;

commit;
