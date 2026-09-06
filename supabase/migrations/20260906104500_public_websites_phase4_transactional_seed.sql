begin;

create or replace function public.website_bind_production_dark_launch_content(
  p_organisation_id uuid,
  p_website_site_id uuid,
  p_operator text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operator text := left(trim(coalesce(p_operator, '')), 160);
  v_launch public.website_production_dark_launches%rowtype;
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_fingerprint text;
  v_page_count integer;
begin
  if char_length(v_operator) < 2 then
    raise exception 'A production operator is required.' using errcode = '22023';
  end if;

  select launch.* into strict v_launch
  from public.website_production_dark_launches launch
  where launch.organisation_id = p_organisation_id
    and launch.status = 'prepared'
  for update;

  select site.* into strict v_site
  from public.website_sites site
  where site.id = p_website_site_id
    and site.organisation_id = p_organisation_id
    and site.status = 'draft'
    and site.template_key = 'property-standard-v1'
    and site.published_revision_id is null
  for update;

  select revision.* into strict v_revision
  from public.website_site_revisions revision
  where revision.website_site_id = v_site.id
    and revision.revision_number = 1
    and revision.status = 'draft'
  for update;

  select count(*)::integer,
    pg_catalog.md5(
      v_revision.brand_json::text || '|' || v_revision.seo_json::text || '|' || v_revision.navigation_json::text || '|' ||
      coalesce(string_agg(
        page.page_kind || ':' || page.slug || ':' || page.title || ':' || coalesce(page.seo_title, '') || ':' ||
        coalesce(page.seo_description, '') || ':' || coalesce(page.social_image_url, '') || ':' || page.content_blocks::text,
        '||' order by page.page_kind, page.slug
      ), '')
    )
  into v_page_count, v_fingerprint
  from public.website_pages page
  where page.website_site_id = v_site.id
    and page.revision_id = v_revision.id;

  if v_page_count < 4 or not exists (
    select 1
    from public.website_listing_publications publication
    where publication.website_site_id = v_site.id
      and publication.listing_id = v_launch.listing_id
      and publication.status = 'published'
      and pg_catalog.jsonb_array_length(publication.media_json) > 0
  ) then
    raise exception 'Production content cannot be bound until the standard pages and listing are seeded.' using errcode = '23514';
  end if;

  update public.website_site_revisions revision
  set status = 'published',
      content_fingerprint = v_fingerprint,
      published_by = coalesce(revision.published_by, revision.created_by),
      published_at = coalesce(revision.published_at, now()),
      updated_at = now()
  where revision.id = v_revision.id;

  update public.website_sites site
  set status = 'published',
      published_revision_id = v_revision.id,
      updated_at = now()
  where site.id = v_site.id
    and site.organisation_id = p_organisation_id;

  update public.website_production_dark_launches launch
  set website_site_id = v_site.id,
      production_content_fingerprint = v_fingerprint,
      configured_by = v_operator
  where launch.id = v_launch.id
  returning * into v_launch;

  insert into public.website_production_dark_launch_events (
    dark_launch_id, organisation_id, action, operator, source_commit,
    deployment_url, content_fingerprint, metadata_json
  ) values (
    v_launch.id, p_organisation_id, 'seeded', v_operator, v_launch.source_commit,
    v_launch.candidate_deployment_url, v_fingerprint,
    pg_catalog.jsonb_build_object(
      'websiteSiteId', v_site.id,
      'revisionId', v_revision.id,
      'listingId', v_launch.listing_id,
      'pageCount', v_page_count,
      'reviewedStagingContentFingerprint', v_launch.expected_content_fingerprint,
      'productionContentFingerprint', v_fingerprint
    )
  );

  return pg_catalog.jsonb_build_object(
    'darkLaunchId', v_launch.id,
    'websiteSiteId', v_site.id,
    'revisionId', v_revision.id,
    'pageCount', v_page_count,
    'contentFingerprint', v_fingerprint
  );
end;
$$;

revoke all on function public.website_bind_production_dark_launch_content(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.website_bind_production_dark_launch_content(uuid, uuid, text)
  to service_role;

comment on function public.website_bind_production_dark_launch_content(uuid, uuid, text) is
  'Atomically publishes and fingerprints a fully seeded production dark-launch site and revision.';

notify pgrst, 'reload schema';
commit;
