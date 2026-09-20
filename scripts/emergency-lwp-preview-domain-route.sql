begin;

do $$
declare
  v_site_id constant uuid := '357961db-9af1-4c9c-aedd-812b829d2a4f'::uuid;
  v_org_id constant uuid := '7d7c9fc1-c38b-4f83-a508-c659975f985f'::uuid;
  v_revision_id constant uuid := '62a05c22-1b9b-4aef-b81a-fbca739f8290'::uuid;
  v_hostname constant text := 'lwp.preview.arch9.co.za';
  v_fingerprint text;
begin
  set constraints all deferred;

  if not exists (
    select 1
    from public.website_sites site
    join public.website_site_revisions revision
      on revision.id = v_revision_id
     and revision.website_site_id = site.id
     and revision.status = 'draft'
    join public.website_pilot_enrolments pilot
      on pilot.organisation_id = site.organisation_id
     and pilot.status = 'active'
    where site.id = v_site_id
      and site.organisation_id = v_org_id
      and site.status = 'draft'
      and site.published_revision_id is null
  ) then
    raise exception 'The expected LWP draft and active pilot enrolment were not found.';
  end if;

  if exists (
    select 1
    from public.website_domains domain
    where lower(domain.hostname) = v_hostname
      and domain.website_site_id <> v_site_id
  ) then
    raise exception 'The LWP preview hostname is already assigned to another website.';
  end if;

  if (select count(*) from public.website_pages page where page.website_site_id = v_site_id and page.revision_id = v_revision_id and page.page_kind = 'home') <> 1
     or (select count(*) from public.website_pages page where page.website_site_id = v_site_id and page.revision_id = v_revision_id and page.page_kind = 'about') <> 1
     or (select count(*) from public.website_pages page where page.website_site_id = v_site_id and page.revision_id = v_revision_id and page.page_kind = 'contact') <> 1
     or (select count(*) from public.website_pages page where page.website_site_id = v_site_id and page.revision_id = v_revision_id and page.page_kind = 'valuation') <> 1 then
    raise exception 'The LWP revision is missing a required public page.';
  end if;

  if not exists (
    select 1
    from public.website_site_revisions revision
    where revision.id = v_revision_id
      and revision.brand_json ? 'name'
      and revision.brand_json ->> 'name' <> ''
      and coalesce(revision.brand_json ->> 'primaryColor', '') ~ '^#[0-9a-fA-F]{6}$'
      and coalesce(revision.brand_json ->> 'secondaryColor', '') ~ '^#[0-9a-fA-F]{6}$'
      and coalesce(revision.brand_json ->> 'accentColor', '') ~ '^#[0-9a-fA-F]{6}$'
      and jsonb_typeof(revision.navigation_json) = 'array'
      and jsonb_array_length(revision.navigation_json) > 0
  ) then
    raise exception 'The LWP branding or navigation is incomplete.';
  end if;

  perform public.website_validate_page_content(page.page_kind, page.content_blocks)
  from public.website_pages page
  where page.website_site_id = v_site_id
    and page.revision_id = v_revision_id;

  if exists (
    select 1
    from public.website_site_revisions revision
    where revision.id = v_revision_id
      and (
        (nullif(trim(revision.brand_json ->> 'logoLightUrl'), '') is not null and not exists (
          select 1 from public.website_brand_assets asset
          where asset.website_site_id = v_site_id and asset.variant = 'light'
            and asset.public_url = revision.brand_json ->> 'logoLightUrl' and asset.status = 'active'
        ))
        or
        (nullif(trim(revision.brand_json ->> 'logoDarkUrl'), '') is not null and not exists (
          select 1 from public.website_brand_assets asset
          where asset.website_site_id = v_site_id and asset.variant = 'dark'
            and asset.public_url = revision.brand_json ->> 'logoDarkUrl' and asset.status = 'active'
        ))
      )
  ) then
    raise exception 'The LWP website logo assets are not durable public assets.';
  end if;

  insert into public.website_domains (
    website_site_id, hostname, domain_kind, status, is_primary, dns_instructions, verified_at
  ) values (
    v_site_id, v_hostname, 'preview', 'active', false,
    jsonb_build_object('provider', 'vercel', 'managedBy', 'Arch9', 'wildcardAlias', '*.preview.arch9.co.za'),
    now()
  )
  on conflict (lower(hostname)) do update
  set domain_kind = 'preview', status = 'active', is_primary = false,
      dns_instructions = excluded.dns_instructions,
      verified_at = coalesce(public.website_domains.verified_at, excluded.verified_at),
      updated_at = now()
  where public.website_domains.website_site_id = v_site_id;

  select md5(
    revision.brand_json::text || '|' || revision.seo_json::text || '|' || revision.navigation_json::text || '|' ||
    coalesce(string_agg(
      page.page_kind || ':' || page.slug || ':' || page.title || ':' || coalesce(page.seo_title, '') || ':' ||
      coalesce(page.seo_description, '') || ':' || coalesce(page.social_image_url, '') || ':' || page.content_blocks::text,
      '||' order by page.page_kind, page.slug
    ), '')
  ) into v_fingerprint
  from public.website_site_revisions revision
  left join public.website_pages page
    on page.website_site_id = revision.website_site_id and page.revision_id = revision.id
  where revision.id = v_revision_id
  group by revision.id;

  update public.website_site_revisions
  set status = 'published', published_at = now(), archived_at = null,
      content_fingerprint = v_fingerprint, updated_at = now()
  where id = v_revision_id and website_site_id = v_site_id and status = 'draft';

  if not found then
    raise exception 'The LWP revision could not be published.';
  end if;

  update public.website_sites
  set status = 'published', published_revision_id = v_revision_id, updated_at = now()
  where id = v_site_id and organisation_id = v_org_id;

  insert into public.website_publication_events (
    website_site_id, organisation_id, actor_user_id, action, from_revision_id,
    source_revision_id, to_revision_id, content_fingerprint, metadata_json
  )
  select revision.website_site_id, v_org_id, null, 'published', null,
         revision.source_revision_id, revision.id, v_fingerprint,
         jsonb_build_object('source', 'approved LWP preview domain release')
  from public.website_site_revisions revision
  where revision.id = v_revision_id;
end;
$$;

commit;
