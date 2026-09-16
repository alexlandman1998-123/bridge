begin;

-- Website articles are collaborative organisation content.  Any active member
-- of the owning organisation may author and release article changes; users
-- remain unable to access another organisation's site.
drop policy if exists website_sites_member_read on public.website_sites;
create policy website_sites_member_read on public.website_sites for select to authenticated
  using (public.bridge_is_org_member(organisation_id));

drop policy if exists website_site_revisions_member_read on public.website_site_revisions;
create policy website_site_revisions_member_read on public.website_site_revisions for select to authenticated
  using (exists (
    select 1 from public.website_sites site
    where site.id = website_site_revisions.website_site_id
      and public.bridge_is_org_member(site.organisation_id)
  ));

drop policy if exists website_blog_posts_member_read on public.website_blog_posts;
create policy website_blog_posts_member_read on public.website_blog_posts for select to authenticated
  using (public.bridge_is_org_member(organisation_id));

drop policy if exists website_media_assets_member_access on public.website_media_assets;
create policy website_media_assets_member_access on public.website_media_assets for all to authenticated
  using (public.bridge_is_org_member(organisation_id))
  with check (
    public.bridge_is_org_member(organisation_id)
    and organisation_id = (select organisation_id from public.website_sites where id = website_site_id)
  );

drop policy if exists website_blog_listing_links_member_access on public.website_blog_listing_links;
create policy website_blog_listing_links_member_access on public.website_blog_listing_links for all to authenticated
  using (public.bridge_is_org_member(organisation_id))
  with check (public.bridge_is_org_member(organisation_id));

drop policy if exists website_media_admin_insert on storage.objects;
create policy website_media_member_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_member(public.website_media_storage_org_id(name))
);
drop policy if exists website_media_admin_update on storage.objects;
create policy website_media_member_update on storage.objects for update to authenticated using (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_member(public.website_media_storage_org_id(name))
) with check (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_member(public.website_media_storage_org_id(name))
);
drop policy if exists website_media_admin_delete on storage.objects;
create policy website_media_member_delete on storage.objects for delete to authenticated using (
  bucket_id = 'website-media' and public.website_media_storage_path_is_valid(name)
  and public.bridge_is_org_member(public.website_media_storage_org_id(name))
);

