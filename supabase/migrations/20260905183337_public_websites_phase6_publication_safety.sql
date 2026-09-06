begin;

alter table public.website_site_revisions
  add column if not exists source_revision_id uuid references public.website_site_revisions(id) on delete set null,
  add column if not exists content_fingerprint text,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz;

alter table public.website_sites
  add column if not exists published_revision_id uuid;

create unique index if not exists website_site_revisions_id_site_unique_idx
  on public.website_site_revisions (id, website_site_id);
create unique index if not exists website_sites_id_organisation_unique_idx
  on public.website_sites (id, organisation_id);

update public.website_sites site
set published_revision_id = (
  select revision.id
  from public.website_site_revisions revision
  where revision.website_site_id = site.id
    and revision.status = 'published'
  order by revision.revision_number desc
  limit 1
)
where site.published_revision_id is null;

alter table public.website_sites
  drop constraint if exists website_sites_published_revision_site_fkey;
alter table public.website_sites
  add constraint website_sites_published_revision_site_fkey
  foreign key (published_revision_id, id)
  references public.website_site_revisions(id, website_site_id)
  deferrable initially deferred;

do $$
begin
  if exists (select 1 from public.website_pages where revision_id is null) then
    raise exception 'Website publication safety cannot be enabled while revision-less pages exist.';
  end if;
end;
$$;

alter table public.website_pages alter column revision_id set not null;
alter table public.website_pages
  drop constraint if exists website_pages_revision_site_fkey;
alter table public.website_pages
  add constraint website_pages_revision_site_fkey
  foreign key (revision_id, website_site_id)
  references public.website_site_revisions(id, website_site_id)
  on delete cascade;

do $$
begin
  if exists (
    select 1
    from public.website_sites site
    where site.status = 'published'
      and (
        site.published_revision_id is null
        or not exists (
          select 1
          from public.website_site_revisions revision
          where revision.id = site.published_revision_id
            and revision.website_site_id = site.id
            and revision.status = 'published'
        )
      )
  ) or exists (
    select 1
    from public.website_site_revisions revision
    join public.website_sites site on site.id = revision.website_site_id
    where revision.status = 'published'
      and (
        site.status not in ('published', 'suspended')
        or site.published_revision_id is distinct from revision.id
      )
  ) then
    raise exception 'Website publication safety cannot be enabled while a published site or revision has an inconsistent pointer.';
  end if;
end;
$$;

create or replace function public.website_enforce_published_revision_pointer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
begin
  if tg_table_name = 'website_sites' then
    if new.status = 'published' then
      if new.published_revision_id is null then
        raise exception 'A published website requires an exact published revision pointer.' using errcode = '23514';
      end if;
      select revision.* into v_revision
      from public.website_site_revisions revision
      where revision.id = new.published_revision_id
        and revision.website_site_id = new.id
        and revision.status = 'published';
      if not found then
        raise exception 'The website published revision pointer is inconsistent.' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if new.status = 'published' then
    select site.* into v_site
    from public.website_sites site
    where site.id = new.website_site_id
      and site.status in ('published', 'suspended')
      and site.published_revision_id = new.id;
    if not found then
      raise exception 'A published revision must be the owning website current pointer.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_website_sites_published_revision_pointer on public.website_sites;
create constraint trigger trg_website_sites_published_revision_pointer
after insert or update on public.website_sites
deferrable initially deferred
for each row execute function public.website_enforce_published_revision_pointer();

drop trigger if exists trg_website_revisions_published_pointer on public.website_site_revisions;
create constraint trigger trg_website_revisions_published_pointer
after insert or update on public.website_site_revisions
deferrable initially deferred
for each row execute function public.website_enforce_published_revision_pointer();

create table if not exists public.website_publication_events (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null,
  organisation_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('draft_created', 'draft_discarded', 'published', 'rolled_back')),
  from_revision_id uuid references public.website_site_revisions(id) on delete set null,
  source_revision_id uuid references public.website_site_revisions(id) on delete set null,
  to_revision_id uuid references public.website_site_revisions(id) on delete set null,
  content_fingerprint text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint website_publication_events_metadata_object_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint website_publication_events_site_organisation_fkey
    foreign key (website_site_id, organisation_id)
    references public.website_sites(id, organisation_id)
    on delete cascade
);

create index if not exists website_publication_events_site_created_idx
  on public.website_publication_events (website_site_id, created_at desc);
create index if not exists website_publication_events_org_created_idx
  on public.website_publication_events (organisation_id, created_at desc);

alter table public.website_publication_events enable row level security;
revoke all on table public.website_publication_events from public, anon, authenticated, service_role;
grant select on table public.website_publication_events to authenticated;
grant select, insert on table public.website_publication_events to service_role;

