begin;

-- A Website Studio publish changes two related rows: the revision becomes
-- published and the website pointer moves to that exact revision.  Keep the
-- invariant triggers deferred so the guarded command can perform that atomic
-- hand-off without exposing an intermediate, invalid state.
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

-- The blog wrapper calls this core function.  Define the hand-off here rather
-- than relying on an older renamed function body, which could publish a
-- revision without moving the site's current-revision pointer.
create or replace function public.website_publish_revision_core(
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
  v_revision public.website_site_revisions%rowtype;
  v_readiness jsonb;
  v_previous_id uuid;
  v_fingerprint text;
begin
  -- Make the revision-state and pointer updates one commit-time invariant.
  set constraints all deferred;

  if v_user_id is null then
    raise exception 'Authentication is required to publish a website.' using errcode = '42501';
  end if;

  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id
  for update;
  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can publish a website.' using errcode = '42501';
  end if;

  select revision.* into v_revision
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'draft'
  for update;
  if not found then
    raise exception 'A publishable draft revision was not found.' using errcode = 'P0002';
  end if;

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
  set status = 'published',
      published_at = now(),
      published_by = v_user_id,
      archived_at = null,
      content_fingerprint = v_fingerprint,
      updated_at = now()
  where revision.id = v_revision.id;

  update public.website_sites site
  set status = 'published',
      published_revision_id = v_revision.id,
      updated_at = now()
  where site.id = v_site.id;

  insert into public.website_publication_events (
    website_site_id,
    organisation_id,
    actor_user_id,
    action,
    from_revision_id,
    source_revision_id,
    to_revision_id,
    content_fingerprint,
    metadata_json
  ) values (
    v_site.id,
    v_site.organisation_id,
    v_user_id,
    'published',
    v_previous_id,
    v_revision.source_revision_id,
    v_revision.id,
    v_fingerprint,
    jsonb_build_object('revisionNumber', v_revision.revision_number, 'readiness', v_readiness)
  );

  return v_revision.id;
end;
$$;

notify pgrst, 'reload schema';
commit;
