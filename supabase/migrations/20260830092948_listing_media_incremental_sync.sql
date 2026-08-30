begin;

create or replace function public.bridge_sync_listing_media_v2(
  p_listing_id uuid,
  p_media jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_retained_ids uuid[] := '{}'::uuid[];
  v_inserted integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
begin
  if p_listing_id is null then raise exception 'Listing id is required.'; end if;
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then raise exception 'Media payload must be an array.'; end if;

  -- This SELECT and all following mutations remain subject to the caller's RLS.
  if not exists (select 1 from public.private_listings where id = p_listing_id) then
    raise exception 'Listing is unavailable.' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    v_id := null;
    begin
      v_id := nullif(trim(v_item ->> 'id'), '')::uuid;
    exception when invalid_text_representation then
      v_id := null;
    end;

    if v_id is not null then
      select id into v_id from public.listing_media where id = v_id and listing_id = p_listing_id;
    end if;
    if v_id is null and nullif(trim(v_item ->> 'storage_bucket'), '') is not null and nullif(trim(v_item ->> 'storage_path'), '') is not null then
      select id into v_id
      from public.listing_media
      where listing_id = p_listing_id
        and storage_bucket = trim(v_item ->> 'storage_bucket')
        and storage_path = trim(v_item ->> 'storage_path')
      order by created_at
      limit 1;
    end if;
    if v_id is null then
      select id into v_id
      from public.listing_media
      where listing_id = p_listing_id
        and media_type = coalesce(nullif(trim(v_item ->> 'media_type'), ''), 'other')
        and file_url = coalesce(v_item ->> 'file_url', '')
      order by created_at
      limit 1;
    end if;

    if v_id is null then
      insert into public.listing_media (
        listing_id, media_type, file_url, storage_bucket, storage_path, content_type,
        byte_size, width, height, checksum, processing_status, caption, sort_order, is_cover
      ) values (
        p_listing_id,
        coalesce(nullif(trim(v_item ->> 'media_type'), ''), 'other'),
        coalesce(v_item ->> 'file_url', ''),
        nullif(trim(v_item ->> 'storage_bucket'), ''),
        nullif(trim(v_item ->> 'storage_path'), ''),
        nullif(trim(v_item ->> 'content_type'), ''),
        nullif(v_item ->> 'byte_size', '')::bigint,
        nullif(v_item ->> 'width', '')::integer,
        nullif(v_item ->> 'height', '')::integer,
        nullif(trim(v_item ->> 'checksum'), ''),
        coalesce(nullif(trim(v_item ->> 'processing_status'), ''), 'ready'),
        nullif(trim(v_item ->> 'caption'), ''),
        coalesce((v_item ->> 'sort_order')::integer, 0),
        coalesce((v_item ->> 'is_cover')::boolean, false)
      ) returning id into v_id;
      v_inserted := v_inserted + 1;
    else
      update public.listing_media set
        media_type = coalesce(nullif(trim(v_item ->> 'media_type'), ''), media_type),
        file_url = coalesce(v_item ->> 'file_url', file_url),
        storage_bucket = coalesce(nullif(trim(v_item ->> 'storage_bucket'), ''), storage_bucket),
        storage_path = coalesce(nullif(trim(v_item ->> 'storage_path'), ''), storage_path),
        content_type = coalesce(nullif(trim(v_item ->> 'content_type'), ''), content_type),
        byte_size = coalesce(nullif(v_item ->> 'byte_size', '')::bigint, byte_size),
        width = coalesce(nullif(v_item ->> 'width', '')::integer, width),
        height = coalesce(nullif(v_item ->> 'height', '')::integer, height),
        checksum = coalesce(nullif(trim(v_item ->> 'checksum'), ''), checksum),
        processing_status = coalesce(nullif(trim(v_item ->> 'processing_status'), ''), processing_status),
        caption = nullif(trim(v_item ->> 'caption'), ''),
        sort_order = coalesce((v_item ->> 'sort_order')::integer, sort_order),
        is_cover = coalesce((v_item ->> 'is_cover')::boolean, false),
        updated_at = now()
      where id = v_id and listing_id = p_listing_id;
      v_updated := v_updated + 1;
    end if;
    v_retained_ids := array_append(v_retained_ids, v_id);
  end loop;

  delete from public.listing_media
  where listing_id = p_listing_id
    and not (id = any(v_retained_ids));
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deleted', v_deleted, 'retained', cardinality(v_retained_ids));
end;
$$;

revoke all on function public.bridge_sync_listing_media_v2(uuid, jsonb) from public, anon;
grant execute on function public.bridge_sync_listing_media_v2(uuid, jsonb) to authenticated;

comment on function public.bridge_sync_listing_media_v2(uuid, jsonb) is
  'Atomically synchronizes listing media by stable row or Storage object identity under caller RLS.';

commit;