drop policy if exists website_publication_events_admin_select on public.website_publication_events;
create policy website_publication_events_admin_select
on public.website_publication_events
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

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
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_page public.website_pages%rowtype;
  v_page_count integer := 0;
  v_campaign_count integer := 0;
  v_active_domain_count integer := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_fingerprint text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to inspect website publication readiness.' using errcode = '42501';
  end if;

  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id;
  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can inspect website publication readiness.' using errcode = '42501';
  end if;

  select revision.* into v_revision
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id;
  if not found then
    raise exception 'Website revision not found.' using errcode = 'P0002';
  end if;

  if v_revision.status not in ('draft', 'archived') then
    v_blockers := v_blockers || to_jsonb('Only a draft or archived revision can be checked for publication.'::text);
  end if;
  if jsonb_typeof(v_revision.brand_json) <> 'object'
    or nullif(trim(v_revision.brand_json ->> 'name'), '') is null then
    v_blockers := v_blockers || to_jsonb('Add the agency display name before publishing.'::text);
  end if;
  if coalesce(v_revision.brand_json ->> 'primaryColor', '') !~ '^#[0-9a-fA-F]{6}$'
    or coalesce(v_revision.brand_json ->> 'secondaryColor', '') !~ '^#[0-9a-fA-F]{6}$'
    or coalesce(v_revision.brand_json ->> 'accentColor', '') !~ '^#[0-9a-fA-F]{6}$' then
    v_blockers := v_blockers || to_jsonb('Primary, secondary and accent colours must be complete six-digit hex values.'::text);
  end if;
  if jsonb_typeof(v_revision.navigation_json) <> 'array' or jsonb_array_length(v_revision.navigation_json) < 1 then
    v_blockers := v_blockers || to_jsonb('Add at least one navigation destination before publishing.'::text);
  end if;

  select count(*)::integer,
         count(*) filter (where page.page_kind = 'campaign')::integer
  into v_page_count, v_campaign_count
  from public.website_pages page
  where page.website_site_id = v_site.id
    and page.revision_id = v_revision.id;

  if (select count(*) from public.website_pages page where page.revision_id = v_revision.id and page.page_kind = 'home') <> 1
    or (select count(*) from public.website_pages page where page.revision_id = v_revision.id and page.page_kind = 'about') <> 1
    or (select count(*) from public.website_pages page where page.revision_id = v_revision.id and page.page_kind = 'contact') <> 1
    or (select count(*) from public.website_pages page where page.revision_id = v_revision.id and page.page_kind = 'valuation') <> 1 then
    v_blockers := v_blockers || to_jsonb('The revision must contain exactly one Home, About, Contact and Valuation page.'::text);
  end if;

  for v_page in
    select page.*
    from public.website_pages page
    where page.website_site_id = v_site.id
      and page.revision_id = v_revision.id
    order by page.page_kind, page.slug
  loop
    begin
      perform public.website_validate_page_content(v_page.page_kind, v_page.content_blocks);
    exception when others then
      v_blockers := v_blockers || to_jsonb((v_page.title || ': ' || sqlerrm)::text);
    end;
  end loop;

  select count(*)::integer into v_active_domain_count
  from public.website_domains domain
  where domain.website_site_id = v_site.id
    and domain.status = 'active';
  if v_active_domain_count < 1 then
    v_blockers := v_blockers || to_jsonb('Activate the managed preview domain before publishing.'::text);
  end if;

  select pg_catalog.md5(
    v_revision.brand_json::text || '|' || v_revision.seo_json::text || '|' || v_revision.navigation_json::text || '|' ||
    coalesce(string_agg(
      page.page_kind || ':' || page.slug || ':' || page.title || ':' || coalesce(page.seo_title, '') || ':' ||
      coalesce(page.seo_description, '') || ':' || coalesce(page.social_image_url, '') || ':' || page.content_blocks::text,
      '||' order by page.page_kind, page.slug
    ), '')
  ) into v_fingerprint
  from public.website_pages page
  where page.website_site_id = v_site.id
    and page.revision_id = v_revision.id;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'pageCount', v_page_count,
    'campaignCount', v_campaign_count,
    'activeDomainCount', v_active_domain_count,
    'contentFingerprint', v_fingerprint,
    'revisionId', v_revision.id,
    'revisionNumber', v_revision.revision_number
  );
end;
$$;

