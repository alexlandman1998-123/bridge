begin;

-- Retain completed provider receipts after an authorised listing deletion.
-- These snapshots deliberately have no listing FK and no browser grants.
create table if not exists public.rental_publication_attempt_archives (
  attempt_id uuid primary key,
  source_listing_id uuid not null,
  organisation_id uuid not null,
  listing_snapshot jsonb not null check(jsonb_typeof(listing_snapshot) = 'object'),
  attempt_record jsonb not null check(jsonb_typeof(attempt_record) = 'object'),
  archived_at timestamptz not null default clock_timestamp(),
  archived_by uuid
);
alter table public.rental_publication_attempt_archives enable row level security;
revoke all on public.rental_publication_attempt_archives from public, anon, authenticated, service_role;
grant select, insert on public.rental_publication_attempt_archives to service_role;
comment on table public.rental_publication_attempt_archives is
  'Server-only snapshots of completed portal attempts, retained independently of permanently deleted listings.';

create or replace function public.delete_private_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_listing public.private_listings%rowtype;
  v_launch record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to delete a listing.' using errcode = '42501';
  end if;

  select *
  into v_listing
  from public.private_listings
  where id = p_listing_id
  for update;

  if not found then
    return jsonb_build_object(
      'deleted', true,
      'mode', 'already_removed',
      'listing', jsonb_build_object('id', p_listing_id)
    );
  end if;

  if not public.bridge_is_active_member(v_listing.organisation_id)
     or (
       not public.bridge_is_org_admin(v_listing.organisation_id)
       and v_listing.assigned_agent_id is distinct from auth.uid()
       and v_listing.created_by is distinct from auth.uid()
     ) then
    raise exception 'You do not have permission to permanently delete this listing. Ask its assigned agent or an organisation administrator.'
      using errcode = '42501';
  end if;

  -- Sales and rental records share this check under the listing row lock.
  -- Never remove a record while its saved portal state or website publication
  -- still indicates an active/pending advert.
  if regexp_replace(lower(trim(coalesce(v_listing.property24_status, ''))), '[[:space:]-]+', '_', 'g') in
       ('active','live','published','on_portal','current','pending','accepted','submitted','queued','publishing','updating','syncing','awaiting_verification','uncertain','backonmarket','back_on_market')
     or regexp_replace(lower(trim(coalesce(v_listing.private_property_status, ''))), '[[:space:]-]+', '_', 'g') in
       ('active','live','published','current','tolet','to_let','to_rent','torent','pending','accepted','submitted','queued','publishing','updating','syncing','awaiting_verification','uncertain')
     or exists (select 1 from public.property24_listing_syncs where private_listing_id = p_listing_id and environment = 'production' and is_on_portal is true)
     or exists (select 1 from public.private_property_listing_syncs where private_listing_id = p_listing_id and environment = 'production' and is_on_portal is true)
     or public.website_get_listing_publication_status(p_listing_id)->>'status' = 'published'
     or public.website_get_partner_listing_status(p_listing_id)->>'status' = 'published'
     or exists (select 1 from public.website_partner_listing_publications
       where listing_id = p_listing_id and status = 'published') then
    return jsonb_build_object('deleted', false, 'code', 'listing_must_be_withdrawn',
      'message', 'Withdraw this listing from every live channel and confirm removal before permanently deleting it.');
  end if;

  -- The parent FOR UPDATE lock also stops new FK-linked attempts from being
  -- inserted during deletion. Lock existing journal rows before inspecting them.
  perform 1 from public.rental_publication_attempts
  where private_listing_id = p_listing_id for update;
  if exists (
    select 1 from public.rental_publication_attempts
    where private_listing_id = p_listing_id
      and (state not in ('accepted', 'rejected', 'reconciled') or resolved_at is null)
  ) then
    return jsonb_build_object('deleted', false, 'code', 'listing_portal_request_pending',
      'message', 'A portal request still has an unconfirmed outcome. Check its status before permanently deleting this listing.');
  end if;

  select id, status
  into v_launch
  from public.website_production_dark_launches
  where listing_id = p_listing_id
  for update;

  if found and v_launch.status is distinct from 'rolled_back' then
    return jsonb_build_object(
      'deleted', false,
      'code', 'website_launch_must_be_rolled_back',
      'message', 'This listing is used by a website launch. Roll back that launch before permanently deleting the listing.',
      'websiteLaunchId', v_launch.id,
      'websiteLaunchStatus', v_launch.status
    );
  end if;

  -- Preserve the audit record for a rolled-back launch while releasing the listing.
  if found then
    update public.website_production_dark_launches
    set listing_id = null
    where id = v_launch.id;
  end if;

  begin
    -- Keep this cleanup in the same exception subtransaction as the listing
    -- delete: a genuine linked-workflow failure must restore the projection.
    delete from public.website_partner_listing_publications
    where listing_id = p_listing_id and status = 'unpublished';

    -- Archive and release only terminal, resolved attempts. A later FK failure
    -- rolls this back together with the unpublished website cleanup.
    insert into public.rental_publication_attempt_archives
      (attempt_id, source_listing_id, organisation_id, listing_snapshot, attempt_record, archived_by)
    select attempt.id, v_listing.id, v_listing.organisation_id,
      jsonb_build_object('id', v_listing.id, 'listing_reference', v_listing.listing_reference,
        'arch9_reference', to_jsonb(v_listing)->>'arch9_reference', 'title', v_listing.title),
      to_jsonb(attempt), auth.uid()
    from public.rental_publication_attempts attempt
    where attempt.private_listing_id = p_listing_id
      and attempt.state in ('accepted', 'rejected', 'reconciled') and attempt.resolved_at is not null;

    delete from public.rental_publication_attempts
    where private_listing_id = p_listing_id
      and state in ('accepted', 'rejected', 'reconciled') and resolved_at is not null;

    delete from public.private_listings where id = p_listing_id;
  exception
    when foreign_key_violation then
      raise exception 'This listing still has linked records and cannot be permanently deleted. Resolve its linked workflow first.'
        using errcode = '23503';
  end;

  return jsonb_build_object(
    'deleted', true,
    'mode', 'hard',
    'listing', jsonb_build_object(
      'id', v_listing.id,
      'organisation_id', v_listing.organisation_id,
      'seller_lead_id', v_listing.seller_lead_id,
      'originating_crm_lead_id', v_listing.originating_crm_lead_id,
      'listing_reference', v_listing.listing_reference,
      'title', v_listing.title
    )
  );
end;
$$;

revoke all on function public.delete_private_listing(uuid) from public;
grant execute on function public.delete_private_listing(uuid) to authenticated;

commit;
