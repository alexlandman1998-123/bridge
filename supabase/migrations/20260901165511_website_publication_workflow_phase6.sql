begin;

create or replace function public.website_create_draft_revision(p_website_site_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.website_sites%rowtype;
  v_source public.website_site_revisions%rowtype;
  v_draft_id uuid;
begin
  select * into v_site
  from public.website_sites
  where id = p_website_site_id
  for update;

  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can create website drafts.' using errcode = '42501';
  end if;

  select id into v_draft_id
  from public.website_site_revisions
  where website_site_id = v_site.id and status = 'draft'
  order by revision_number desc
  limit 1;
  if v_draft_id is not null then return v_draft_id; end if;

  select * into v_source
  from public.website_site_revisions
  where website_site_id = v_site.id and status = 'published'
  order by revision_number desc
  limit 1;
  if not found then
    raise exception 'Publish an initial website revision before creating a draft.' using errcode = 'P0001';
  end if;

  insert into public.website_site_revisions (
    website_site_id, revision_number, status, brand_json, seo_json, navigation_json, created_by
  ) values (
    v_site.id, v_source.revision_number + 1, 'draft', v_source.brand_json, v_source.seo_json, v_source.navigation_json, auth.uid()
  ) returning id into v_draft_id;

  insert into public.website_pages (
    website_site_id, revision_id, page_kind, slug, title, seo_title, seo_description, social_image_url, content_blocks
  )
  select website_site_id, v_draft_id, page_kind, slug, title, seo_title, seo_description, social_image_url, content_blocks
  from public.website_pages
  where website_site_id = v_site.id and revision_id = v_source.id;

  return v_draft_id;
end;
$$;

create or replace function public.website_publish_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
begin
  select * into v_site from public.website_sites where id = p_website_site_id for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can publish a website.' using errcode = '42501';
  end if;

  select * into v_revision
  from public.website_site_revisions
  where id = p_revision_id and website_site_id = v_site.id and status = 'draft'
  for update;
  if not found then raise exception 'A publishable draft revision was not found.' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.website_pages where website_site_id = v_site.id and revision_id = v_revision.id and page_kind = 'home'
  ) then
    raise exception 'A website revision requires a home page before publishing.' using errcode = '23514';
  end if;

  update public.website_site_revisions
  set status = 'archived'
  where website_site_id = v_site.id and status = 'published';
  update public.website_site_revisions
  set status = 'published', published_at = now()
  where id = v_revision.id;
  update public.website_sites set status = 'published' where id = v_site.id;

  return v_revision.id;
end;
$$;

create or replace function public.website_rollback_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.website_sites%rowtype;
begin
  select * into v_site from public.website_sites where id = p_website_site_id for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can roll back a website.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.website_site_revisions
    where id = p_revision_id and website_site_id = v_site.id and status = 'archived'
  ) then
    raise exception 'An archived revision was not found for rollback.' using errcode = 'P0002';
  end if;

  update public.website_site_revisions set status = 'archived' where website_site_id = v_site.id and status = 'published';
  update public.website_site_revisions set status = 'published', published_at = now() where id = p_revision_id;
  update public.website_sites set status = 'published' where id = v_site.id;
  return p_revision_id;
end;
$$;

revoke all on function public.website_create_draft_revision(uuid) from public, anon;
revoke all on function public.website_publish_revision(uuid, uuid) from public, anon;
revoke all on function public.website_rollback_revision(uuid, uuid) from public, anon;
grant execute on function public.website_create_draft_revision(uuid) to authenticated;
grant execute on function public.website_publish_revision(uuid, uuid) to authenticated;
grant execute on function public.website_rollback_revision(uuid, uuid) to authenticated;

comment on function public.website_create_draft_revision(uuid) is
  'Creates one draft by cloning the current published website revision and its structured pages. Authorised organisation admins only.';
comment on function public.website_publish_revision(uuid, uuid) is
  'Atomically replaces the published website revision after explicit organisation-admin authorisation.';
comment on function public.website_rollback_revision(uuid, uuid) is
  'Atomically restores an archived website revision after explicit organisation-admin authorisation.';

commit;
