begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-media', 'website-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.website_media_storage_org_id(object_name text)
returns uuid language sql stable security definer set search_path = public, storage as $$
  select case when (storage.foldername(object_name))[1] = 'organisations'
    and coalesce((storage.foldername(object_name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[2])::uuid else null::uuid end;
$$;

create or replace function public.website_media_storage_path_is_valid(object_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select (storage.foldername(object_name))[1] = 'organisations'
    and public.website_media_storage_org_id(object_name) is not null
    and coalesce((storage.foldername(object_name))[3], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and coalesce((storage.foldername(object_name))[4], '') ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'
    and object_name ~* '\.(jpe?g|png|webp|avif)$';
$$;

grant execute on function public.website_media_storage_org_id(text), public.website_media_storage_path_is_valid(text) to authenticated;

drop policy if exists website_media_admin_insert on storage.objects;
create policy website_media_admin_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_admin(public.website_media_storage_org_id(name))
);
drop policy if exists website_media_admin_update on storage.objects;
create policy website_media_admin_update on storage.objects for update to authenticated using (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_admin(public.website_media_storage_org_id(name))
) with check (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_admin(public.website_media_storage_org_id(name))
);
drop policy if exists website_media_admin_delete on storage.objects;
create policy website_media_admin_delete on storage.objects for delete to authenticated using (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_admin(public.website_media_storage_org_id(name))
);

create or replace function public.website_blog_available_listings(p_website_site_id uuid)
returns table (listing_id uuid, title text, address text, suburb text, asking_price numeric, image_url text)
language plpgsql security definer set search_path = '' as $$
declare v_site public.website_sites%rowtype;
begin
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can select website listings.' using errcode = '42501';
  end if;
  return query
    select publication.listing_id,
      left(coalesce(publication.publication_json->>'title', 'Property listing'), 160),
      left(coalesce(publication.publication_json->>'address', ''), 240),
      left(coalesce(publication.publication_json->>'suburb', ''), 120),
      nullif(publication.publication_json->>'asking_price', '')::numeric,
      nullif((publication.media_json->0->>'file_url'), '')
    from public.website_listing_publications publication
    join public.listing_publication_data data on data.listing_id = publication.listing_id and data.status = 'Published'
    join public.private_listings listing on listing.id = publication.listing_id and listing.organisation_id = v_site.organisation_id
    where publication.website_site_id = v_site.id and publication.status = 'published'
    order by publication.last_synced_at desc nulls last;
end;
$$;

revoke all on function public.website_blog_available_listings(uuid) from public, anon;
grant execute on function public.website_blog_available_listings(uuid) to authenticated;

create or replace function public.website_save_draft_blog_post(
  p_website_site_id uuid, p_revision_id uuid, p_post_id uuid,
  p_title text, p_slug text, p_summary text, p_cover_image_url text, p_cover_image_alt text,
  p_body text, p_content_blocks jsonb, p_author_name text, p_seo_title text, p_seo_description text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_site public.website_sites%rowtype; v_post public.website_blog_posts%rowtype;
  v_slug text := lower(trim(coalesce(p_slug, ''))); v_title text := left(trim(coalesce(p_title, '')), 160);
  v_cover_url text := nullif(trim(coalesce(p_cover_image_url, '')), ''); v_cover_alt text := nullif(trim(coalesce(p_cover_image_alt, '')), '');
  v_block jsonb; v_index integer := 0; v_asset_id uuid; v_listing_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required to edit a website article.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_admin(v_site.organisation_id) then raise exception 'Only organisation administrators can edit website articles.' using errcode = '42501'; end if;
  if not exists (select 1 from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = v_site.id and revision.status = 'draft') then raise exception 'Create an editable website draft before saving an article.' using errcode = 'P0002'; end if;
  if v_title = '' or v_slug = '' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) > 80 then raise exception 'Article title and URL must use lowercase words and hyphens.' using errcode = '22023'; end if;
  if p_content_blocks is null or jsonb_typeof(p_content_blocks) <> 'array' then raise exception 'Article content must be structured blocks.' using errcode = '22023'; end if;
  for v_block in select value from jsonb_array_elements(p_content_blocks) loop
    if coalesce(v_block->>'id', '') = '' or coalesce(v_block->>'type', '') not in ('paragraph','heading_2','heading_3','bullet_list','numbered_list','quote','divider','image','tip','listing_card') then raise exception 'Article content contains an unsupported block.' using errcode = '22023'; end if;
    if v_block->>'type' not in ('divider','image','listing_card') and (char_length(coalesce(v_block->>'text', '')) > 10000 or trim(coalesce(v_block->>'text', '')) = '') then raise exception 'Article text blocks need content and cannot be too long.' using errcode = '22023'; end if;
    if v_block->>'type' = 'image' then
      begin v_asset_id := (v_block->>'assetId')::uuid; exception when invalid_text_representation then raise exception 'Select an uploaded image for every image block.' using errcode = '22023'; end;
      if not exists (select 1 from public.website_media_assets asset where asset.id = v_asset_id and asset.website_site_id = v_site.id and asset.organisation_id = v_site.organisation_id and trim(asset.alt_text) <> '') then raise exception 'Select an uploaded image with alt text for every image block.' using errcode = '22023'; end if;
    end if;
    if v_block->>'type' = 'listing_card' then
      begin v_listing_id := (v_block->>'listingId')::uuid; exception when invalid_text_representation then raise exception 'Select a live website listing for every property card.' using errcode = '22023'; end;
      if not exists (select 1 from public.website_listing_publications publication join public.listing_publication_data data on data.listing_id = publication.listing_id and data.status = 'Published' join public.private_listings listing on listing.id = publication.listing_id and listing.organisation_id = v_site.organisation_id where publication.website_site_id = v_site.id and publication.listing_id = v_listing_id and publication.status = 'published') then raise exception 'That property is not currently live on this website.' using errcode = '22023'; end if;
    end if;
    v_index := v_index + 1;
  end loop;
  if v_index > 200 then raise exception 'An article can contain at most 200 blocks.' using errcode = '22023'; end if;
  if v_cover_url is not null and (v_cover_url !~* '^https://[^[:space:]]+$' or v_cover_alt is null) then raise exception 'Add a secure cover image URL and alt text.' using errcode = '22023'; end if;
  if p_post_id is null then
    insert into public.website_blog_posts (organisation_id,website_site_id,revision_id,title,slug,summary,cover_image_url,cover_image_alt,body,content_blocks,author_name,status,published_at,seo_title,seo_description,created_by,updated_by)
    values (v_site.organisation_id,v_site.id,p_revision_id,v_title,v_slug,left(coalesce(p_summary,''),600),v_cover_url,v_cover_alt,left(coalesce(p_body,''),50000),p_content_blocks,left(coalesce(p_author_name,''),160),'draft',null,nullif(left(trim(coalesce(p_seo_title,'')),180),''),nullif(left(trim(coalesce(p_seo_description,'')),320),''),v_user_id,v_user_id) returning * into v_post;
  else
    update public.website_blog_posts post set title=v_title,slug=v_slug,summary=left(coalesce(p_summary,''),600),cover_image_url=v_cover_url,cover_image_alt=v_cover_alt,body=left(coalesce(p_body,''),50000),content_blocks=p_content_blocks,author_name=left(coalesce(p_author_name,''),160),status='draft',published_at=null,seo_title=nullif(left(trim(coalesce(p_seo_title,'')),180),''),seo_description=nullif(left(trim(coalesce(p_seo_description,'')),320),''),updated_by=v_user_id,updated_at=now() where post.id=p_post_id and post.website_site_id=v_site.id and post.revision_id=p_revision_id returning * into v_post;
    if not found then raise exception 'An editable article was not found in this website draft.' using errcode = 'P0002'; end if;
  end if;
  delete from public.website_blog_listing_links where website_blog_post_id = v_post.id;
  insert into public.website_blog_listing_links (organisation_id, website_blog_post_id, listing_id, position)
  select v_site.organisation_id, v_post.id, (block.value->>'listingId')::uuid, block.ordinality - 1
  from jsonb_array_elements(p_content_blocks) with ordinality as block(value, ordinality)
  where block.value->>'type' = 'listing_card';
  return jsonb_build_object('id',v_post.id,'revisionId',v_post.revision_id,'title',v_post.title,'slug',v_post.slug,'status',v_post.status,'updatedAt',v_post.updated_at);
exception when unique_violation then raise exception 'That article URL is already in use in this website draft.' using errcode = '23505';
end;
$$;

revoke all on function public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text) from public, anon;
grant execute on function public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
