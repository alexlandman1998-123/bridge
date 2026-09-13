begin;

-- Blog rows are immutable revision content, just like website_pages. This keeps
-- an unfinished article out of both the public site and a prior live revision.
update public.website_blog_posts post
set revision_id = coalesce(
  (select revision.id from public.website_site_revisions revision where revision.website_site_id = post.website_site_id and revision.status = 'draft' order by revision.revision_number desc limit 1),
  (select revision.id from public.website_site_revisions revision where revision.website_site_id = post.website_site_id and revision.status = 'published' limit 1)
)
where post.revision_id is null;

do $$
begin
  if exists (select 1 from public.website_blog_posts where revision_id is null) then
    raise exception 'Every website blog post must belong to a website revision before revision publishing can be enabled.' using errcode = '23514';
  end if;
end;
$$;

update public.website_blog_posts post
set status = case when revision.status = 'published' then 'published' else 'draft' end,
    published_at = case when revision.status = 'published' then coalesce(post.published_at, now()) else null end
from public.website_site_revisions revision
where revision.id = post.revision_id
  and (post.status is distinct from case when revision.status = 'published' then 'published' else 'draft' end
    or (revision.status = 'published' and post.published_at is null)
    or (revision.status <> 'published' and post.published_at is not null));

alter table public.website_blog_posts drop constraint if exists website_blog_posts_revision_id_fkey;
alter table public.website_blog_posts add constraint website_blog_posts_revision_id_fkey
  foreign key (revision_id) references public.website_site_revisions(id) on delete cascade;
alter table public.website_blog_posts alter column revision_id set not null;

drop index if exists public.website_blog_posts_site_slug_unique_idx;
create unique index website_blog_posts_revision_slug_unique_idx
  on public.website_blog_posts (website_site_id, revision_id, slug);
create index website_blog_posts_site_revision_idx
  on public.website_blog_posts (website_site_id, revision_id, updated_at desc);

-- Direct browser writes could mutate a published revision. Content changes now
-- travel only through the authenticated draft-save function below.
revoke insert, update, delete on table public.website_blog_posts from authenticated;

create or replace function public.website_save_draft_blog_post(
  p_website_site_id uuid,
  p_revision_id uuid,
  p_post_id uuid,
  p_title text,
  p_slug text,
  p_summary text,
  p_cover_image_url text,
  p_cover_image_alt text,
  p_body text,
  p_author_name text,
  p_seo_title text,
  p_seo_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_post public.website_blog_posts%rowtype;
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_title text := left(trim(coalesce(p_title, '')), 160);
  v_cover_url text := nullif(trim(coalesce(p_cover_image_url, '')), '');
  v_cover_alt text := nullif(trim(coalesce(p_cover_image_alt, '')), '');
begin
  if v_user_id is null then raise exception 'Authentication is required to edit a website article.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then raise exception 'Only organisation administrators can edit website articles.' using errcode = '42501'; end if;
  if not exists (select 1 from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = v_site.id and revision.status = 'draft') then
    raise exception 'Create or select an editable website draft before saving an article.' using errcode = 'P0002';
  end if;
  if v_title = '' or v_slug = '' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) > 80 then
    raise exception 'Article title and URL must use lowercase words and hyphens.' using errcode = '22023';
  end if;
  if v_cover_url is not null and v_cover_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Use a secure https URL for the article cover image.' using errcode = '22023';
  end if;
  if v_cover_url is not null and v_cover_alt is null then
    raise exception 'Add alt text describing the article cover image.' using errcode = '22023';
  end if;

  if p_post_id is null then
    insert into public.website_blog_posts (
      organisation_id, website_site_id, revision_id, title, slug, summary,
      cover_image_url, cover_image_alt, body, author_name, status, published_at,
      seo_title, seo_description, created_by, updated_by
    ) values (
      v_site.organisation_id, v_site.id, p_revision_id, v_title, v_slug,
      left(coalesce(p_summary, ''), 600), v_cover_url, v_cover_alt,
      left(coalesce(p_body, ''), 50000), left(coalesce(p_author_name, ''), 160),
      'draft', null, nullif(left(trim(coalesce(p_seo_title, '')), 180), ''),
      nullif(left(trim(coalesce(p_seo_description, '')), 320), ''), v_user_id, v_user_id
    ) returning * into v_post;
  else
    update public.website_blog_posts post
    set title = v_title, slug = v_slug, summary = left(coalesce(p_summary, ''), 600),
        cover_image_url = v_cover_url, cover_image_alt = v_cover_alt,
        body = left(coalesce(p_body, ''), 50000), author_name = left(coalesce(p_author_name, ''), 160),
        status = 'draft', published_at = null,
        seo_title = nullif(left(trim(coalesce(p_seo_title, '')), 180), ''),
        seo_description = nullif(left(trim(coalesce(p_seo_description, '')), 320), ''),
        updated_by = v_user_id, updated_at = now()
    where post.id = p_post_id and post.website_site_id = v_site.id and post.revision_id = p_revision_id
    returning * into v_post;
    if not found then raise exception 'An editable article was not found in this website draft.' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_post.id, 'revisionId', v_post.revision_id, 'title', v_post.title, 'slug', v_post.slug, 'status', v_post.status, 'updatedAt', v_post.updated_at);
