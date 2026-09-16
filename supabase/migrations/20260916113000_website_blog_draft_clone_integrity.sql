begin;

-- The blog wrapper relies on the core draft command recording exactly which
-- published revision it cloned. Older installations created the revision but
-- omitted source_revision_id, so the wrapper had nothing to copy articles
-- from. A later website publish then served a revision with no blog rows.
create or replace function public.website_create_draft_revision_core(
  p_website_site_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.website_sites%rowtype;
  v_source public.website_site_revisions%rowtype;
  v_draft_id uuid;
begin
  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id
  for update;

  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can create website drafts.' using errcode = '42501';
  end if;

  select revision.id into v_draft_id
  from public.website_site_revisions revision
  where revision.website_site_id = v_site.id
    and revision.status = 'draft'
  order by revision.revision_number desc
  limit 1;
  if v_draft_id is not null then
    return v_draft_id;
  end if;

  select revision.* into v_source
  from public.website_site_revisions revision
  where revision.id = v_site.published_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'published';
  if not found then
    raise exception 'The site published revision pointer is invalid.' using errcode = '23514';
  end if;

  insert into public.website_site_revisions (
    website_site_id,
    revision_number,
    status,
    brand_json,
    seo_json,
    navigation_json,
    created_by,
    source_revision_id
  ) values (
    v_site.id,
    v_source.revision_number + 1,
    'draft',
    v_source.brand_json,
    v_source.seo_json,
    v_source.navigation_json,
    auth.uid(),
    v_source.id
  ) returning id into v_draft_id;

  insert into public.website_pages (
    website_site_id,
    revision_id,
    page_kind,
    slug,
    title,
    seo_title,
    seo_description,
    social_image_url,
    content_blocks
  )
  select
    page.website_site_id,
    v_draft_id,
    page.page_kind,
    page.slug,
    page.title,
    page.seo_title,
    page.seo_description,
    page.social_image_url,
    page.content_blocks
  from public.website_pages page
  where page.website_site_id = v_site.id
    and page.revision_id = v_source.id;

  return v_draft_id;
end;
$$;

-- Keep the entire article shape when cloning a website draft. The original
-- wrapper predates structured blocks and listing-card links, so its copies
-- could silently lose public article content even once a source was present.
create or replace function public.website_create_draft_revision(
  p_website_site_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_id uuid;
  v_source_id uuid;
  v_actor_id uuid := auth.uid();
begin
  v_draft_id := public.website_create_draft_revision_core(p_website_site_id);

  select revision.source_revision_id into v_source_id
  from public.website_site_revisions revision
  where revision.id = v_draft_id;

  if v_source_id is not null
    and not exists (
      select 1
      from public.website_blog_posts post
      where post.revision_id = v_draft_id
    ) then
    insert into public.website_blog_posts (
      organisation_id,
      website_site_id,
      revision_id,
      title,
      slug,
      summary,
      cover_image_url,
      cover_image_alt,
      body,
      content_blocks,
      author_name,
      status,
      lifecycle_status,
      published_at,
      scheduled_for,
      archived_at,
      seo_title,
      seo_description,
      created_by,
      updated_by
    )
    select
      post.organisation_id,
      post.website_site_id,
      v_draft_id,
      post.title,
      post.slug,
      post.summary,
      post.cover_image_url,
      post.cover_image_alt,
      post.body,
      post.content_blocks,
      post.author_name,
      'draft',
      'draft',
      null,
      null,
      null,
      post.seo_title,
      post.seo_description,
      v_actor_id,
      v_actor_id
    from public.website_blog_posts post
    where post.website_site_id = p_website_site_id
      and post.revision_id = v_source_id;

    insert into public.website_blog_listing_links (
      organisation_id,
      website_blog_post_id,
      listing_id,
      position
    )
    select
      draft_post.organisation_id,
      draft_post.id,
      (block.value ->> 'listingId')::uuid,
      block.ordinality - 1
    from public.website_blog_posts draft_post
    cross join lateral jsonb_array_elements(draft_post.content_blocks) with ordinality as block(value, ordinality)
    where draft_post.website_site_id = p_website_site_id
      and draft_post.revision_id = v_draft_id
      and block.value ->> 'type' = 'listing_card'
    on conflict (website_blog_post_id, listing_id, position) do nothing;
  end if;

  return v_draft_id;
end;
$$;

revoke all on function public.website_create_draft_revision_core(uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_create_draft_revision(uuid) from public, anon;
grant execute on function public.website_create_draft_revision(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