create or replace function public.website_create_draft_revision(p_website_site_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_source public.website_site_revisions%rowtype;
  v_draft_id uuid;
  v_revision_number integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to create a website draft.' using errcode = '42501';
  end if;
  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id
  for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can create website drafts.' using errcode = '42501';
  end if;

  select revision.id into v_draft_id
  from public.website_site_revisions revision
  where revision.website_site_id = v_site.id and revision.status = 'draft'
  order by revision.revision_number desc
  limit 1;
  if v_draft_id is not null then return v_draft_id; end if;
  if v_site.published_revision_id is null then
    raise exception 'Publish the initial website revision before creating another draft.' using errcode = 'P0001';
  end if;

  select revision.* into v_source
  from public.website_site_revisions revision
  where revision.id = v_site.published_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'published';
  if not found then
    raise exception 'The site published revision pointer is invalid.' using errcode = '23514';
  end if;
  select coalesce(max(revision.revision_number), 0) + 1 into v_revision_number
  from public.website_site_revisions revision
  where revision.website_site_id = v_site.id;

  insert into public.website_site_revisions (
    website_site_id, revision_number, status, brand_json, seo_json,
    navigation_json, created_by, source_revision_id
  ) values (
    v_site.id, v_revision_number, 'draft', v_source.brand_json, v_source.seo_json,
    v_source.navigation_json, v_user_id, v_source.id
  ) returning id into v_draft_id;

  insert into public.website_pages (
    website_site_id, revision_id, page_kind, slug, title, seo_title,
    seo_description, social_image_url, content_blocks
  )
  select page.website_site_id, v_draft_id, page.page_kind, page.slug, page.title,
         page.seo_title, page.seo_description, page.social_image_url, page.content_blocks
  from public.website_pages page
  where page.website_site_id = v_site.id and page.revision_id = v_source.id;

  insert into public.website_publication_events (
    website_site_id, organisation_id, actor_user_id, action,
    source_revision_id, to_revision_id, metadata_json
  ) values (
    v_site.id, v_site.organisation_id, v_user_id, 'draft_created',
    v_source.id, v_draft_id, jsonb_build_object('revisionNumber', v_revision_number)
  );
  return v_draft_id;
end;
$$;

create or replace function public.website_publish_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_revision public.website_site_revisions%rowtype;
  v_readiness jsonb;
  v_previous_id uuid;
  v_fingerprint text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to publish a website.' using errcode = '42501';
  end if;
  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id
  for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can publish a website.' using errcode = '42501';
  end if;
  select revision.* into v_revision
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'draft'
  for update;
  if not found then raise exception 'A publishable draft revision was not found.' using errcode = 'P0002'; end if;

  v_readiness := public.website_revision_readiness(v_site.id, v_revision.id);
  if not coalesce((v_readiness ->> 'ready')::boolean, false) then
    raise exception 'Website revision is not ready: %', v_readiness -> 'blockers' using errcode = '23514';
  end if;
  v_fingerprint := v_readiness ->> 'contentFingerprint';
  v_previous_id := v_site.published_revision_id;

  if v_previous_id is not null then
    update public.website_site_revisions revision
    set status = 'archived', archived_at = now(), updated_at = now()
    where revision.id = v_previous_id
      and revision.website_site_id = v_site.id
      and revision.status = 'published';
    if not found then
      raise exception 'The current published revision could not be archived.' using errcode = '23514';
    end if;
  end if;

  update public.website_site_revisions revision
  set status = 'published', published_at = now(), published_by = v_user_id,
      archived_at = null, content_fingerprint = v_fingerprint, updated_at = now()
  where revision.id = v_revision.id;
  update public.website_sites site
  set status = 'published', published_revision_id = v_revision.id, updated_at = now()
  where site.id = v_site.id;

  insert into public.website_publication_events (
    website_site_id, organisation_id, actor_user_id, action, from_revision_id,
    source_revision_id, to_revision_id, content_fingerprint, metadata_json
  ) values (
    v_site.id, v_site.organisation_id, v_user_id, 'published', v_previous_id,
    v_revision.source_revision_id, v_revision.id, v_fingerprint,
    jsonb_build_object('revisionNumber', v_revision.revision_number, 'readiness', v_readiness)
  );
  return v_revision.id;
end;
$$;

create or replace function public.website_rollback_revision(p_website_site_id uuid, p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_source public.website_site_revisions%rowtype;
  v_new_id uuid;
  v_revision_number integer;
  v_readiness jsonb;
  v_fingerprint text;
  v_previous_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to roll back a website.' using errcode = '42501';
  end if;
  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id
  for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can roll back a website.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.website_site_revisions revision
    where revision.website_site_id = v_site.id and revision.status = 'draft'
  ) then
    raise exception 'Discard or publish the current draft before restoring a prior revision.' using errcode = '55000';
  end if;

  select revision.* into v_source
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'archived'
  for update;
  if not found then raise exception 'An archived revision was not found for rollback.' using errcode = 'P0002'; end if;

  v_readiness := public.website_revision_readiness(v_site.id, v_source.id);
  if not coalesce((v_readiness ->> 'ready')::boolean, false) then
    raise exception 'Archived revision is not safe to restore: %', v_readiness -> 'blockers' using errcode = '23514';
  end if;
  v_fingerprint := v_readiness ->> 'contentFingerprint';
  select coalesce(max(revision.revision_number), 0) + 1 into v_revision_number
  from public.website_site_revisions revision
  where revision.website_site_id = v_site.id;

  insert into public.website_site_revisions (
    website_site_id, revision_number, status, brand_json, seo_json, navigation_json,
    created_by, source_revision_id, content_fingerprint
  ) values (
    v_site.id, v_revision_number, 'draft', v_source.brand_json, v_source.seo_json,
    v_source.navigation_json, v_user_id, v_source.id, v_fingerprint
  ) returning id into v_new_id;
  insert into public.website_pages (
    website_site_id, revision_id, page_kind, slug, title, seo_title,
    seo_description, social_image_url, content_blocks
  )
  select page.website_site_id, v_new_id, page.page_kind, page.slug, page.title,
         page.seo_title, page.seo_description, page.social_image_url, page.content_blocks
  from public.website_pages page
  where page.website_site_id = v_site.id and page.revision_id = v_source.id;

  v_previous_id := v_site.published_revision_id;
  update public.website_site_revisions revision
  set status = 'archived', archived_at = now(), updated_at = now()
  where revision.id = v_previous_id
    and revision.website_site_id = v_site.id
    and revision.status = 'published';
  if not found then raise exception 'The current published revision could not be archived.' using errcode = '23514'; end if;
  update public.website_site_revisions revision
  set status = 'published', published_at = now(), published_by = v_user_id,
      archived_at = null, updated_at = now()
  where revision.id = v_new_id;
  update public.website_sites site
  set status = 'published', published_revision_id = v_new_id, updated_at = now()
  where site.id = v_site.id;

  insert into public.website_publication_events (
    website_site_id, organisation_id, actor_user_id, action, from_revision_id,
    source_revision_id, to_revision_id, content_fingerprint, metadata_json
  ) values (
    v_site.id, v_site.organisation_id, v_user_id, 'rolled_back', v_previous_id,
    v_source.id, v_new_id, v_fingerprint,
    jsonb_build_object('revisionNumber', v_revision_number, 'restoredRevisionNumber', v_source.revision_number)
  );
  return v_new_id;
end;
$$;

create or replace function public.website_discard_draft_revision(
  p_website_site_id uuid,
  p_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_revision_number integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to discard a website draft.' using errcode = '42501';
  end if;
  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id
  for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can discard website drafts.' using errcode = '42501';
  end if;
  if v_site.published_revision_id is null then
    raise exception 'The initial website draft cannot be discarded before first publication.' using errcode = '55000';
  end if;

  select revision.revision_number into v_revision_number
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'draft'
  for update;
  if not found then raise exception 'An editable website draft was not found.' using errcode = 'P0002'; end if;

  insert into public.website_publication_events (
    website_site_id, organisation_id, actor_user_id, action, metadata_json
  ) values (
    v_site.id, v_site.organisation_id, v_user_id, 'draft_discarded',
    jsonb_build_object('discardedRevisionId', p_revision_id, 'revisionNumber', v_revision_number)
  );
  delete from public.website_site_revisions revision where revision.id = p_revision_id;
  return p_revision_id;
end;
$$;

revoke insert, update, delete on table public.website_sites from authenticated;
revoke insert, update, delete on table public.website_domains from authenticated;
revoke insert, update, delete on table public.website_site_revisions from authenticated;
revoke insert, update, delete on table public.website_pages from authenticated;

revoke all on function public.website_revision_readiness(uuid, uuid) from public, anon;
revoke all on function public.website_enforce_published_revision_pointer() from public, anon, authenticated, service_role;
revoke all on function public.website_create_draft_revision(uuid) from public, anon;
revoke all on function public.website_publish_revision(uuid, uuid) from public, anon;
revoke all on function public.website_rollback_revision(uuid, uuid) from public, anon;
revoke all on function public.website_discard_draft_revision(uuid, uuid) from public, anon;
grant execute on function public.website_revision_readiness(uuid, uuid) to authenticated;
grant execute on function public.website_create_draft_revision(uuid) to authenticated;
grant execute on function public.website_publish_revision(uuid, uuid) to authenticated;
grant execute on function public.website_rollback_revision(uuid, uuid) to authenticated;
grant execute on function public.website_discard_draft_revision(uuid, uuid) to authenticated;

comment on column public.website_sites.published_revision_id is
  'The single exact revision rendered publicly. Public reads must use this pointer rather than infer a revision from timestamps.';
comment on table public.website_publication_events is
  'Append-only audit evidence for website draft, publish, rollback and recovery actions.';
comment on function public.website_rollback_revision(uuid, uuid) is
  'Restores an archived revision by publishing a new immutable copy, retaining both the old and current history.';

notify pgrst, 'reload schema';
commit;