-- The public readiness wrapper calls this base function before publishing.
-- Its original administrator check would otherwise still reject a member.
create or replace function public.website_revision_readiness_base(
  p_website_site_id uuid, p_revision_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_site public.website_sites%rowtype; v_revision public.website_site_revisions%rowtype;
  v_page public.website_pages%rowtype; v_page_count integer := 0; v_campaign_count integer := 0;
  v_active_domain_count integer := 0; v_blockers jsonb := '[]'::jsonb; v_fingerprint text;
begin
  if v_user_id is null then raise exception 'Authentication is required to inspect website publication readiness.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_member(v_site.organisation_id) then raise exception 'Only active organisation members can inspect website publication readiness.' using errcode = '42501'; end if;
  select revision.* into v_revision from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = v_site.id;
  if not found then raise exception 'Website revision not found.' using errcode = 'P0002'; end if;
  if v_revision.status not in ('draft', 'archived') then v_blockers := v_blockers || to_jsonb('Only a draft or archived revision can be checked for publication.'::text); end if;
  if jsonb_typeof(v_revision.brand_json) <> 'object' or nullif(trim(v_revision.brand_json ->> 'name'), '') is null then v_blockers := v_blockers || to_jsonb('Add the agency display name before publishing.'::text); end if;
  if coalesce(v_revision.brand_json ->> 'primaryColor', '') !~ '^#[0-9a-fA-F]{6}$' or coalesce(v_revision.brand_json ->> 'secondaryColor', '') !~ '^#[0-9a-fA-F]{6}$' or coalesce(v_revision.brand_json ->> 'accentColor', '') !~ '^#[0-9a-fA-F]{6}$' then v_blockers := v_blockers || to_jsonb('Primary, secondary and accent colours must be complete six-digit hex values.'::text); end if;
  if jsonb_typeof(v_revision.navigation_json) <> 'array' or jsonb_array_length(v_revision.navigation_json) < 1 then v_blockers := v_blockers || to_jsonb('Add at least one navigation destination before publishing.'::text); end if;
  select count(*)::integer, count(*) filter (where page.page_kind = 'campaign')::integer into v_page_count, v_campaign_count from public.website_pages page where page.website_site_id = v_site.id and page.revision_id = v_revision.id;
  if (select count(*) from public.website_pages page where page.revision_id=v_revision.id and page.page_kind='home') <> 1 or (select count(*) from public.website_pages page where page.revision_id=v_revision.id and page.page_kind='about') <> 1 or (select count(*) from public.website_pages page where page.revision_id=v_revision.id and page.page_kind='contact') <> 1 or (select count(*) from public.website_pages page where page.revision_id=v_revision.id and page.page_kind='valuation') <> 1 then v_blockers := v_blockers || to_jsonb('The revision must contain exactly one Home, About, Contact and Valuation page.'::text); end if;
  for v_page in select page.* from public.website_pages page where page.website_site_id=v_site.id and page.revision_id=v_revision.id order by page.page_kind, page.slug loop
    begin perform public.website_validate_page_content(v_page.page_kind, v_page.content_blocks); exception when others then v_blockers := v_blockers || to_jsonb((v_page.title || ': ' || sqlerrm)::text); end;
  end loop;
  select count(*)::integer into v_active_domain_count from public.website_domains domain where domain.website_site_id=v_site.id and domain.status='active';
  if v_active_domain_count < 1 then v_blockers := v_blockers || to_jsonb('Activate the managed preview domain before publishing.'::text); end if;
  select pg_catalog.md5(v_revision.brand_json::text || '|' || v_revision.seo_json::text || '|' || v_revision.navigation_json::text || '|' || coalesce(string_agg(page.page_kind || ':' || page.slug || ':' || page.title || ':' || coalesce(page.seo_title, '') || ':' || coalesce(page.seo_description, '') || ':' || coalesce(page.social_image_url, '') || ':' || page.content_blocks::text, '||' order by page.page_kind, page.slug), '')) into v_fingerprint from public.website_pages page where page.website_site_id=v_site.id and page.revision_id=v_revision.id;
  return jsonb_build_object('ready', jsonb_array_length(v_blockers)=0, 'blockers', v_blockers, 'pageCount', v_page_count, 'campaignCount', v_campaign_count, 'activeDomainCount', v_active_domain_count, 'contentFingerprint', v_fingerprint, 'revisionId', v_revision.id, 'revisionNumber', v_revision.revision_number);
end;
$$;

create or replace function public.website_create_draft_revision_core(p_website_site_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_site public.website_sites%rowtype;
  v_source public.website_site_revisions%rowtype;
  v_draft_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required to create website changes.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_member(v_site.organisation_id) then raise exception 'Only active organisation members can create website changes.' using errcode = '42501'; end if;
  select revision.id into v_draft_id from public.website_site_revisions revision where revision.website_site_id = v_site.id and revision.status = 'draft' order by revision.revision_number desc limit 1;
  if v_draft_id is not null then return v_draft_id; end if;
  select revision.* into v_source from public.website_site_revisions revision where revision.id = v_site.published_revision_id and revision.website_site_id = v_site.id and revision.status = 'published';
  if not found then raise exception 'The site published revision pointer is invalid.' using errcode = '23514'; end if;
  insert into public.website_site_revisions (website_site_id, revision_number, status, brand_json, seo_json, navigation_json, created_by, source_revision_id)
  values (v_site.id, v_source.revision_number + 1, 'draft', v_source.brand_json, v_source.seo_json, v_source.navigation_json, auth.uid(), v_source.id)
  returning id into v_draft_id;
  insert into public.website_pages (website_site_id, revision_id, page_kind, slug, title, seo_title, seo_description, social_image_url, content_blocks)
  select page.website_site_id, v_draft_id, page.page_kind, page.slug, page.title, page.seo_title, page.seo_description, page.social_image_url, page.content_blocks
  from public.website_pages page where page.website_site_id = v_site.id and page.revision_id = v_source.id;
  return v_draft_id;
end;
$$;

create or replace function public.website_publish_revision_core(p_website_site_id uuid, p_revision_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_site public.website_sites%rowtype; v_revision public.website_site_revisions%rowtype;
  v_readiness jsonb; v_previous_id uuid; v_fingerprint text;
begin
  set constraints all deferred;
  if v_user_id is null then raise exception 'Authentication is required to publish a website.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_member(v_site.organisation_id) then raise exception 'Only active organisation members can publish website changes.' using errcode = '42501'; end if;
  select revision.* into v_revision from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = v_site.id and revision.status = 'draft' for update;
  if not found then raise exception 'A publishable draft revision was not found.' using errcode = 'P0002'; end if;
  v_readiness := public.website_revision_readiness(v_site.id, v_revision.id);
  if not coalesce((v_readiness ->> 'ready')::boolean, false) then raise exception 'Website revision is not ready: %', v_readiness -> 'blockers' using errcode = '23514'; end if;
  v_fingerprint := v_readiness ->> 'contentFingerprint'; v_previous_id := v_site.published_revision_id;
  if v_previous_id is not null then
    update public.website_site_revisions revision set status = 'archived', archived_at = now(), updated_at = now() where revision.id = v_previous_id and revision.website_site_id = v_site.id and revision.status = 'published';
    if not found then raise exception 'The current published revision could not be archived.' using errcode = '23514'; end if;
  end if;
  update public.website_site_revisions revision set status = 'published', published_at = now(), published_by = v_user_id, archived_at = null, content_fingerprint = v_fingerprint, updated_at = now() where revision.id = v_revision.id;
  update public.website_sites site set status = 'published', published_revision_id = v_revision.id, updated_at = now() where site.id = v_site.id;
  insert into public.website_publication_events (website_site_id, organisation_id, actor_user_id, action, from_revision_id, source_revision_id, to_revision_id, content_fingerprint, metadata_json)
  values (v_site.id, v_site.organisation_id, v_user_id, 'published', v_previous_id, v_revision.source_revision_id, v_revision.id, v_fingerprint, jsonb_build_object('revisionNumber', v_revision.revision_number, 'readiness', v_readiness));
  return v_revision.id;
end;
$$;

create or replace function public.website_save_draft_blog_post(
  p_website_site_id uuid, p_revision_id uuid, p_post_id uuid, p_title text, p_slug text, p_summary text,
  p_cover_image_url text, p_cover_image_alt text, p_body text, p_content_blocks jsonb, p_author_name text, p_seo_title text, p_seo_description text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_site public.website_sites%rowtype; v_post public.website_blog_posts%rowtype;
  v_slug text := lower(trim(coalesce(p_slug, ''))); v_title text := left(trim(coalesce(p_title, '')), 160);
  v_cover_url text := nullif(trim(coalesce(p_cover_image_url, '')), ''); v_cover_alt text := nullif(trim(coalesce(p_cover_image_alt, '')), '');
  v_block jsonb; v_index integer := 0; v_asset_id uuid; v_listing_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required to edit a website article.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_member(v_site.organisation_id) then raise exception 'Only active organisation members can edit website articles.' using errcode = '42501'; end if;
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
    insert into public.website_blog_posts (organisation_id, website_site_id, revision_id, title, slug, summary, cover_image_url, cover_image_alt, body, content_blocks, author_name, status, published_at, seo_title, seo_description, created_by, updated_by)
    values (v_site.organisation_id, v_site.id, p_revision_id, v_title, v_slug, left(coalesce(p_summary,''),600), v_cover_url, v_cover_alt, left(coalesce(p_body,''),50000), p_content_blocks, left(coalesce(p_author_name,''),160), 'draft', null, nullif(left(trim(coalesce(p_seo_title,'')),180),''), nullif(left(trim(coalesce(p_seo_description,'')),320),''), v_user_id, v_user_id) returning * into v_post;
  else
    update public.website_blog_posts post set title=v_title, slug=v_slug, summary=left(coalesce(p_summary,''),600), cover_image_url=v_cover_url, cover_image_alt=v_cover_alt, body=left(coalesce(p_body,''),50000), content_blocks=p_content_blocks, author_name=left(coalesce(p_author_name,''),160), status='draft', published_at=null, seo_title=nullif(left(trim(coalesce(p_seo_title,'')),180),''), seo_description=nullif(left(trim(coalesce(p_seo_description,'')),320),''), updated_by=v_user_id, updated_at=now() where post.id=p_post_id and post.website_site_id=v_site.id and post.revision_id=p_revision_id returning * into v_post;
    if not found then raise exception 'An editable article was not found in this website draft.' using errcode = 'P0002'; end if;
  end if;
  delete from public.website_blog_listing_links where website_blog_post_id = v_post.id;
  insert into public.website_blog_listing_links (organisation_id, website_blog_post_id, listing_id, position)
  select v_site.organisation_id, v_post.id, (block.value->>'listingId')::uuid, block.ordinality - 1 from jsonb_array_elements(p_content_blocks) with ordinality as block(value, ordinality) where block.value->>'type' = 'listing_card';
  return jsonb_build_object('id',v_post.id,'revisionId',v_post.revision_id,'title',v_post.title,'slug',v_post.slug,'status',v_post.status,'updatedAt',v_post.updated_at);
exception when unique_violation then raise exception 'That article URL is already in use in this website draft.' using errcode = '23505';
end;
$$;

create or replace function public.website_manage_draft_blog_post(
  p_website_site_id uuid, p_revision_id uuid, p_post_id uuid, p_action text, p_scheduled_for timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_site public.website_sites%rowtype; v_post public.website_blog_posts%rowtype;
  v_action text := lower(trim(coalesce(p_action, ''))); v_copy_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication is required to manage website articles.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_member(v_site.organisation_id) then raise exception 'Only active organisation members can manage website articles.' using errcode = '42501'; end if;
  if not exists (select 1 from public.website_site_revisions revision where revision.id=p_revision_id and revision.website_site_id=v_site.id and revision.status='draft') then raise exception 'Create an editable website draft before managing an article.' using errcode = 'P0002'; end if;
  select post.* into v_post from public.website_blog_posts post where post.id=p_post_id and post.website_site_id=v_site.id and post.revision_id=p_revision_id;
  if not found then raise exception 'This article is not in the editable website draft.' using errcode = 'P0002'; end if;
  if v_action = 'delete' then delete from public.website_blog_posts where id=v_post.id; return jsonb_build_object('deleted', true, 'id', p_post_id); end if;
  if v_action = 'duplicate' then
    v_copy_slug := left(v_post.slug || '-copy', 80);
    while exists (select 1 from public.website_blog_posts where website_site_id=v_site.id and revision_id=p_revision_id and slug=v_copy_slug) loop v_copy_slug := left(v_post.slug || '-' || substr(md5(random()::text), 1, 5), 80); end loop;
    insert into public.website_blog_posts (organisation_id,website_site_id,revision_id,title,slug,summary,cover_image_url,cover_image_alt,body,content_blocks,author_name,status,lifecycle_status,seo_title,seo_description,created_by,updated_by)
    values (v_site.organisation_id,v_site.id,p_revision_id,left(v_post.title || ' (copy)',160),v_copy_slug,v_post.summary,v_post.cover_image_url,v_post.cover_image_alt,v_post.body,v_post.content_blocks,v_post.author_name,'draft','draft',v_post.seo_title,v_post.seo_description,auth.uid(),auth.uid()) returning * into v_post;
  elsif v_action in ('draft','ready_for_review','archive') then
    update public.website_blog_posts post set lifecycle_status=case when v_action='archive' then 'archived' else v_action end, scheduled_for=null, archived_at=case when v_action='archive' then now() else null end, updated_by=auth.uid(), updated_at=now() where post.id=v_post.id returning * into v_post;
  elsif v_action = 'schedule' then
    if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'Choose a future publication time.' using errcode = '22023'; end if;
    update public.website_blog_posts post set lifecycle_status='scheduled', scheduled_for=p_scheduled_for, archived_at=null, updated_by=auth.uid(), updated_at=now() where post.id=v_post.id returning * into v_post;
  else raise exception 'Choose a valid article action.' using errcode = '22023'; end if;
  return jsonb_build_object('id',v_post.id,'status',v_post.lifecycle_status,'scheduledFor',v_post.scheduled_for,'slug',v_post.slug);
end;
$$;

create or replace function public.website_blog_available_listings(p_website_site_id uuid)
returns table (listing_id uuid, title text, address text, suburb text, asking_price numeric, image_url text)
language plpgsql security definer set search_path = '' as $$
declare v_site public.website_sites%rowtype;
begin
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_member(v_site.organisation_id) then raise exception 'Only active organisation members can select website listings.' using errcode = '42501'; end if;
  return query select publication.listing_id, left(coalesce(publication.publication_json->>'title','Property listing'),160), left(coalesce(publication.publication_json->>'address',''),240), left(coalesce(publication.publication_json->>'suburb',''),120), nullif(publication.publication_json->>'asking_price','')::numeric, nullif((publication.media_json->0->>'file_url'),'')
  from public.website_listing_publications publication
  join public.listing_publication_data data on data.listing_id=publication.listing_id and data.status='Published'
  join public.private_listings listing on listing.id=publication.listing_id and listing.organisation_id=v_site.organisation_id
  where publication.website_site_id=v_site.id and publication.status='published'
  order by publication.last_synced_at desc nulls last;
end;
$$;

notify pgrst, 'reload schema';
commit;