exception when unique_violation then
  raise exception 'That article URL is already in use in this website draft.' using errcode = '23505';
end;
$$;

-- Preserve existing readiness checks (including durable-brand checks), then
-- add revision-aware article counts and a small, accurate draft-change count.
alter function public.website_revision_readiness(uuid, uuid) rename to website_revision_readiness_brand;

create or replace function public.website_revision_readiness(
  p_website_site_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_revision public.website_site_revisions%rowtype;
  v_blog_count integer := 0;
  v_page_changes integer := 0;
  v_blog_changes integer := 0;
  v_brand_changes integer := 0;
  v_fingerprint text;
begin
  v_result := public.website_revision_readiness_brand(p_website_site_id, p_revision_id);
  select revision.* into v_revision from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = p_website_site_id;
  if not found then return v_result; end if;

  select count(*)::integer into v_blog_count from public.website_blog_posts post where post.website_site_id = p_website_site_id and post.revision_id = p_revision_id;
  if v_revision.source_revision_id is null then
    v_page_changes := coalesce((v_result ->> 'pageCount')::integer, 0);
    v_blog_changes := v_blog_count;
    v_brand_changes := 1;
  else
    select count(*)::integer into v_page_changes
    from public.website_pages draft
    left join public.website_pages source on source.website_site_id = draft.website_site_id and source.revision_id = v_revision.source_revision_id and source.page_kind = draft.page_kind and source.slug = draft.slug
    where draft.website_site_id = p_website_site_id and draft.revision_id = p_revision_id
      and (source.id is null or row(draft.title, draft.seo_title, draft.seo_description, draft.social_image_url, draft.content_blocks) is distinct from row(source.title, source.seo_title, source.seo_description, source.social_image_url, source.content_blocks));
    select v_page_changes + count(*)::integer into v_page_changes
    from public.website_pages source
    where source.website_site_id = p_website_site_id and source.revision_id = v_revision.source_revision_id
      and not exists (select 1 from public.website_pages draft where draft.website_site_id = source.website_site_id and draft.revision_id = p_revision_id and draft.page_kind = source.page_kind and draft.slug = source.slug);
    select count(*)::integer into v_blog_changes
    from public.website_blog_posts draft
    left join public.website_blog_posts source on source.website_site_id = draft.website_site_id and source.revision_id = v_revision.source_revision_id and source.slug = draft.slug
    where draft.website_site_id = p_website_site_id and draft.revision_id = p_revision_id
      and (source.id is null or row(draft.title, draft.summary, draft.cover_image_url, draft.cover_image_alt, draft.body, draft.author_name, draft.seo_title, draft.seo_description) is distinct from row(source.title, source.summary, source.cover_image_url, source.cover_image_alt, source.body, source.author_name, source.seo_title, source.seo_description));
    select v_blog_changes + count(*)::integer into v_blog_changes
    from public.website_blog_posts source
    where source.website_site_id = p_website_site_id and source.revision_id = v_revision.source_revision_id
      and not exists (select 1 from public.website_blog_posts draft where draft.website_site_id = source.website_site_id and draft.revision_id = p_revision_id and draft.slug = source.slug);
    select case
      when row(v_revision.brand_json, v_revision.seo_json, v_revision.navigation_json)
        is distinct from row(source.brand_json, source.seo_json, source.navigation_json)
      then 1 else 0 end
    into v_brand_changes
    from public.website_site_revisions source
    where source.id = v_revision.source_revision_id;
    v_brand_changes := coalesce(v_brand_changes, 1);
  end if;
  select md5(coalesce(v_result ->> 'contentFingerprint', '') || '|' || coalesce(string_agg(post.slug || ':' || post.title || ':' || post.summary || ':' || coalesce(post.cover_image_url, '') || ':' || coalesce(post.cover_image_alt, '') || ':' || post.body || ':' || post.author_name || ':' || coalesce(post.seo_title, '') || ':' || coalesce(post.seo_description, ''), '||' order by post.slug), ''))
  into v_fingerprint from public.website_blog_posts post where post.website_site_id = p_website_site_id and post.revision_id = p_revision_id;
  v_result := jsonb_set(v_result, '{blogPostCount}', to_jsonb(v_blog_count), true);
  v_result := jsonb_set(v_result, '{changesReadyCount}', to_jsonb(v_page_changes + v_blog_changes + v_brand_changes), true);
  v_result := jsonb_set(v_result, '{contentFingerprint}', to_jsonb(v_fingerprint), true);
  return v_result;
end;
$$;

alter function public.website_create_draft_revision(uuid) rename to website_create_draft_revision_core;
create or replace function public.website_create_draft_revision(p_website_site_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_draft_id uuid; v_source_id uuid; v_actor_id uuid := auth.uid();
begin
  v_draft_id := public.website_create_draft_revision_core(p_website_site_id);
  select revision.source_revision_id into v_source_id from public.website_site_revisions revision where revision.id = v_draft_id;
  if v_source_id is not null and not exists (select 1 from public.website_blog_posts where revision_id = v_draft_id) then
    insert into public.website_blog_posts (organisation_id, website_site_id, revision_id, title, slug, summary, cover_image_url, cover_image_alt, body, author_name, status, published_at, seo_title, seo_description, created_by, updated_by)
    select post.organisation_id, post.website_site_id, v_draft_id, post.title, post.slug, post.summary, post.cover_image_url, post.cover_image_alt, post.body, post.author_name, 'draft', null, post.seo_title, post.seo_description, v_actor_id, v_actor_id
    from public.website_blog_posts post where post.website_site_id = p_website_site_id and post.revision_id = v_source_id;
  end if;
  return v_draft_id;
end;
$$;

alter function public.website_publish_revision(uuid, uuid) rename to website_publish_revision_core;
create or replace function public.website_publish_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_result uuid;
begin
  v_result := public.website_publish_revision_core(p_website_site_id, p_revision_id);
  update public.website_blog_posts set status = 'published', published_at = coalesce(published_at, now()) where website_site_id = p_website_site_id and revision_id = v_result;
  return v_result;
end;
$$;

alter function public.website_rollback_revision(uuid, uuid) rename to website_rollback_revision_core;
create or replace function public.website_rollback_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_result uuid; v_actor_id uuid := auth.uid();
begin
  v_result := public.website_rollback_revision_core(p_website_site_id, p_revision_id);
  insert into public.website_blog_posts (organisation_id, website_site_id, revision_id, title, slug, summary, cover_image_url, cover_image_alt, body, author_name, status, published_at, seo_title, seo_description, created_by, updated_by)
  select post.organisation_id, post.website_site_id, v_result, post.title, post.slug, post.summary, post.cover_image_url, post.cover_image_alt, post.body, post.author_name, 'published', now(), post.seo_title, post.seo_description, v_actor_id, v_actor_id
  from public.website_blog_posts post where post.website_site_id = p_website_site_id and post.revision_id = p_revision_id;
  return v_result;
end;
$$;

alter function public.website_discard_draft_revision(uuid, uuid) rename to website_discard_draft_revision_core;
create or replace function public.website_discard_draft_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid language sql security definer set search_path = '' as $$
  select public.website_discard_draft_revision_core(p_website_site_id, p_revision_id);
$$;

revoke all on function public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.website_revision_readiness_brand(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_create_draft_revision_core(uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_publish_revision_core(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_rollback_revision_core(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_discard_draft_revision_core(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_revision_readiness(uuid, uuid) from public, anon;
revoke all on function public.website_create_draft_revision(uuid) from public, anon;
revoke all on function public.website_publish_revision(uuid, uuid) from public, anon;
revoke all on function public.website_rollback_revision(uuid, uuid) from public, anon;
revoke all on function public.website_discard_draft_revision(uuid, uuid) from public, anon;
grant execute on function public.website_revision_readiness(uuid, uuid) to authenticated;
grant execute on function public.website_create_draft_revision(uuid) to authenticated;
grant execute on function public.website_publish_revision(uuid, uuid) to authenticated;
grant execute on function public.website_rollback_revision(uuid, uuid) to authenticated;
grant execute on function public.website_discard_draft_revision(uuid, uuid) to authenticated;

comment on table public.website_blog_posts is 'Revision-scoped organisation website articles. Only rows in the published site revision may be served publicly.';
notify pgrst, 'reload schema';
commit;
